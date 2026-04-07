/**
 * Content script — injected into every page by the GuideFlow DevTools extension.
 *
 * Responsibilities:
 *  - Inject the bridge.js script into the PAGE world so it can access
 *    `window.__guideflow` (content scripts run in an isolated JS world
 *    and cannot access page globals directly).
 *  - Relay bridge messages (via window.postMessage) to the background
 *    service-worker through chrome.runtime.sendMessage.
 *  - Enable element inspection mode (point-and-click step builder).
 *  - Handle commands from the DevTools panel.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GFMessage {
  type: string;
  payload?: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sentinel value emitted by bridge.ts → content script direction. */
const BRIDGE_SOURCE = '__gf_bridge__';
/** Sentinel value emitted by content script → bridge.ts direction. */
const CONTENT_SOURCE = '__gf_content__';

// ---------------------------------------------------------------------------
// Bridge injection
// ---------------------------------------------------------------------------

let bridgeInjected = false;

function injectBridge(): void {
  if (bridgeInjected) return;
  bridgeInjected = true;

  const url = chrome.runtime.getURL('bridge.js');
  const script = document.createElement('script');
  script.src = url;
  script.type = 'module';
  script.onload = () => script.remove(); // Clean up DOM after execution
  (document.head || document.documentElement).appendChild(script);
}

// Inject as early as possible
injectBridge();

// ---------------------------------------------------------------------------
// Bridge ↔ background relay
// ---------------------------------------------------------------------------

/**
 * Listen for postMessage from the bridge script (running in the page world)
 * and forward them to the extension background via chrome.runtime.sendMessage.
 */
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.data?.source !== BRIDGE_SOURCE) return;

  const { type, payload } = event.data;
  chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Extension context may be invalidated after reload
  });
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function send(msg: GFMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/**
 * Forward a command from the DevTools panel to the bridge script in the page
 * world via window.postMessage.
 */
function sendToBridge(msg: GFMessage): void {
  window.postMessage({ source: CONTENT_SOURCE, ...msg }, '*');
}

// ---------------------------------------------------------------------------
// Inspect mode — highlight hovered elements and build selectors
// ---------------------------------------------------------------------------

let inspectMode = false;
let hoverEl: Element | null = null;
const HIGHLIGHT_CLASS = '__gf_inspect__';

function injectHighlightStyle(): void {
  if (document.getElementById('__gf_inspector_style__')) return;
  const style = document.createElement('style');
  style.id = '__gf_inspector_style__';
  style.textContent = `
    .__gf_inspect__ {
      outline: 2px solid #6366f1 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
  `;
  document.head.appendChild(style);
}

function buildSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
  const testId = el.getAttribute('data-testid');
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  return el.tagName.toLowerCase();
}

function onMouseOver(e: MouseEvent): void {
  if (!inspectMode) return;
  if (hoverEl) hoverEl.classList.remove(HIGHLIGHT_CLASS);
  hoverEl = e.target instanceof Element ? e.target : null;
  hoverEl?.classList.add(HIGHLIGHT_CLASS);
}

function onClick(e: MouseEvent): void {
  if (!inspectMode) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;
  const selector = buildSelector(el);
  const rect = el.getBoundingClientRect();
  send({
    type: 'GF_ELEMENT_SELECTED',
    payload: {
      selector,
      label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    },
  });
}

function startInspect(): void {
  inspectMode = true;
  injectHighlightStyle();
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  send({ type: 'GF_INSPECT_STARTED' });
}

function stopInspect(): void {
  inspectMode = false;
  if (hoverEl) hoverEl.classList.remove(HIGHLIGHT_CLASS);
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('click', onClick, true);
  send({ type: 'GF_INSPECT_STOPPED' });
}

// ---------------------------------------------------------------------------
// Handle commands from DevTools panel (via background)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: GFMessage) => {
  switch (msg.type) {
    case 'GF_DEVTOOLS_OPEN':
      // Re-inject bridge in case the page has navigated
      injectBridge();
      // Ask the bridge (running in the page world) to re-check
      // window.__guideflow and re-send GF_DETECTED + flow list.
      // This handles the common case where the page loaded before
      // the user opened DevTools.
      sendToBridge({ type: 'GF_PROBE' });
      break;

    case 'GF_START_INSPECT':
      startInspect();
      break;

    case 'GF_STOP_INSPECT':
      stopInspect();
      break;

    case 'GF_START_TOUR':
      // Forward to bridge.ts in the page world
      sendToBridge({ type: 'GF_START_TOUR', payload: msg.payload });
      break;

    case 'GF_LIST_FLOWS':
      // Ask bridge to enumerate registered flows
      sendToBridge({ type: 'GF_LIST_FLOWS' });
      break;

    case 'GF_HIGHLIGHT_SELECTOR': {
      const sel = msg.payload as string;
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add(HIGHLIGHT_CLASS);
        injectHighlightStyle();
        setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 2000);
      }
      break;
    }
  }
});
