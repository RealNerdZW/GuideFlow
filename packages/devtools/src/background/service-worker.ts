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

    // Forward messages from content script to panel
    port.onMessage.addListener((msg: unknown) => {
      chrome.tabs.sendMessage(tabId, msg).catch(() => {
        // Tab may have navigated away
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Message routing: content → panel
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return false;

    const panel = devtoolsPorts.get(tabId);
    if (panel) {
      panel.postMessage(message);
    }

    sendResponse({ ok: true });
    return true;
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

// ---------------------------------------------------------------------------
// Storage helpers exposed to panel via messaging
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: unknown }, _sender, sendResponse) => {
    if (message.type === 'GF_SAVE_FLOW') {
      void chrome.storage.local.set({ [`gf_flow_${Date.now()}`]: message.payload }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    if (message.type === 'GF_LOAD_FLOWS') {
      void chrome.storage.local.get(null, (items) => {
        const flows = Object.entries(items)
          .filter(([k]) => k.startsWith('gf_flow_'))
          .map(([, v]) => v);
        sendResponse({ flows });
      });
      return true;
    }

    return false;
  },
);
