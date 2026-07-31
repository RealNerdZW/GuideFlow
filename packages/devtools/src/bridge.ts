/**
 * Bridge script — injected into the PAGE world by the content script.
 *
 * Chrome content scripts run in an isolated JavaScript world and cannot
 * access page-level globals like `window.__guideflow`.  This bridge script
 * is loaded via a `<script>` tag so it executes in the page's own JS
 * context.  It subscribes to every GuideFlow event and relays them to the
 * content script through `window.postMessage`.
 *
 * ── Security ────────────────────────────────────────────────────────────────
 *
 * This file runs with page privileges, on the hostile side of the boundary
 * described in `.claude/docs/SECURITY-MODEL.md` §5. Two rules follow:
 *
 *  1. Every message carries the per-page-load nonce that the content script put
 *     on this script tag, and every inbound message must carry it too. The
 *     nonce is NOT a secret — any page script that watched the injection can
 *     read the `data-gf-nonce` attribute off the DOM, and any script can listen
 *     on `window` for what we post. It stops *blind* forgery from scripts that
 *     did not observe the injection; it does not make the channel private.
 *  2. Consequently, never put anything on this channel that the page must not
 *     see. Everything here is tour metadata the page already owns.
 *
 * This bundle must stay import-free: the content script loads it as a CLASSIC
 * script (so `document.currentScript` is non-null) and vite.config.ts wraps it
 * in an IIFE, which an ESM `import` statement would break.
 */

// Force TypeScript to treat this as a module (isolated scope)
export {};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BridgeMessage {
  source?: string;
  nonce?: string;
  type?: string;
  payload?: unknown;
}

interface GFInstance {
  on: (event: string, handler: (...args: unknown[]) => void) => () => void;
  start: (flow: unknown) => void;
  listFlows?: () => unknown[];
  isActive?: boolean;
  currentStepId?: string;
  currentStepIndex?: number;
  totalSteps?: number;
  pause?: () => void;
  resume?: () => void;
  stop?: () => void;
  version?: string;
}

interface WindowWithGF extends Window {
  __guideflow?: GFInstance;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sentinel used by bridge → content direction. */
const BRIDGE_SOURCE = '__gf_bridge__';
/** Sentinel used by content → bridge direction. */
const CONTENT_SOURCE = '__gf_content__';

/**
 * Concrete `targetOrigin` for every post. Both ends live in this document, so
 * its own origin is the correct target on ordinary http(s) pages. Documents
 * with an opaque or exotic origin (sandboxed frames, `data:`, `file:`) cannot
 * be addressed by a serialised origin, so those fall back to `'*'` — still
 * confined to this window, because both listeners require
 * `event.source === window`.
 */
const PAGE_ORIGIN = window.location.origin;
const TARGET_ORIGIN = /^https?:\/\//i.test(PAGE_ORIGIN) ? PAGE_ORIGIN : '*';

/** All GuideFlow events that should be relayed to the DevTools panel. */
const EVENTS = [
  'tour:start',
  'tour:complete',
  'tour:abandon',
  'tour:pause',
  'tour:resume',
  'tour:error',
  'step:enter',
  'step:exit',
  'step:skip',
  'hotspot:open',
  'hotspot:close',
  'hint:click',
  'progress:sync',
];

// ---------------------------------------------------------------------------
// Per-page-load nonce
// ---------------------------------------------------------------------------

/**
 * Read the nonce the content script stamped on the `<script>` tag that loaded
 * this bundle.
 */
function readNonce(): string {
  // `document.currentScript` is the element currently executing, which the page
  // cannot substitute. It is only non-null for classic scripts, which is why
  // inspector.ts injects this bundle without `type="module"`.
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) {
    const fromCurrent = current.dataset['gfNonce'];
    if (fromCurrent) return fromCurrent;
  }

  // Fallback for the module-script case. A page could plant a decoy tag here,
  // which desynchronises the nonce and silently disables the relay — a denial
  // of service against the DevTools panel, never a privilege escalation.
  const tags = document.querySelectorAll<HTMLScriptElement>('script[data-gf-nonce]');
  for (const tag of tags) {
    if (tag.src.startsWith('chrome-extension://')) {
      const value = tag.dataset['gfNonce'];
      if (value) return value;
    }
  }

  return '';
}

const NONCE = readNonce();

// ---------------------------------------------------------------------------
// Relay logic
// ---------------------------------------------------------------------------

function post(type: string, payload: unknown): void {
  window.postMessage({ source: BRIDGE_SOURCE, nonce: NONCE, type, payload }, TARGET_ORIGIN);
}

/**
 * Track which GF instance we've already subscribed to.
 * If the page creates a new instance (e.g. HMR), we re-subscribe.
 */
let subscribedInstance: GFInstance | null = null;

function relay(): void {
  const gf = (window as unknown as WindowWithGF).__guideflow;
  if (!gf?.on) return;

  // Always re-send GF_DETECTED so a freshly-opened panel gets it
  post('GF_DETECTED', { version: gf.version ?? 'unknown' });

  // Send the list of registered flows (if any)
  try {
    const flows = gf.listFlows?.();
    if (flows && flows.length > 0) {
      post('GF_FLOWS_LIST', flows);
    }
  } catch {
    // listFlows may not exist on older versions
  }

  // Subscribe to every known event (re-subscribe if the GF instance changed)
  if (subscribedInstance !== gf) {
    subscribedInstance = gf;
    EVENTS.forEach((evt) => {
      gf.on(evt, (...args: unknown[]) => {
        post('GF_TOUR_EVENT', { event: evt, args });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Handle commands from content script → page
// ---------------------------------------------------------------------------

function onContentMessage(e: MessageEvent): void {
  if (e.source !== window) return;
  const data = e.data as BridgeMessage | null | undefined;
  if (!data || typeof data !== 'object') return;
  if (data.source !== CONTENT_SOURCE) return;
  if (data.nonce !== NONCE) return;

  const gf = (window as unknown as WindowWithGF).__guideflow;
  if (!gf) return;

  switch (data.type) {
    case 'GF_START_TOUR':
      // `payload` originates in the DevTools panel, but the page can forge it
      // too. It is handed to the page's own GuideFlow instance, so the blast
      // radius is a tour the page could have started itself.
      if (gf.start) {
        try {
          gf.start(data.payload);
        } catch (err) {
          console.error('[GuideFlow bridge] Failed to start tour:', err);
        }
      }
      break;

    case 'GF_LIST_FLOWS':
      post('GF_FLOWS_LIST', gf.listFlows?.() ?? []);
      break;

    case 'GF_PROBE':
      // Re-run detection — the DevTools panel just opened and needs a
      // fresh GF_DETECTED + flow list.  This handles the common case
      // where the page loaded (and bridge already ran) before the user
      // opened DevTools.
      relay();
      break;

    case 'GF_GET_ACTIVE_TOUR':
      // Return current tour state to caller
      post('GF_ACTIVE_TOUR_STATE', {
        isActive: gf.isActive ?? false,
        currentStepId: gf.currentStepId ?? null,
        currentStepIndex: gf.currentStepIndex ?? 0,
        totalSteps: gf.totalSteps ?? 0,
      });
      break;

    case 'GF_PAUSE_TOUR':
      gf.pause?.();
      break;

    case 'GF_RESUME_TOUR':
      gf.resume?.();
      break;

    case 'GF_STOP_TOUR':
      gf.stop?.();
      break;
  }
}

// ---------------------------------------------------------------------------
// Retry — GuideFlow may initialise after this script runs
// ---------------------------------------------------------------------------

let attempts = 0;
const MAX_ATTEMPTS = 30; // 15 seconds total

function tryRelay(): void {
  if ((window as unknown as WindowWithGF).__guideflow) {
    relay();
    return;
  }
  if (attempts < MAX_ATTEMPTS) {
    attempts++;
    setTimeout(tryRelay, 500);
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

if (NONCE) {
  window.addEventListener('message', onContentMessage);
  tryRelay();
} else {
  // Without a nonce nothing we post would be accepted anyway, so stay inert
  // rather than leaking tour events onto the page bus for no benefit.
  console.warn(
    '[GuideFlow bridge] No nonce found on the injected script tag — DevTools relay disabled.',
  );
}
