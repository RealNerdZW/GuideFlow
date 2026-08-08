/**
 * The Recorder — the extension's authoring surface.
 *
 * This is the Builder tab, moved out of the DevTools panel and into an
 * ordinary extension page. The move is not cosmetic: **Playwright cannot open
 * a `devtools_page`**, and there is no CDP path to one either, so anything
 * living in the panel is unverifiable forever. An extension page opens at
 * `chrome-extension://<id>/recorder.html` and can be driven by a test.
 *
 * It also fixes three lifecycle defects structurally rather than by patching
 * them: draft state cannot be destroyed by a tab switch (there are no tabs),
 * recording state lives in the service worker (so closing this page does not
 * end it), and captured steps are buffered there (so none are dropped when no
 * page is listening).
 *
 * Everything it knows about flows comes from `@guideflow/core/authoring`, so
 * what you preview, what you save and what you export can no longer disagree.
 *
 * ── Editing a recorded draft ────────────────────────────────────────────────
 *
 * A recorder that can only append is abandoned the first time one step comes
 * out wrong, because the only repair is to record the whole session again. So
 * a step can be inserted anywhere, deleted, reordered, edited field by field,
 * and — the one that needs the page — pointed at a different element without
 * re-running the session. That last one reuses INSPECT mode rather than
 * recording: recording produces a stream and appends it, which is exactly the
 * shape that cannot fix a single step, while inspect captures one element and
 * reports it as `GF_ELEMENT_SELECTED`, which already routes to this page.
 *
 * Reordering has a keyboard path as well as drag-and-drop, and it is not a
 * courtesy: `dragstart` has no keyboard equivalent, so the buttons ARE the
 * feature for anyone not using a pointer. The list operations themselves are
 * pure functions in `steps.ts`, which is the only part of this file a unit
 * test can honestly own.
 */
import {
  draftToFlow,
  stringifyFlowFile,
  validateFlow,
  type FlowDraft,
  type FlowIssue,
  type LinearStep,
} from '@guideflow/core/authoring';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RecordedStep } from '../messages.js';

import { clearDraft, flushDraft, loadDraft, saveDraft, toDraftState } from './session.js';
import {
  appendCaptured,
  blankStep,
  conversionIssue,
  insertStepAt,
  moveStep,
  nextAnnouncement,
  patchStepAt,
  removeStepAt,
  setTargetById,
} from './steps.js';
import { S } from './styles.js';

declare const __GF_VERSION__: string;

// ── Talking to the service worker ──────────────────────────────────────────

interface SendResult {
  ok: boolean;
  error?: string;
  reply?: unknown;
}

/**
 * Send a command to the page being recorded, through the service worker.
 *
 * Never `chrome.tabs.sendMessage` directly: the panel did that and swallowed
 * the rejection, so a command that never arrived was indistinguishable from
 * one that worked.
 */
async function toTab(tabId: number, message: { type: string; payload?: unknown }): Promise<SendResult> {
  try {
    const reply: unknown = await chrome.runtime.sendMessage({
      type: 'GF_SEND_TO_TAB',
      payload: { tabId, message },
    });
    return (reply as SendResult | undefined) ?? { ok: false, error: 'no response' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

/** Where focus should land once the next step-list render has committed. */
type PendingFocus =
  | { kind: 'move'; id: string; dir: 'up' | 'down' }
  | { kind: 'title'; id: string }
  | null;

// ── Component ──────────────────────────────────────────────────────────────

export function RecorderApp({ tabId }: { tabId: number }): React.ReactElement {
  const [steps, setSteps] = useState<LinearStep[]>([]);
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<RecordedStep[]>([]);
  const [status, setStatus] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  /** The id of the step waiting for a freshly picked element, if any. */
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  /** Text for the live region. Every announcement in this page goes through it. */
  const [announcement, setAnnouncement] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * The same value as `pickingFor`, readable from the port listener.
   *
   * That listener is registered once, in an effect keyed on `tabId` alone, so
   * it closes over the FIRST render's state forever — reading `pickingFor`
   * there would always see `null` and every re-recorded selector would be
   * dropped on the floor. The two are only ever written together, by
   * `setPicking`.
   */
  const pickingForRef = useRef<string | null>(null);
  const setPicking = useCallback((id: string | null): void => {
    pickingForRef.current = id;
    setPickingFor(id);
  }, []);

  // Focus bookkeeping. Reordering a list moves the focused button's DOM node,
  // and a node that leaves the document — even for the instant React takes to
  // re-insert it — resets focus to <body>. So the control that was activated
  // is re-focused by id after the render that moved it.
  const moveBtns = useRef(new Map<string, HTMLButtonElement>());
  const titleInputs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<PendingFocus>(null);

  /**
   * Announce something in the live region, with no visible notice.
   *
   * Through `nextAnnouncement`, never by assigning the string: React does not
   * touch a text node whose string is unchanged, so assigning the SAME message
   * twice produced no DOM mutation and no second announcement. Moving a step
   * down twice in a two-step list says "Moved to position 2 of 2." both times,
   * and a screen reader used to hear it once. See `steps.ts`.
   */
  const say = useCallback((text: string): void => {
    setAnnouncement((prev) => nextAnnouncement(prev, text));
  }, []);

  /** Show a notice AND announce it. The notice alone is invisible to a reader. */
  const notify = useCallback((kind: 'error' | 'info', text: string): void => {
    setStatus({ kind, text });
    setAnnouncement((prev) => nextAnnouncement(prev, text));
  }, []);

  // ── The one source of truth about whether the draft is shippable ─────────
  const validation = useMemo(() => {
    if (steps.length === 0) return null;
    const draft: FlowDraft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: name.trim() || 'my-tour',
      name: name.trim() || 'My tour',
      steps,
    };
    try {
      return validateFlow(draftToFlow(draft));
    } catch (err) {
      // Whatever it was, report THAT. This used to hardcode `duplicate-step-id`
      // and the hint "Give every step a unique id." for every throw, so a draft
      // that failed for any other reason got a confident, wrong diagnosis
      // pointing at ids that were all fine. `conversionIssue` infers the code
      // and the hint only when it recognises the message, and says so plainly
      // when it does not.
      const issue = conversionIssue(err);
      return {
        valid: false,
        issues: [issue],
        errors: [] as FlowIssue[],
        warnings: [] as FlowIssue[],
        flow: null,
      };
    }
  }, [steps, name]);

  const errors = validation ? [...validation.errors, ...validation.issues.filter((i) => i.severity === 'error' && !validation.errors.includes(i))] : [];
  const warnings = validation?.warnings ?? [];

  // ── Wire up ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    void loadDraft(tabId).then((draft) => {
      if (cancelled || !draft) {
        setHydrated(true);
        return;
      }
      setName(draft.name);
      setSteps(draft.steps);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tabId]);

  useEffect(() => {
    if (!hydrated) return;
    saveDraft(tabId, { name, steps });
    // `pagehide` rather than `beforeunload`: it fires for a closed tab and for
    // bfcache, and it is the last point at which storage is still reachable.
    const flush = (): void => flushDraft(tabId, { name, steps });
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [tabId, name, steps, hydrated]);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: `recorder:${String(tabId)}` });
    port.onMessage.addListener((msg: { type?: string; payload?: unknown }) => {
      switch (msg.type) {
        // Sent on connect, so a Recorder opened mid-session — or reopened
        // after the worker was evicted — starts from the real state instead of
        // an empty list it would silently treat as "nothing recorded".
        case 'GF_RECORDING_STATE': {
          const p = msg.payload as { recording?: boolean; steps?: RecordedStep[] } | undefined;
          setRecording(p?.recording === true);
          setCaptured(p?.steps ?? []);
          break;
        }
        case 'GF_RECORDED_STEP':
          setCaptured((prev) => [...prev, msg.payload as RecordedStep]);
          break;
        case 'GF_RECORDING_STARTED':
          setRecording(true);
          break;
        case 'GF_RECORDING_STOPPED':
          setRecording(false);
          break;
        case 'GF_SELECTOR_VERIFIED': {
          const p = msg.payload as { selector?: string; matchCount?: number; status?: string } | undefined;
          notify(
            p?.status === 'unique' ? 'info' : 'error',
            p?.status === 'unique'
              ? `✓ ${String(p.selector)} matches exactly one element.`
              : `${String(p?.selector)} — ${String(p?.status)} (${String(p?.matchCount)} matches).`,
          );
          break;
        }
        /**
         * The element the user clicked after pressing "Re-record target".
         *
         * The same report is sent by the context menu and by an inspect the
         * DevTools panel started, so an unasked-for one must be ignored rather
         * than applied to whichever step happens to be first.
         */
        case 'GF_ELEMENT_SELECTED': {
          const id = pickingForRef.current;
          if (id === null) break;
          const p = msg.payload as { selector?: string } | undefined;
          const selector = p?.selector;
          if (typeof selector !== 'string' || selector.length === 0) {
            setPicking(null);
            notify('error', 'That element could not be turned into a selector. Try another.');
            break;
          }
          setPicking(null);
          setSteps((prev) => setTargetById(prev, id, selector));
          notify('info', `✓ Re-recorded target: ${selector}`);
          break;
        }
        /**
         * NOT a cancellation. `onClick` in the content script calls
         * `stopInspect()` — which sends this — and only THEN sends
         * `GF_ELEMENT_SELECTED`, so clearing `pickingFor` here would discard
         * every successful pick, arriving one message too early.
         */
        case 'GF_INSPECT_STOPPED':
          break;
        default:
          break;
      }
    });
    return () => port.disconnect();
  }, [tabId, notify, setPicking]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleRecording = useCallback(async () => {
    // The other half of the interlock. Both the recorder's click listener and
    // inspect mode's sit on `document` in the capture phase, and inspect only
    // calls `stopPropagation` — so a pick taken during a recording ALSO lands
    // in the captured-actions buffer. The re-record button refuses to start a
    // pick while recording; without this, the user could simply start
    // recording first and end up in exactly the state that was forbidden.
    //
    // Read off the ref, which is written in the same breath as the state, so
    // this cannot disagree with what the button rendered. STOPPING is never
    // blocked: a user must always be able to end a recording.
    if (!recording && pickingForRef.current !== null) {
      notify('error', 'Finish or cancel the pending element pick before recording.');
      return;
    }
    const r = await toTab(tabId, { type: recording ? 'GF_STOP_RECORDING' : 'GF_START_RECORDING' });
    if (!r.ok) {
      notify('error', `Could not reach the page: ${r.error ?? 'no response'}. Is the tab still open?`);
      return;
    }
    setStatus(null);
    setRecording(!recording);
  }, [tabId, recording, notify]);

  const importCaptured = useCallback(() => {
    // Ids come from `nextStepId`, never from Date.now() and no longer from the
    // list length: two steps added in the same millisecond used to collide, and
    // a length-derived id collides with a survivor as soon as a step has been
    // deleted. Both make the draft unshippable — see `steps.ts`.
    setSteps((prev) => appendCaptured(prev, captured));
    setCaptured([]);
    void chrome.runtime.sendMessage({ type: 'GF_CLEAR_RECORDING', payload: { tabId } });
  }, [captured, tabId]);

  const runTour = useCallback(async () => {
    if (!validation?.flow) return;
    const r = await toTab(tabId, { type: 'GF_START_TOUR', payload: validation.flow });
    if (!r.ok) notify('error', `Could not start the tour: ${r.error ?? 'no response'}`);
  }, [tabId, validation, notify]);

  const verify = useCallback(
    async (selector: string | null | undefined) => {
      if (!selector) return;
      await toTab(tabId, { type: 'GF_VERIFY_SELECTOR', payload: selector });
      await toTab(tabId, { type: 'GF_HIGHLIGHT_SELECTOR', payload: selector });
    },
    [tabId],
  );

  const exportFile = useCallback(() => {
    if (!validation?.flow) return;
    let text: string;
    try {
      text = stringifyFlowFile(validation.flow, { generator: `guideflow-devtools ${__GF_VERSION__}` });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Export failed.');
      return;
    }
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // `.flow.json`, which is the extension `guideflow validate` and
    // `guideflow export` are pointed at by every doc and CI snippet. The
    // Builder wrote `.json`, which neither picked up.
    a.download = `${slug(name) || 'guideflow-tour'}.flow.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Next tick: revoking in the same tick races the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [validation, name, notify]);

  const save = useCallback(() => {
    const draft: FlowDraft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: slug(name) || `tour-${String(steps.length)}`,
      name: name.trim() || 'My tour',
      steps,
    };
    void chrome.runtime.sendMessage({ type: 'GF_SAVE_FLOW', payload: draft });
    notify('info', 'Saved.');
  }, [name, steps, notify]);

  const importFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = toDraftState(safeParse(reader.result));
      if (!parsed) {
        notify('error', 'That file is not a GuideFlow draft or flow.');
        return;
      }
      setName(parsed.name);
      setSteps(parsed.steps);
      notify('info', `Loaded ${String(parsed.steps.length)} step(s).`);
    };
    reader.readAsText(file);
  }, [notify]);

  // ── Step editing ─────────────────────────────────────────────────────────

  const patch = (i: number, next: Partial<LinearStep>): void =>
    setSteps((prev) => patchStepAt(prev, i, next));

  const move = (from: number, to: number): void =>
    setSteps((prev) => moveStep(prev, from, to));

  /**
   * Reorder from the keyboard.
   *
   * The drag-and-drop below is mouse-only — there is no keyboard equivalent of
   * `dragstart`, and no amount of ARIA on a `draggable` element produces one.
   * These two buttons are the whole of reordering for anyone not using a
   * pointer, so they are not a convenience.
   */
  const moveBy = (from: number, delta: number, id: string, dir: 'up' | 'down'): void => {
    const to = from + delta;
    if (to < 0 || to >= steps.length) return;
    pendingFocus.current = { kind: 'move', id, dir };
    move(from, to);
    say(`Moved to position ${String(to + 1)} of ${String(steps.length)}.`);
  };

  /** Add a blank, editable step at `index`, and put the caret in its title. */
  const insertAt = (index: number): void => {
    const step = blankStep(steps);
    pendingFocus.current = { kind: 'title', id: step.id };
    setSteps(insertStepAt(steps, index, step));
    say(`Blank step inserted at position ${String(index + 1)}. Give it a title.`);
  };

  const removeAt = (index: number): void => {
    const remaining = removeStepAt(steps, index);
    // Deleting the focused control leaves focus on <body>. Hand it to the step
    // that has taken this one's place, or to the last one when the list ends.
    const heir = remaining[index] ?? remaining[index - 1];
    pendingFocus.current = heir ? { kind: 'title', id: heir.id } : null;
    // Deleting the step whose pick is pending must also call the pick OFF in
    // the page. Clearing `pickingFor` alone leaves the content script in
    // inspect mode with nobody listening: the page keeps its select-an-element
    // cursor, and the next click the user makes for any other reason is
    // swallowed. Same reasoning as the explicit cancel path below — that one
    // sends GF_STOP_INSPECT and this one did not.
    if (pickingFor !== null && steps[index]?.id === pickingFor) {
      setPicking(null);
      void toTab(tabId, { type: 'GF_STOP_INSPECT' });
    }
    setSteps(remaining);
    say(`Step ${String(index + 1)} deleted. ${String(remaining.length)} left.`);
  };

  /**
   * Re-record ONE step's target, without touching its title or body.
   *
   * This reuses inspect mode rather than the recorder: recording captures a
   * stream of actions and appends them, which is the thing that cannot fix a
   * single bad step. Inspect captures exactly one element and reports it as
   * `GF_ELEMENT_SELECTED`, which already routes to this page's port.
   */
  const rerecord = useCallback(
    async (id: string) => {
      // Cancelling comes FIRST, and is deliberately reachable while recording.
      // Recording can be armed from the popup, a context menu or the worker
      // while a pick is already pending, and a pick that cannot be called off
      // from that state silently consumes the next element the user selects
      // for any other reason — including one the DevTools panel asked for.
      if (pickingForRef.current === id) {
        setPicking(null);
        await toTab(tabId, { type: 'GF_STOP_INSPECT' });
        notify('info', 'Re-recording cancelled.');
        return;
      }
      if (recording) {
        notify('error', 'Stop recording before re-recording a target.');
        return;
      }
      const r = await toTab(tabId, { type: 'GF_START_INSPECT' });
      if (!r.ok) {
        notify('error', `Could not reach the page: ${r.error ?? 'no response'}. Is the tab still open?`);
        return;
      }
      setPicking(id);
      notify('info', 'Switch to your app and click the element this step should point at.');
    },
    [tabId, recording, notify, setPicking],
  );

  /**
   * Put focus back where the user left it, after the render that moved it.
   *
   * Keyed on `steps` because that is what re-orders the DOM. A no-op on every
   * other change, including a keystroke in a title field.
   */
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target.kind === 'title') {
      titleInputs.current.get(target.id)?.focus();
      return;
    }
    // A step moved to either end disables the button that got it there, and a
    // disabled button cannot hold focus — so fall back to its opposite number,
    // which is always enabled in that case.
    const wanted = moveBtns.current.get(`${target.id}:${target.dir}`);
    if (wanted && !wanted.disabled) {
      wanted.focus();
      return;
    }
    moveBtns.current.get(`${target.id}:${target.dir === 'up' ? 'down' : 'up'}`)?.focus();
  }, [steps]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.title}>GuideFlow Recorder</span>
        <span style={S.version}>v{__GF_VERSION__}</span>
        <span style={S.spacer} />
        <span style={S.tabLabel}>recording tab {tabId}</span>
      </header>

      <div style={S.body}>
        {/*
          Mounted unconditionally and left empty, never rendered together with
          its first message: a live region inserted into the DOM in the same
          commit as its content is not announced. Everything this page has to
          say — reorder, insert, delete, a re-recorded target, every error —
          arrives here, because the visible notice below is invisible to a
          screen reader.
        */}
        <div id="gf-live" role="status" aria-live="polite" style={S.srOnly}>
          {announcement}
        </div>

        <div style={S.row}>
          <input
            style={S.input}
            value={name}
            placeholder="Tour name"
            aria-label="Tour name"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            id="gf-record-btn"
            style={S.btn(recording ? 'danger' : 'warning')}
            // Half of the pick/record interlock — see `toggleRecording`. Only
            // STARTING is blocked; stopping a recording must always be one
            // click away, whatever else is pending.
            disabled={!recording && pickingFor !== null}
            title={
              !recording && pickingFor !== null
                ? 'Finish or cancel the pending element pick first.'
                : undefined
            }
            onClick={() => void toggleRecording()}
          >
            {recording ? '⏹ Stop recording' : '⏺ Record'}
          </button>
          <button style={S.btn('ghost')} onClick={() => fileInputRef.current?.click()}>
            ⬆ Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={importFile}
          />
        </div>

        {status && (
          <div id="gf-status" style={S.notice(status.kind)}>
            {status.text}
          </div>
        )}

        {captured.length > 0 && (
          <div style={S.captured}>
            <div style={S.capturedHead}>
              <strong>
                ⏺ {captured.length} captured action{captured.length === 1 ? '' : 's'}
              </strong>
              <span style={S.spacer} />
              <button id="gf-import-captured" style={S.btn('primary')} onClick={importCaptured}>
                Add as steps
              </button>
              <button style={S.btn('ghost')} onClick={() => setCaptured([])}>
                Discard
              </button>
            </div>
            {captured.slice(-4).map((c, i) => (
              <div key={`${c.ts}-${String(i)}`} style={S.capturedRow}>
                <code style={S.code}>{c.selector}</code>
                {c.unique === false && <span style={S.badgeBad}>not unique</span>}
                {c.confidence === 'fragile' && <span style={S.badgeWarn}>fragile</span>}
              </div>
            ))}
          </div>
        )}

        {steps.length === 0 ? (
          <div style={S.empty}>
            <p style={{ margin: 0 }}>
              Press <strong>Record</strong>, click through your app, then come back and add the
              captured actions as steps.
            </p>
            {/* An empty draft has a position to insert at too — position 1. */}
            <button
              id="gf-add-step"
              style={{ ...S.btn('ghost'), marginTop: 12 }}
              onClick={() => insertAt(0)}
            >
              ＋ Add a step by hand
            </button>
          </div>
        ) : (
          <ul id="gf-step-list" style={S.list}>
            {steps.map((step, i) => (
              <li
                key={step.id}
                data-step-id={step.id}
                style={S.card(dragIdx === i || pickingFor === step.id)}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null && dragIdx !== i) {
                    move(dragIdx, i);
                    setDragIdx(i);
                  }
                }}
                onDragEnd={() => setDragIdx(null)}
              >
                <div style={S.row}>
                  <span style={S.stepNo}>{i + 1}</span>
                  {/*
                    The keyboard half of reordering. Their accessible names are
                    positional, like every other control on the card, so the
                    re-focus after a move announces where the step landed.
                  */}
                  <button
                    ref={(el) => {
                      if (el) moveBtns.current.set(`${step.id}:up`, el);
                      else moveBtns.current.delete(`${step.id}:up`);
                    }}
                    style={S.iconBtn(i === 0)}
                    aria-label={`Move step ${String(i + 1)} up`}
                    disabled={i === 0}
                    onClick={() => moveBy(i, -1, step.id, 'up')}
                  >
                    ↑
                  </button>
                  <button
                    ref={(el) => {
                      if (el) moveBtns.current.set(`${step.id}:down`, el);
                      else moveBtns.current.delete(`${step.id}:down`);
                    }}
                    style={S.iconBtn(i === steps.length - 1)}
                    aria-label={`Move step ${String(i + 1)} down`}
                    disabled={i === steps.length - 1}
                    onClick={() => moveBy(i, 1, step.id, 'down')}
                  >
                    ↓
                  </button>
                  <input
                    ref={(el) => {
                      if (el) titleInputs.current.set(step.id, el);
                      else titleInputs.current.delete(step.id);
                    }}
                    style={S.input}
                    value={step.title}
                    placeholder="Step title"
                    aria-label={`Step ${String(i + 1)} title`}
                    onChange={(e) => patch(i, { title: e.target.value })}
                  />
                  <button
                    style={S.btn('danger')}
                    aria-label={`Delete step ${String(i + 1)}`}
                    onClick={() => removeAt(i)}
                  >
                    ✕
                  </button>
                </div>
                <div style={S.row}>
                  {/* Editable, which the Builder's target never was. */}
                  <input
                    style={{ ...S.input, fontFamily: 'monospace', fontSize: 11 }}
                    value={step.target ?? ''}
                    placeholder="CSS selector (blank = centred modal)"
                    aria-label={`Step ${String(i + 1)} target`}
                    onChange={(e) => patch(i, { target: e.target.value || null })}
                  />
                  <button
                    style={S.btn('ghost')}
                    // Not "Check step N target": an accessible name that
                    // CONTAINS another control's name is ambiguous to anything
                    // matching by substring, which is how both a screen-reader
                    // user searching by name and `getByLabel` find a control.
                    aria-label={`Check the target of step ${String(i + 1)}`}
                    onClick={() => void verify(step.target)}
                  >
                    👁 Check
                  </button>
                  <select
                    style={S.select}
                    value={step.placement ?? 'bottom'}
                    aria-label={`Step ${String(i + 1)} placement`}
                    onChange={(e) =>
                      patch(i, { placement: e.target.value as NonNullable<LinearStep['placement']> })
                    }
                  >
                    {PLACEMENTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  style={S.input}
                  value={step.body ?? ''}
                  placeholder="Body (optional)"
                  aria-label={`Step ${String(i + 1)} body`}
                  onChange={(e) => patch(i, { body: e.target.value })}
                />
                <div style={{ ...S.row, marginBottom: 0, marginTop: 8 }}>
                  <button
                    className="gf-rerecord"
                    style={S.btn(pickingFor === step.id ? 'warning' : 'ghost')}
                    aria-label={
                      pickingFor === step.id
                        ? `Cancel re-recording step ${String(i + 1)}`
                        : `Re-record the target of step ${String(i + 1)}`
                    }
                    // Starting a pick is disabled mid-recording on purpose.
                    // Both the recorder's click listener and inspect mode's sit
                    // on `document` in the capture phase, and inspect only
                    // calls `stopPropagation`, not `stopImmediatePropagation` —
                    // so one pick would ALSO land in the captured-actions
                    // buffer.
                    //
                    // CANCELLING this step's own pick is never disabled.
                    // Recording can be armed from the popup, a context menu or
                    // the worker while a pick is pending, and a pick with no
                    // way out then silently consumes the next element the user
                    // selects — for this step, for the DevTools panel, for
                    // anything.
                    disabled={recording && pickingFor !== step.id}
                    title={
                      recording && pickingFor !== step.id ? 'Stop recording first.' : undefined
                    }
                    onClick={() => void rerecord(step.id)}
                  >
                    {pickingFor === step.id ? '✕ Cancel pick' : '⦿ Re-record target'}
                  </button>
                  <button
                    className="gf-insert-above"
                    style={S.iconBtn(false)}
                    aria-label={`Insert a step above step ${String(i + 1)}`}
                    onClick={() => insertAt(i)}
                  >
                    ＋ Above
                  </button>
                  <button
                    className="gf-insert-below"
                    style={S.iconBtn(false)}
                    aria-label={`Insert a step below step ${String(i + 1)}`}
                    onClick={() => insertAt(i + 1)}
                  >
                    ＋ Below
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {validation && (
          <div id="gf-validation" style={S.validation(errors.length > 0)}>
            {errors.length === 0 && warnings.length === 0 && <span>✓ This tour is valid.</span>}
            {errors.length > 0 && (
              <strong>
                {errors.length} problem{errors.length === 1 ? '' : 's'} to fix before this can run:
              </strong>
            )}
            {[...errors, ...warnings].map((issue) => (
              <div key={`${issue.code}-${issue.path}`} style={S.issue}>
                <span style={issue.severity === 'error' ? S.badgeBad : S.badgeWarn}>
                  {issue.severity}
                </span>{' '}
                {issue.message}
                <div style={S.hint}>→ {issue.hint}</div>
              </div>
            ))}
          </div>
        )}

        {steps.length > 0 && (
          <div style={S.row}>
            <button id="gf-run-btn" style={S.btn('success')} onClick={() => void runTour()} disabled={errors.length > 0}>
              ▶ Preview
            </button>
            <button style={S.btn('primary')} onClick={save}>
              💾 Save
            </button>
            <button
              id="gf-export-btn"
              style={S.btn('ghost')}
              onClick={exportFile}
              disabled={errors.length > 0}
            >
              ⬇ Export .flow.json
            </button>
            <button
              style={S.btn('danger')}
              onClick={() => {
                setSteps([]);
                setName('');
                void clearDraft(tabId);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const PLACEMENTS = [
  'bottom',
  'top',
  'left',
  'right',
  'bottom-start',
  'bottom-end',
  'top-start',
  'top-end',
  'left-start',
  'left-end',
  'right-start',
  'right-end',
  'center',
] as const;

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function safeParse(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
