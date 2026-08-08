/**
 * Background service worker for GuideFlow DevTools (Manifest V3).
 *
 * Responsibilities:
 *  - Route messages between the DevTools panel, popup, and content script
 *  - Persist flow definitions to chrome.storage.local
 *  - Maintain ephemeral tab state (detection, events, active tours)
 *  - Manage context menu items
 *  - Update the action badge based on detection status
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 *
 * This is the privileged end of the pipeline: it owns chrome.storage. Every
 * `onMessage` is therefore classified by *where it came from* before it is
 * acted upon (`.claude/docs/SECURITY-MODEL.md` §5 rule 3):
 *
 *  - `sender.id !== chrome.runtime.id`   → another extension. Dropped outright.
 *  - `sender.origin === our origin`      → one of our own extension pages (the
 *                                          popup, the DevTools panel, the
 *                                          Recorder). The only senders allowed
 *                                          to read or write saved flows.
 *  - otherwise, `sender.tab?.id != null` → one of our content scripts, in a
 *                                          real tab. May report tab state and
 *                                          be relayed to that tab's pages, and
 *                                          nothing else. It may NOT touch
 *                                          storage.
 *
 * **The extension-page test is the ORIGIN, not the absence of `sender.tab`.**
 * It used to be `sender.tab === undefined`, which is true of the popup and the
 * DevTools panel and false of the Recorder — an extension page in an ordinary
 * tab, for which Chrome populates `sender.tab` exactly as it does for a
 * content script. MEASURED, from the Recorder page:
 * `{ hasTab: true, origin: "chrome-extension://<id>" }`. So every privileged
 * request the Recorder made was classified as neither, fell through both
 * branches, and got **no response at all** — Record, Preview, Check, Save and
 * clearing the capture buffer were dead from the day it shipped. Two of them
 * report success without reading the reply, which is why nothing said so.
 *
 * `sender.origin` is set by the browser and a content script carries its
 * *page's* origin, so this cannot be forged from a page.
 *
 * A page-forged message cannot reach here at all (the content script
 * allowlists four read-only types), but the split is what makes that a
 * defence in depth rather than a single point of failure.
 */

import {
  FLOW_KEY_PREFIX,
  PORT_DEVTOOLS,
  PORT_RECORDER,
  TAB_REPORTS,
  type RecordedStep,
} from '../messages.js';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
//
// Ephemeral, and that is a deliberate trade rather than an oversight: an MV3
// worker can be evicted at any time. What matters is that the state lives HERE
// and not in a panel's React state, because the worker outlives every UI that
// talks to it. Recording used to die when the DevTools panel closed, and the
// captured steps died with it.

const devtoolsPorts = new Map<number, chrome.runtime.Port>();
const recorderPorts = new Map<number, chrome.runtime.Port>();
const detectedTabs = new Set<number>();
const eventCounts = new Map<number, number>();
const lastEvents = new Map<number, Array<{ event: string; ts: number }>>();
const activeTours = new Map<
  number,
  { flowId: string; stepIndex: number; totalSteps: number }
>();

/** Tabs currently recording. Survives a page navigation; the content script re-asks. */
const recordingTabs = new Set<number>();
/** Captured steps per tab, buffered so no UI has to be open to receive them. */
const recordedSteps = new Map<number, RecordedStep[]>();
/** A runaway page cannot exhaust the worker's memory. */
const MAX_RECORDED = 200;

/**
 * Mirror of the recording buffer in `chrome.storage.session`.
 *
 * The in-memory maps above are the fast path; this is what makes them survive.
 * An MV3 service worker is evicted aggressively — roughly every 30 seconds of
 * inactivity — and taking a user's in-progress recording with it is exactly
 * the class of loss this phase set out to fix. Everything in the worker's
 * memory is a cache of this.
 *
 * `session` rather than `local`: a recording is an editing session. It should
 * outlive the worker and the browser tab, and not next week's browsing.
 */
const SESSION_KEY = 'gf_recording';

interface SessionShape {
  recording: number[];
  steps: Record<string, RecordedStep[]>;
}

async function readSession(): Promise<SessionShape> {
  try {
    const items = await chrome.storage.session.get(SESSION_KEY);
    const raw = items[SESSION_KEY] as Partial<SessionShape> | undefined;
    return {
      recording: Array.isArray(raw?.recording) ? raw.recording : [],
      steps: raw?.steps && typeof raw.steps === 'object' ? raw.steps : {},
    };
  } catch {
    return { recording: [], steps: {} };
  }
}

/** Write the current in-memory state through. Fire and forget. */
function persistSession(): void {
  const steps: Record<string, RecordedStep[]> = {};
  for (const [tabId, list] of recordedSteps) steps[String(tabId)] = list;
  void chrome.storage.session
    .set({ [SESSION_KEY]: { recording: [...recordingTabs], steps } })
    .catch(() => {
      // storage.session can be unavailable very early in worker startup. The
      // in-memory copy still works for this worker's lifetime.
    });
}

/** Rehydrate after an eviction. Called once, at worker startup. */
async function restoreSession(): Promise<void> {
  const saved = await readSession();
  for (const tabId of saved.recording) recordingTabs.add(tabId);
  for (const [key, list] of Object.entries(saved.steps)) {
    const tabId = Number.parseInt(key, 10);
    if (Number.isFinite(tabId) && Array.isArray(list)) recordedSteps.set(tabId, list);
  }
}

void restoreSession();

function bufferStep(tabId: number, step: RecordedStep): void {
  const steps = recordedSteps.get(tabId) ?? [];
  steps.push(step);
  if (steps.length > MAX_RECORDED) steps.splice(0, steps.length - MAX_RECORDED);
  recordedSteps.set(tabId, steps);
  persistSession();
}

/** Post to whichever of the tab's extension pages are open. Neither is required. */
function toPages(tabId: number, message: { type: string; payload?: unknown }): void {
  devtoolsPorts.get(tabId)?.postMessage(message);
  recorderPorts.get(tabId)?.postMessage(message);
}

// ---------------------------------------------------------------------------
// Message provenance
// ---------------------------------------------------------------------------

/**
 * Types a content script is allowed to send.
 *
 * Sourced from `TAB_REPORTS` rather than re-spelled here: the two used to be
 * separate literal arrays that had to be kept in step by hand.
 */
const TAB_MESSAGES = new Set<string>(TAB_REPORTS);

/**
 * The origin every one of our extension pages reports, and no page can claim.
 *
 * Read once: `chrome.runtime.id` is fixed for the life of the worker.
 */
const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function updateBadge(tabId: number): void {
  const detected = detectedTabs.has(tabId);
  void chrome.action.setBadgeText({
    tabId,
    text: detected ? 'ON' : '',
  });
  void chrome.action.setBadgeBackgroundColor({
    tabId,
    color: '#6366f1',
  });
}

// ---------------------------------------------------------------------------
// Context menu setup
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first: onInstalled fires on every update and reload, and
  // create() with an id that already exists sets runtime.lastError. The menus
  // then silently stop being registered.
  chrome.contextMenus.removeAll(() => {
    registerContextMenus();
  });
});

function registerContextMenus(): void {
  chrome.contextMenus.create({
    id: 'gf-add-element',
    title: 'Add Element to GuideFlow Tour',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'gf-inspect',
    title: 'Inspect with GuideFlow',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'gf-quick-tour',
    title: 'Quick Tour from Here',
    contexts: ['all'],
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  switch (info.menuItemId) {
    case 'gf-add-element':
      chrome.tabs.sendMessage(tab.id, {
        type: 'GF_CONTEXT_ADD_ELEMENT',
      }).catch(() => {});
      break;
    case 'gf-inspect':
      chrome.tabs.sendMessage(tab.id, {
        type: 'GF_START_INSPECT',
      }).catch(() => {});
      break;
    case 'gf-quick-tour':
      chrome.tabs.sendMessage(tab.id, {
        type: 'GF_CONTEXT_QUICK_TOUR',
      }).catch(() => {});
      break;
  }
});

// ---------------------------------------------------------------------------
// Connection handling
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  const isDevtools = port.name.startsWith(PORT_DEVTOOLS);
  const isRecorder = port.name.startsWith(PORT_RECORDER);
  if (!isDevtools && !isRecorder) return;

  const tabId = parseInt(port.name.split(':')[1] ?? '0', 10);
  const registry = isDevtools ? devtoolsPorts : recorderPorts;
  registry.set(tabId, port);

  // Replay on connect. A page that opens mid-session — or reopens after the
  // worker was evicted — gets the buffered steps and the live recording flag
  // instead of an empty list it would silently treat as "nothing recorded".
  port.postMessage({
    type: 'GF_RECORDING_STATE',
    payload: { recording: recordingTabs.has(tabId), steps: recordedSteps.get(tabId) ?? [] },
  });

  port.onDisconnect.addListener(() => {
    registry.delete(tabId);
  });
});

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: { type?: unknown; payload?: unknown } | undefined, sender, sendResponse) => {
    // --- Provenance gate (see the header comment) ---
    if (sender.id !== chrome.runtime.id) return undefined;
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return undefined;
    }
    const type = message.type;

    const tabId = sender.tab?.id;
    /** One of our own extension pages — the popup, the panel or the Recorder. */
    const fromExtensionPage =
      sender.origin === EXTENSION_ORIGIN ||
      // Chrome before 80 has no `sender.origin`. The old rule is the fallback,
      // and it is strictly narrower: a content script always carries a tab.
      (sender.origin === undefined && sender.tab === undefined);
    /**
     * A content script of ours, running in a real tab.
     *
     * `!fromExtensionPage` first: the Recorder is itself in a tab, so without
     * it an extension page sending a `TAB_REPORTS` type would be recorded as
     * tab state for its OWN tab and relayed back to itself.
     */
    const fromContentScript = !fromExtensionPage && tabId !== undefined && TAB_MESSAGES.has(type);

    // A content script asking about its own tab. Answered before the allowlist
    // gate because it is a read of state the worker holds about that very tab —
    // it names no other tab and touches no storage.
    if (type === 'GF_GET_RECORDING_FOR_SENDER' && !fromExtensionPage && tabId !== undefined) {
      sendResponse({ recording: recordingTabs.has(tabId) });
      return undefined;
    }

    // --- Track state from content script messages ---
    if (fromContentScript && tabId !== undefined) {
      if (type === 'GF_DETECTED') {
        detectedTabs.add(tabId);
        updateBadge(tabId);
      }

      if (type === 'GF_TOUR_EVENT') {
        const prev = eventCounts.get(tabId) ?? 0;
        eventCounts.set(tabId, prev + 1);

        const evt = message.payload as { event: string; args?: unknown[] } | undefined;
        if (evt?.event) {
          const evts = lastEvents.get(tabId) ?? [];
          evts.push({ event: evt.event, ts: Date.now() });
          // Keep last 20
          if (evts.length > 20) evts.splice(0, evts.length - 20);
          lastEvents.set(tabId, evts);

          // Track active tour
          if (evt.event === 'tour:start') {
            // `tour:start` carries `{ flowId }` and nothing else
            // (core/src/types/index.ts). This used to read `.id` and `.steps`
            // off it, so every tracked tour was `flowId: 'unknown'` with a
            // total of 1. The real total arrives on `step:enter`.
            const args = evt.args as Array<{ flowId?: string }> | undefined;
            activeTours.set(tabId, {
              flowId: args?.[0]?.flowId ?? 'unknown',
              stepIndex: 0,
              totalSteps: 1,
            });
          } else if (evt.event === 'step:enter') {
            const tour = activeTours.get(tabId);
            if (tour) {
              tour.stepIndex = Math.min(tour.stepIndex + 1, tour.totalSteps - 1);
            }
          } else if (
            evt.event === 'tour:complete' ||
            evt.event === 'tour:abandon'
          ) {
            activeTours.delete(tabId);
          }
        }
      }

      // --- Recording lifecycle, owned here rather than by a UI ---
      if (type === 'GF_RECORDING_STARTED') {
        recordingTabs.add(tabId);
        persistSession();
      }
      if (type === 'GF_RECORDING_STOPPED') {
        recordingTabs.delete(tabId);
        persistSession();
      }
      if (type === 'GF_RECORDED_STEP' && isPlainObject(message.payload)) {
        // Buffered unconditionally. This used to be posted straight at
        // `devtoolsPorts.get(tabId)` and dropped on the floor when that was
        // undefined — which is every step of a popup-armed recording, and
        // every step after the DevTools window is closed.
        bufferStep(tabId, message.payload as unknown as RecordedStep);
      }

      // Relay to whichever extension pages are open. Only allowlisted types
      // reach this line, so a page can never be driven by a type it does not
      // expect.
      toPages(tabId, { type, payload: message.payload });
    }

    // --- Everything below is reachable only from our own extension pages ---
    // A content script must never be able to read or mutate saved flows; that
    // was the write primitive in AUDIT `devtools-content-script-relays-any-
    // message-type`.
    if (!fromExtensionPage) return undefined;

    // --- Handle GF_GET_STATE from popup ---
    if (type === 'GF_GET_STATE') {
      const reqTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      if (typeof reqTabId === 'number') {
        sendResponse({
          detected: detectedTabs.has(reqTabId),
          eventCount: eventCounts.get(reqTabId) ?? 0,
          activeTour: activeTours.get(reqTabId) ?? null,
          lastEvents: lastEvents.get(reqTabId) ?? [],
        });
      } else {
        sendResponse({ detected: false, eventCount: 0, activeTour: null, lastEvents: [] });
      }
      return undefined; // Synchronous response
    }

    // --- Recording, queried and controlled by any extension page ---
    if (type === 'GF_GET_RECORDING') {
      const reqTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      sendResponse(
        typeof reqTabId === 'number'
          ? { recording: recordingTabs.has(reqTabId), steps: recordedSteps.get(reqTabId) ?? [] }
          : { recording: false, steps: [] },
      );
      return undefined;
    }

    if (type === 'GF_CLEAR_RECORDING') {
      const reqTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      if (typeof reqTabId === 'number') {
        recordedSteps.delete(reqTabId);
        persistSession();
      }
      sendResponse({ ok: true });
      return undefined;
    }

    /**
     * One routed path from an extension page to a tab.
     *
     * Every page used to call `chrome.tabs.sendMessage(...).catch(() => {})`
     * itself, so a command that never arrived — no content script, a
     * chrome:// tab, a page still loading — was indistinguishable from one
     * that worked. Routing through here gives one place that reports the
     * failure, and the caller gets `{ ok: false, error }` to render.
     */
    if (type === 'GF_SEND_TO_TAB') {
      const p = message.payload as { tabId?: number; message?: unknown } | undefined;
      if (typeof p?.tabId !== 'number' || !isPlainObject(p.message)) {
        sendResponse({ ok: false, error: 'malformed request' });
        return undefined;
      }
      chrome.tabs
        .sendMessage(p.tabId, p.message)
        .then((reply: unknown) => sendResponse({ ok: true, reply }))
        .catch((err: unknown) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : 'the page did not respond',
          }),
        );
      return true;
    }

    /** Open the Recorder in its own tab, aimed at the tab being recorded. */
    if (type === 'GF_OPEN_RECORDER') {
      const reqTabId = (message.payload as { tabId?: number } | undefined)?.tabId;
      if (typeof reqTabId !== 'number') {
        sendResponse({ ok: false });
        return undefined;
      }
      const url = chrome.runtime.getURL(`recorder.html?tabId=${String(reqTabId)}`);
      void chrome.tabs.create({ url }, () => sendResponse({ ok: true }));
      return true;
    }

    // --- Storage operations (async sendResponse) ---
    if (type === 'GF_SAVE_FLOW') {
      const payload = message.payload;
      if (!isPlainObject(payload)) {
        sendResponse({ ok: false });
        return undefined;
      }
      const rawId = payload['id'];
      const id =
        typeof rawId === 'string' && rawId.length > 0 && rawId.length <= 128
          ? rawId
          : String(Date.now());
      const key = `${FLOW_KEY_PREFIX}${id}`;
      void chrome.storage.local.set({ [key]: { ...payload, savedAt: Date.now() } }, () => {
        sendResponse({ ok: true, key });
      });
      return true; // Keep channel open for async sendResponse
    }

    if (type === 'GF_LOAD_FLOWS') {
      void chrome.storage.local.get(null, (items) => {
        const flows: unknown[] = Object.entries(items)
          .filter(([k]) => k.startsWith(FLOW_KEY_PREFIX))
          .map(([, v]) => v as unknown);
        sendResponse({ flows });
      });
      return true; // Keep channel open for async sendResponse
    }

    if (type === 'GF_DELETE_FLOW') {
      const key = (message.payload as { key?: string } | undefined)?.key;
      // Confine deletion to the saved-flow namespace so a malformed key cannot
      // wipe `gf_settings` or anything else we later keep in local storage.
      if (typeof key === 'string' && key.startsWith(FLOW_KEY_PREFIX)) {
        void chrome.storage.local.remove(key, () => {
          sendResponse({ ok: true });
        });
        return true;
      }
    }

    // For all other messages, don't keep the channel open
    return undefined;
  },
);

// ---------------------------------------------------------------------------
// Cleanup on tab removal
// ---------------------------------------------------------------------------

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedTabs.delete(tabId);
  eventCounts.delete(tabId);
  lastEvents.delete(tabId);
  activeTours.delete(tabId);
  devtoolsPorts.delete(tabId);
  recorderPorts.delete(tabId);
  recordingTabs.delete(tabId);
  recordedSteps.delete(tabId);
  persistSession();
});
