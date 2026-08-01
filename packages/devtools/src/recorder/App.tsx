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

// ── Component ──────────────────────────────────────────────────────────────

export function RecorderApp({ tabId }: { tabId: number }): React.ReactElement {
  const [steps, setSteps] = useState<LinearStep[]>([]);
  const [name, setName] = useState('');
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<RecordedStep[]>([]);
  const [status, setStatus] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      return {
        valid: false,
        issues: [
          {
            code: 'duplicate-step-id' as const,
            severity: 'error' as const,
            path: '',
            message: err instanceof Error ? err.message : 'The draft could not be converted.',
            hint: 'Give every step a unique id.',
          },
        ],
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
          setStatus({
            kind: p?.status === 'unique' ? 'info' : 'error',
            text:
              p?.status === 'unique'
                ? `✓ ${String(p.selector)} matches exactly one element.`
                : `${String(p?.selector)} — ${String(p?.status)} (${String(p?.matchCount)} matches).`,
          });
          break;
        }
        default:
          break;
      }
    });
    return () => port.disconnect();
  }, [tabId]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const toggleRecording = useCallback(async () => {
    const r = await toTab(tabId, { type: recording ? 'GF_STOP_RECORDING' : 'GF_START_RECORDING' });
    if (!r.ok) {
      setStatus({
        kind: 'error',
        text: `Could not reach the page: ${r.error ?? 'no response'}. Is the tab still open?`,
      });
      return;
    }
    setStatus(null);
    setRecording(!recording);
  }, [tabId, recording]);

  const importCaptured = useCallback(() => {
    // Ids are derived from position, not from Date.now(). Two steps added in
    // the same millisecond used to collide, which breaks goTo() and resume.
    setSteps((prev) => {
      const base = prev.length;
      const added = captured.map((c, i) => ({
        id: `step-${String(base + i + 1)}`,
        title: c.label || `${c.action} on ${c.tagName}`,
        target: c.selector,
        placement: 'bottom' as const,
      }));
      return [...prev, ...added];
    });
    setCaptured([]);
    void chrome.runtime.sendMessage({ type: 'GF_CLEAR_RECORDING', payload: { tabId } });
  }, [captured, tabId]);

  const runTour = useCallback(async () => {
    if (!validation?.flow) return;
    const r = await toTab(tabId, { type: 'GF_START_TOUR', payload: validation.flow });
    if (!r.ok) setStatus({ kind: 'error', text: `Could not start the tour: ${r.error ?? 'no response'}` });
  }, [tabId, validation]);

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
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Export failed.' });
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
  }, [validation, name]);

  const save = useCallback(() => {
    const draft: FlowDraft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: slug(name) || `tour-${String(steps.length)}`,
      name: name.trim() || 'My tour',
      steps,
    };
    void chrome.runtime.sendMessage({ type: 'GF_SAVE_FLOW', payload: draft });
    setStatus({ kind: 'info', text: 'Saved.' });
  }, [name, steps]);

  const importFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = toDraftState(safeParse(reader.result));
      if (!parsed) {
        setStatus({ kind: 'error', text: 'That file is not a GuideFlow draft or flow.' });
        return;
      }
      setName(parsed.name);
      setSteps(parsed.steps);
      setStatus({ kind: 'info', text: `Loaded ${String(parsed.steps.length)} step(s).` });
    };
    reader.readAsText(file);
  }, []);

  const patch = (i: number, next: Partial<LinearStep>): void =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...next } : s)));

  const move = (from: number, to: number): void =>
    setSteps((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      if (m) next.splice(to, 0, m);
      return next;
    });

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
          <p style={S.empty}>
            Press <strong>Record</strong>, click through your app, then come back and add the
            captured actions as steps.
          </p>
        ) : (
          <ul id="gf-step-list" style={S.list}>
            {steps.map((step, i) => (
              <li
                key={step.id}
                data-step-id={step.id}
                style={S.card(dragIdx === i)}
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
                  <input
                    style={S.input}
                    value={step.title}
                    aria-label={`Step ${String(i + 1)} title`}
                    onChange={(e) => patch(i, { title: e.target.value })}
                  />
                  <button style={S.btn('danger')} onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}>
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
                  <button style={S.btn('ghost')} onClick={() => void verify(step.target)}>
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
