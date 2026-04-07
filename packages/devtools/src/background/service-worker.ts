/**
 * Background service worker for GuideFlow DevTools (Manifest V3).
 *
 * Responsibilities:
 *  - Route messages between the DevTools panel, popup, and content script
 *  - Persist flow definitions to chrome.storage.local
 *  - Maintain ephemeral tab state (detection, events, active tours)
 *  - Manage context menu items
 *  - Update the action badge based on detection status
 */

// ---------------------------------------------------------------------------
// In-memory state (ephemeral — lost on service worker restart)
// ---------------------------------------------------------------------------

const devtoolsPorts = new Map<number, chrome.runtime.Port>();
const detectedTabs = new Set<number>();
const eventCounts = new Map<number, number>();
const lastEvents = new Map<number, Array<{ event: string; ts: number }>>();
const activeTours = new Map<
  number,
  { flowId: string; stepIndex: number; totalSteps: number }
>();

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
});

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
  if (port.name.startsWith('devtools:')) {
    const tabId = parseInt(port.name.split(':')[1] ?? '0', 10);
    devtoolsPorts.set(tabId, port);

    port.onDisconnect.addListener(() => {
      devtoolsPorts.delete(tabId);
    });
  }
});

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    // --- Track state from content script messages ---
    if (tabId !== undefined) {
      if (message.type === 'GF_DETECTED') {
        detectedTabs.add(tabId);
        updateBadge(tabId);
      }

      if (message.type === 'GF_TOUR_EVENT') {
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
            const args = evt.args as Array<{ id?: string; steps?: unknown[] }> | undefined;
            const flow = args?.[0];
            activeTours.set(tabId, {
              flowId: flow?.id ?? 'unknown',
              stepIndex: 0,
              totalSteps: Array.isArray(flow?.steps) ? flow.steps.length : 1,
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

      // Route content-script messages to the connected DevTools panel
      const panel = devtoolsPorts.get(tabId);
      if (panel) {
        panel.postMessage(message);
      }
    }

    // --- Handle GF_GET_STATE from popup ---
    if (message.type === 'GF_GET_STATE') {
      const reqTabId = (message.payload as { tabId?: number })?.tabId;
      if (reqTabId !== undefined) {
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

    // --- Storage operations (async sendResponse) ---
    if (message.type === 'GF_SAVE_FLOW') {
      const payload = message.payload as { id?: string } | undefined;
      const key = `gf_flow_${payload?.id ?? Date.now()}`;
      void chrome.storage.local.set({
        [key]: { ...(typeof payload === 'object' && payload !== null ? payload : {}), savedAt: Date.now() },
      }, () => {
        sendResponse({ ok: true, key });
      });
      return true; // Keep channel open for async sendResponse
    }

    if (message.type === 'GF_LOAD_FLOWS') {
      void chrome.storage.local.get(null, (items) => {
        const flows: unknown[] = Object.entries(items)
          .filter(([k]) => k.startsWith('gf_flow_'))
          .map(([, v]) => v as unknown);
        sendResponse({ flows });
      });
      return true; // Keep channel open for async sendResponse
    }

    if (message.type === 'GF_DELETE_FLOW') {
      const key = (message.payload as { key?: string })?.key;
      if (key) {
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
});
