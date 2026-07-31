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
 *
 * ── Manifest note: why `content_scripts[0].matches` is `<all_urls>` ──────────
 *
 * GuideFlow is a library, not a site. The extension has no way to know in
 * advance which origins embed it, so a static match pattern narrower than
 * `<all_urls>` would simply fail to detect tours on the user's own app. What
 * this script does on a page it does not care about is deliberately minimal:
 * it appends one `<script>` tag and registers two listeners. It reads nothing,
 * sends nothing, and — since `host_permissions` was dropped in favour of
 * `optional_host_permissions` (see manifest.json) — the extension holds no
 * ambient read access to the page. Everything privileged is gated on the
 * message allowlist and per-load nonce below.
 *
 * ── Trust boundary ───────────────────────────────────────────────────────────
 *
 * The page world is hostile (`.claude/docs/SECURITY-MODEL.md` §5). Anything
 * arriving on `window.postMessage` is attacker-controlled: the sentinel strings
 * are published in this bundle and are NOT authentication. Before a page
 * message may cross into `chrome.runtime` it must (a) carry this page-load's
 * nonce, (b) name a type on `RELAYABLE`, and (c) pass a per-type shape check.
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

/** Result of validating a page-world payload before it crosses the boundary. */
interface RelayCheck {
  ok: boolean;
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sentinel value emitted by bridge.ts → content script direction. */
const BRIDGE_SOURCE = '__gf_bridge__';
/** Sentinel value emitted by content script → bridge.ts direction. */
const CONTENT_SOURCE = '__gf_content__';

/**
 * The ONLY message types the page-world bridge may push into the privileged
 * `chrome.runtime` bus. Everything else — including every storage-mutating
 * type such as `GF_SAVE_FLOW` — is dropped here and never reaches the service
 * worker. Adding to this set means adding a validator to `sanitizeRelayed`.
 */
const RELAYABLE = new Set(['GF_DETECTED', 'GF_FLOWS_LIST', 'GF_TOUR_EVENT', 'GF_ACTIVE_TOUR_STATE']);

/** Hard ceiling on a relayed payload, measured as JSON characters. */
const MAX_PAYLOAD_CHARS = 256 * 1024;
/** Hard ceiling on entries in a `GF_FLOWS_LIST`. */
const MAX_FLOWS = 100;
/** Hard ceiling on positional arguments carried by one tour event. */
const MAX_EVENT_ARGS = 8;
/** Hard ceiling on any single free-text field we copy out of a payload. */
const MAX_FIELD_CHARS = 200;

/** `namespace:name`, e.g. `step:enter`. Bounds the event names we will relay. */
const EVENT_NAME_RE = /^[a-z][a-z0-9-]{0,23}:[a-z][a-z0-9-]{0,23}$/;

/**
 * Attribute an integrator can put on any element (or one of its ancestors) to
 * keep the recorder from capturing its text or its value.
 */
const PRIVATE_ATTR = 'data-gf-private';
/** Placeholder written in place of a value or label we refuse to capture. */
const REDACTED = '[redacted]';

/**
 * Concrete `targetOrigin` for every post on the page bus. Both ends of this
 * channel live in the same document, so the document's own origin is always
 * the right answer for ordinary http(s) pages. Documents with an opaque or
 * exotic origin (sandboxed frames, `data:`, `file:`) cannot be addressed by a
 * serialised origin, so those fall back to `'*'` — still confined to this
 * window, because both listeners also require `event.source === window`.
 */
const PAGE_ORIGIN = window.location.origin;
const TARGET_ORIGIN = /^https?:\/\//i.test(PAGE_ORIGIN) ? PAGE_ORIGIN : '*';

// ---------------------------------------------------------------------------
// Per-page-load nonce
// ---------------------------------------------------------------------------

/**
 * Random value minted once per page load, handed to bridge.js on the injected
 * `<script>` tag's `data-gf-nonce` attribute, and required on every message in
 * BOTH directions.
 *
 * This is NOT a secret and does NOT make the channel private: any page script
 * that observes the injection can read the attribute straight off the DOM, and
 * anything we post is still readable by a listener on `window`. What it buys is
 * that a script which did not observe the injection — the overwhelmingly common
 * case for an ad, a widget, or a payload injected later — cannot blindly forge
 * a message into the extension. Treat the channel as public regardless.
 */
const NONCE = makeNonce();

function makeNonce(): string {
  const c = globalThis.crypto;
  try {
    // `crypto.randomUUID` is secure-context-only, so it is absent on plain
    // http:// pages and calling it there throws.
    return c.randomUUID();
  } catch {
    // `getRandomValues` is available in insecure contexts too.
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

// ---------------------------------------------------------------------------
// Payload validation (page world → extension)
// ---------------------------------------------------------------------------

const REJECT: RelayCheck = { ok: false, payload: undefined };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function asBoundedString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, MAX_FIELD_CHARS) : fallback;
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Round-trip a payload through JSON. This bounds its size, proves it is
 * acyclic, and guarantees that only plain JSON data — no exotic structured
 * clone types, no prototypes — crosses into the privileged world.
 */
function jsonClone(value: unknown): RelayCheck {
  try {
    const json = JSON.stringify(value);
    if (json === undefined || json.length > MAX_PAYLOAD_CHARS) return REJECT;
    const parsed: unknown = JSON.parse(json);
    return { ok: true, payload: parsed };
  } catch {
    // Circular reference, BigInt, or a throwing toJSON().
    return REJECT;
  }
}

/**
 * Per-type shape validation. Returns the value that should be forwarded, which
 * is always a freshly-built plain object — never the page's own reference.
 */
function sanitizeRelayed(type: string, payload: unknown): RelayCheck {
  switch (type) {
    case 'GF_DETECTED': {
      if (!isPlainObject(payload)) return REJECT;
      return { ok: true, payload: { version: asBoundedString(payload['version'], 'unknown') } };
    }

    case 'GF_FLOWS_LIST': {
      if (!isUnknownArray(payload)) return REJECT;
      if (payload.length > MAX_FLOWS) return REJECT;
      if (!payload.every((entry) => isPlainObject(entry))) return REJECT;
      return jsonClone(payload);
    }

    case 'GF_TOUR_EVENT': {
      if (!isPlainObject(payload)) return REJECT;
      const event = payload['event'];
      if (typeof event !== 'string' || !EVENT_NAME_RE.test(event)) return REJECT;
      const rawArgs = payload['args'];
      const args = rawArgs === undefined ? [] : rawArgs;
      if (!isUnknownArray(args) || args.length > MAX_EVENT_ARGS) return REJECT;
      const cloned = jsonClone(args);
      if (!cloned.ok) return REJECT;
      return { ok: true, payload: { event, args: cloned.payload } };
    }

    case 'GF_ACTIVE_TOUR_STATE': {
      if (!isPlainObject(payload)) return REJECT;
      const stepId = payload['currentStepId'];
      return {
        ok: true,
        payload: {
          isActive: payload['isActive'] === true,
          currentStepId: typeof stepId === 'string' ? stepId.slice(0, MAX_FIELD_CHARS) : null,
          currentStepIndex: asFiniteNumber(payload['currentStepIndex'], 0),
          totalSteps: asFiniteNumber(payload['totalSteps'], 0),
        },
      };
    }

    default:
      return REJECT;
  }
}

// ---------------------------------------------------------------------------
// Bridge ↔ background relay
// ---------------------------------------------------------------------------

/**
 * Listen for postMessage from the bridge script (running in the page world)
 * and forward the allowlisted, shape-checked subset to the extension
 * background via chrome.runtime.sendMessage.
 */
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as
    | { source?: unknown; nonce?: unknown; type?: unknown; payload?: unknown }
    | null
    | undefined;
  if (!data || typeof data !== 'object') return;
  if (data.source !== BRIDGE_SOURCE) return;
  if (data.nonce !== NONCE) return;

  const { type } = data;
  if (typeof type !== 'string' || !RELAYABLE.has(type)) return;

  const checked = sanitizeRelayed(type, data.payload);
  if (!checked.ok) return;

  chrome.runtime.sendMessage({ type, payload: checked.payload }).catch(() => {
    // Extension context may be invalidated after reload
  });
});

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
  // Deliberately a CLASSIC script, not `type="module"`: `document.currentScript`
  // is always null inside a module, and the bridge reads its nonce from there.
  // vite.config.ts wraps the (import-free) bridge bundle in an IIFE so its
  // top-level bindings stay out of the page's global lexical scope.
  script.dataset['gfNonce'] = NONCE;
  script.onload = () => script.remove(); // Clean up DOM after execution
  (document.head || document.documentElement).appendChild(script);
}

// Inject as early as possible — after the relay listener above is live.
injectBridge();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function send(msg: GFMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/**
 * Forward a command from the DevTools panel to the bridge script in the page
 * world via window.postMessage. Only `type` and `payload` cross; the nonce
 * lets the bridge reject messages forged by unrelated page scripts.
 */
function sendToBridge(msg: GFMessage): void {
  window.postMessage(
    {
      source: CONTENT_SOURCE,
      nonce: NONCE,
      type: msg.type,
      ...(msg.payload !== undefined && { payload: msg.payload }),
    },
    TARGET_ORIGIN,
  );
}

// ---------------------------------------------------------------------------
// Privacy — never capture credentials or opted-out subtrees
// ---------------------------------------------------------------------------

/** True when the element, or any ancestor, is marked `data-gf-private`. */
function isPrivate(el: Element): boolean {
  return el.closest(`[${PRIVATE_ATTR}]`) !== null;
}

/**
 * True when the element's value must never be captured. Covers password and
 * hidden inputs plus the autocomplete tokens browsers use for credentials,
 * one-time codes and payment-card fields.
 */
function isSensitiveField(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    const inputType = el.type.toLowerCase();
    if (inputType === 'password' || inputType === 'hidden') return true;
  }
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
  return (
    autocomplete.includes('password') ||
    autocomplete.includes('one-time-code') ||
    autocomplete.startsWith('cc-')
  );
}

function readFieldValue(el: Element): string | null {
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }
  return null;
}

/**
 * Human-readable label for an element. Text inside a `[data-gf-private]`
 * subtree is replaced with a marker rather than copied into the panel.
 */
function describeElement(el: Element): string {
  if (isPrivate(el)) return REDACTED;
  return el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 60) ?? '';
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
      label: describeElement(target),
      tagName: target.tagName.toLowerCase(),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      ts: Date.now(),
    },
  });
}

function onRecordInput(e: Event): void {
  if (!recordingMode) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target || target.closest('#__gf_recording_badge__')) return;

  // A password field's value, or anything inside a `[data-gf-private]` subtree,
  // never leaves the page: the recorder writes a marker instead. Recorded steps
  // are persisted to chrome.storage, so this is the difference between a tour
  // draft and a credential store.
  const priv = isPrivate(target);
  const rawValue = priv || isSensitiveField(target) ? null : readFieldValue(target);

  send({
    type: 'GF_RECORDED_STEP',
    payload: {
      action: 'input',
      selector: buildSelector(target),
      label: priv
        ? REDACTED
        : (target.getAttribute('aria-label') ?? target.getAttribute('placeholder') ?? ''),
      tagName: target.tagName.toLowerCase(),
      value: rawValue === null ? REDACTED : rawValue.slice(0, 100),
      redacted: rawValue === null,
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
  // An aria-label inside a private subtree is page text, so it must not end up
  // embedded in a selector either — fall through to a structural path instead.
  if (ariaLabel && !isPrivate(el)) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
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
      label: describeElement(el),
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

/** Highlight a selector supplied by the panel. Selectors can be invalid. */
function highlightSelector(raw: unknown): void {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_FIELD_CHARS) return;
  let el: Element | null = null;
  try {
    el = document.querySelector(raw);
  } catch {
    return; // Invalid selector — querySelector throws.
  }
  if (!el) return;
  const found = el;
  found.scrollIntoView({ behavior: 'smooth', block: 'center' });
  injectHighlightStyle();
  found.classList.add(HIGHLIGHT_CLASS);
  setTimeout(() => found.classList.remove(HIGHLIGHT_CLASS), 2000);
}

// ---------------------------------------------------------------------------
// Handle commands from DevTools panel (via background)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: GFMessage, sender: chrome.runtime.MessageSender) => {
  // Only this extension's own contexts (panel, popup, service worker) may drive
  // the content script. A web page cannot reach this listener at all, but a
  // second extension can, and would otherwise be able to start the recorder.
  if (sender.id !== chrome.runtime.id) return;

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

    case 'GF_HIGHLIGHT_SELECTOR':
      highlightSelector(msg.payload);
      break;

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
        const ctxRect = lastContextElement.getBoundingClientRect();
        send({
          type: 'GF_ELEMENT_SELECTED',
          payload: {
            selector: buildSelector(lastContextElement),
            label: describeElement(lastContextElement),
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
        const qtRect = lastContextElement.getBoundingClientRect();
        send({
          type: 'GF_QUICK_TOUR_ELEMENT',
          payload: {
            selector: buildSelector(lastContextElement),
            label: describeElement(lastContextElement),
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
