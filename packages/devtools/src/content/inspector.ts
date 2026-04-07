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

// Force TypeScript to treat this as a module (isolated scope)
export {};

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
  const data = event.data as { source?: string; type?: string; payload?: unknown } | undefined;
  if (data?.source !== BRIDGE_SOURCE) return;

  const { type, payload } = data;
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

// ---------------------------------------------------------------------------
// Recording mode — capture user interactions as tour steps
// ---------------------------------------------------------------------------

let recordingMode = false;
let recordingBadge: HTMLDivElement | null = null;

function createRecordingBadge(): HTMLDivElement {
  const badge = document.createElement('div');
  badge.id = '__gf_recording_badge__';
  badge.innerHTML = `
    <style>
      @keyframes __gf_pulse__ {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      #__gf_recording_badge__ {
        position: fixed !important;
        top: 12px !important;
        right: 12px !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 8px 14px !important;
        background: rgba(30, 30, 46, 0.95) !important;
        border: 1px solid #f38ba8 !important;
        border-radius: 8px !important;
        font-family: system-ui, -apple-system, sans-serif !important;
        font-size: 12px !important;
        color: #cdd6f4 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        cursor: pointer !important;
        user-select: none !important;
      }
      #__gf_recording_badge__ .__gf_rec_dot__ {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #f38ba8 !important;
        animation: __gf_pulse__ 1.2s ease-in-out infinite !important;
      }
    </style>
    <span class="__gf_rec_dot__"></span>
    <span>Recording…</span>
    <span style="color: #6c7086; font-size: 10px; margin-left: 4px;">click to stop</span>
  `;
  badge.addEventListener('click', () => {
    stopRecording();
    send({ type: 'GF_RECORDING_STOPPED' });
  });
  return badge;
}

function onRecordClick(e: MouseEvent): void {
  if (!recordingMode) return;
  // Don't capture clicks on the recording badge
  const target = e.target instanceof Element ? e.target : null;
  if (!target || target.closest('#__gf_recording_badge__')) return;

  const selector = buildSelector(target);
  const rect = target.getBoundingClientRect();
  send({
    type: 'GF_RECORDED_STEP',
    payload: {
      action: 'click',
      selector,
      label: target.getAttribute('aria-label') ?? target.textContent?.trim().slice(0, 60) ?? '',
      tagName: target.tagName.toLowerCase(),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      ts: Date.now(),
    },
  });
}

function onRecordInput(e: Event): void {
  if (!recordingMode) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;

  const selector = buildSelector(target);
  send({
    type: 'GF_RECORDED_STEP',
    payload: {
      action: 'input',
      selector,
      label: target.getAttribute('aria-label') ?? target.getAttribute('placeholder') ?? '',
      tagName: target.tagName.toLowerCase(),
      value: (target as HTMLInputElement).value?.slice(0, 100) ?? '',
      ts: Date.now(),
    },
  });
}

function startRecording(): void {
  recordingMode = true;
  recordingBadge = createRecordingBadge();
  document.body.appendChild(recordingBadge);
  document.addEventListener('click', onRecordClick, true);
  document.addEventListener('change', onRecordInput, true);
  send({ type: 'GF_RECORDING_STARTED' });
}

function stopRecording(): void {
  recordingMode = false;
  document.removeEventListener('click', onRecordClick, true);
  document.removeEventListener('change', onRecordInput, true);
  if (recordingBadge) {
    recordingBadge.remove();
    recordingBadge = null;
  }
}

// ---------------------------------------------------------------------------
// Context menu element tracking
// ---------------------------------------------------------------------------

let lastContextElement: Element | null = null;

document.addEventListener('contextmenu', (e: MouseEvent) => {
  lastContextElement = e.target instanceof Element ? e.target : null;
}, true);

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

  // Build an nth-child path (up to 4 levels) for a unique selector
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && parts.length < 4) {
    let seg = cur.tagName.toLowerCase();
    if (cur.parentElement) {
      const siblings = Array.from(cur.parentElement.children);
      const idx = siblings.indexOf(cur) + 1;
      seg += `:nth-child(${idx})`;
    }
    parts.unshift(seg);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
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
  // Stop inspect immediately to avoid race condition (don't wait for
  // the panel to send GF_STOP_INSPECT back)
  stopInspect();
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

    // --- Recording commands ---
    case 'GF_START_RECORDING':
      startRecording();
      break;

    case 'GF_STOP_RECORDING':
      stopRecording();
      send({ type: 'GF_RECORDING_STOPPED' });
      break;

    // --- Context menu element capture ---
    case 'GF_CONTEXT_ADD_ELEMENT': {
      if (lastContextElement) {
        const ctxSelector = buildSelector(lastContextElement);
        const ctxRect = lastContextElement.getBoundingClientRect();
        send({
          type: 'GF_ELEMENT_SELECTED',
          payload: {
            selector: ctxSelector,
            label: lastContextElement.getAttribute('aria-label') ?? lastContextElement.textContent?.trim().slice(0, 60),
            rect: {
              top: ctxRect.top,
              left: ctxRect.left,
              width: ctxRect.width,
              height: ctxRect.height,
            },
          },
        });
      }
      break;
    }

    case 'GF_CONTEXT_QUICK_TOUR': {
      if (lastContextElement) {
        const qtSelector = buildSelector(lastContextElement);
        const qtRect = lastContextElement.getBoundingClientRect();
        send({
          type: 'GF_QUICK_TOUR_ELEMENT',
          payload: {
            selector: qtSelector,
            label: lastContextElement.getAttribute('aria-label') ?? lastContextElement.textContent?.trim().slice(0, 60),
            rect: {
              top: qtRect.top,
              left: qtRect.left,
              width: qtRect.width,
              height: qtRect.height,
            },
          },
        });
      }
      break;
    }

    // --- Bridge forwarding ---
    case 'GF_PAUSE_TOUR':
    case 'GF_RESUME_TOUR':
    case 'GF_STOP_TOUR':
    case 'GF_GET_ACTIVE_TOUR':
      sendToBridge(msg);
      break;
  }
});
