/**
 * Content script — injected into every page by the GuideFlow DevTools extension.
 *
 * Responsibilities:
 *  - Detect whether GuideFlow is present on the page
 *  - Enable element inspection mode (point-and-click step builder)
 *  - Relay GuideFlow internal events to the DevTools panel via the background
 *  - Handle commands from the DevTools panel (start tour, highlight element, …)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GFMessage {
  type: string;
  payload?: unknown;
}

interface WindowWithGF extends Window {
  __guideflow?: {
    on: (event: string, handler: (...args: unknown[]) => void) => () => void;
    start: (flow: unknown) => void;
    _flows?: unknown[];
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function send(msg: GFMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
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
// Relay GuideFlow events to panel
// ---------------------------------------------------------------------------

function relayGuideFlowEvents(): void {
  const gf = (window as WindowWithGF).__guideflow;
  if (!gf?.on) return;

  const EVENTS = [
    'tour:start', 'tour:end', 'tour:skip',
    'step:enter', 'step:exit', 'step:complete', 'step:abandon',
  ];

  EVENTS.forEach((evt) => {
    gf.on(evt, (...args: unknown[]) => {
      send({ type: 'GF_TOUR_EVENT', payload: { event: evt, args } });
    });
  });

  // Send initial flow list if available
  if (gf._flows) {
    send({ type: 'GF_FLOWS_LIST', payload: gf._flows });
  }
}

// Retry relay a few times in case GuideFlow initialises after the script runs
let relayAttempts = 0;
function tryRelay(): void {
  if ((window as WindowWithGF).__guideflow) {
    relayGuideFlowEvents();
    send({ type: 'GF_DETECTED' });
    return;
  }
  if (relayAttempts < 10) {
    relayAttempts++;
    setTimeout(tryRelay, 500);
  }
}

tryRelay();

// ---------------------------------------------------------------------------
// Handle commands from DevTools panel (via background)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: GFMessage) => {
  switch (msg.type) {
    case 'GF_DEVTOOLS_OPEN':
      send({ type: 'GF_PING' });
      break;

    case 'GF_START_INSPECT':
      startInspect();
      break;

    case 'GF_STOP_INSPECT':
      stopInspect();
      break;

    case 'GF_START_TOUR': {
      const gf = (window as WindowWithGF).__guideflow;
      if (gf?.start) {
        gf.start(msg.payload);
      }
      break;
    }

    case 'GF_HIGHLIGHT_SELECTOR': {
      const sel = msg.payload as string;
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 2000);
      }
      break;
    }
  }
});
