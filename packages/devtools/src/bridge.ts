/**
 * Bridge script — injected into the PAGE world by the content script.
 *
 * Chrome content scripts run in an isolated JavaScript world and cannot
 * access page-level globals like `window.__guideflow`.  This bridge script
 * is loaded via a `<script>` tag so it executes in the page's own JS
 * context.  It subscribes to every GuideFlow event and relays them to the
 * content script through `window.postMessage`.
 */

// Force TypeScript to treat this as a module (isolated scope)
export {};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BridgeMessage {
  source?: string;
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
// Relay logic
// ---------------------------------------------------------------------------

/**
 * Track which GF instance we've already subscribed to.
 * If the page creates a new instance (e.g. HMR), we re-subscribe.
 */
let subscribedInstance: GFInstance | null = null;

function relay(): void {
  const gf = (window as unknown as WindowWithGF).__guideflow;
  if (!gf?.on) return;

  // Always re-send GF_DETECTED so a freshly-opened panel gets it
  window.postMessage(
    {
      source: BRIDGE_SOURCE,
      type: 'GF_DETECTED',
      payload: { version: gf.version ?? 'unknown' },
    },
    '*',
  );

  // Send the list of registered flows (if any)
  try {
    const flows = gf.listFlows?.();
    if (flows && flows.length > 0) {
      window.postMessage(
        { source: BRIDGE_SOURCE, type: 'GF_FLOWS_LIST', payload: flows },
        '*',
      );
    }
  } catch {
    // listFlows may not exist on older versions
  }

  // Subscribe to every known event (re-subscribe if the GF instance changed)
  if (subscribedInstance !== gf) {
    subscribedInstance = gf;
    EVENTS.forEach((evt) => {
      gf.on(evt, (...args: unknown[]) => {
        window.postMessage(
          { source: BRIDGE_SOURCE, type: 'GF_TOUR_EVENT', payload: { event: evt, args } },
          '*',
        );
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Handle commands from content script → page
// ---------------------------------------------------------------------------

window.addEventListener('message', (e: MessageEvent) => {
  if (e.source !== window) return;
  const data = e.data as BridgeMessage | undefined;
  if (data?.source !== CONTENT_SOURCE) return;

  const gf = (window as unknown as WindowWithGF).__guideflow;
  if (!gf) return;

  switch (data.type) {
    case 'GF_START_TOUR':
      if (gf.start) {
        try {
          gf.start(data.payload);
        } catch (err) {
          console.error('[GuideFlow bridge] Failed to start tour:', err);
        }
      }
      break;

    case 'GF_LIST_FLOWS': {
      const flows = gf.listFlows?.() ?? [];
      window.postMessage(
        { source: BRIDGE_SOURCE, type: 'GF_FLOWS_LIST', payload: flows },
        '*',
      );
      break;
    }

    case 'GF_PROBE':
      // Re-run detection — the DevTools panel just opened and needs a
      // fresh GF_DETECTED + flow list.  This handles the common case
      // where the page loaded (and bridge already ran) before the user
      // opened DevTools.
      relay();
      break;

    case 'GF_GET_ACTIVE_TOUR': {
      // Return current tour state to caller
      const tourState = {
        isActive: gf.isActive ?? false,
        currentStepId: gf.currentStepId ?? null,
        currentStepIndex: gf.currentStepIndex ?? 0,
        totalSteps: gf.totalSteps ?? 0,
      };
      window.postMessage(
        { source: BRIDGE_SOURCE, type: 'GF_ACTIVE_TOUR_STATE', payload: tourState },
        '*',
      );
      break;
    }

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
});

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

tryRelay();
