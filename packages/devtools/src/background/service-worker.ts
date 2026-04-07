/**
 * Background service worker for GuideFlow DevTools (Manifest V3).
 *
 * Responsibilities:
 *  - Route messages between the DevTools panel and the content script
 *  - Persist flow definitions to chrome.storage.local
 *  - Handle the extension action button click
 */

// Map tab IDs to DevTools panel port
const devtoolsPorts = new Map<number, chrome.runtime.Port>();

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
// Message routing: content → panel and storage helpers
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    // Route content-script messages to the connected DevTools panel
    if (tabId !== undefined) {
      const panel = devtoolsPorts.get(tabId);
      if (panel) {
        panel.postMessage(message);
      }
    }

    // Handle storage operations requested by the panel (async sendResponse)
    if (message.type === 'GF_SAVE_FLOW') {
      void chrome.storage.local.set({ [`gf_flow_${Date.now()}`]: message.payload }, () => {
        sendResponse({ ok: true });
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

    // For all other messages, don't keep the channel open
    return undefined;
  },
);

// ---------------------------------------------------------------------------
// Action button
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  // Open DevTools panel (requires user to open DevTools manually in Chrome)
  chrome.tabs.sendMessage(tab.id, { type: 'GF_DEVTOOLS_OPEN' }).catch(() => {});
});
