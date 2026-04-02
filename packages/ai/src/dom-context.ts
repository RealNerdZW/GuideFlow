import type { DOMContext, DOMElementInfo } from '@guideflow/core';
import { isBrowser } from '@guideflow/core';

/** CSS selector strategies tried in order (most specific first). */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']);
function isInteractive(el: Element): boolean {
  return INTERACTIVE_TAGS.has(el.tagName.toLowerCase()) || el.hasAttribute('tabindex') || el.getAttribute('role') === 'button';
}

const SELECTOR_STRATEGIES = [
  (el: Element): string | null => {
    const id = el.id;
    return id ? `#${CSS.escape(id)}` : null;
  },
  (el: Element): string | null => {
    const name = el.getAttribute('name');
    if (!name) return null;
    return `[name="${CSS.escape(name)}"]`;
  },
  (el: Element): string | null => {
    const aria = el.getAttribute('aria-label');
    if (!aria) return null;
    return `[aria-label="${CSS.escape(aria)}"]`;
  },
  (el: Element): string | null => {
    const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-test-id');
    if (!testId) return null;
    return `[data-testid="${CSS.escape(testId)}"]`;
  },
];

function buildSelector(el: Element): string {
  for (const strategy of SELECTOR_STRATEGIES) {
    const sel = strategy(el);
    if (sel) return sel;
  }
  // Fallback: tagName + nth-of-type
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  const idx = siblings.indexOf(el) + 1;
  return `${tag}:nth-of-type(${idx})`;
}

function getLabel(el: Element): string | undefined {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return labelEl.textContent.trim();
  }

  const closest = el.closest('label');
  if (closest?.textContent) return closest.textContent.trim();

  const text = el.textContent?.trim();
  if (text && text.length <= 80) return text;

  return (el as HTMLInputElement).placeholder || undefined;
}

function getRole(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;

  const tag = el.tagName.toLowerCase();
  const implicit: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: `input[${(el as HTMLInputElement).type ?? 'text'}]`,
    select: 'listbox',
    textarea: 'textbox',
    nav: 'navigation',
    main: 'main',
    header: 'banner',
    footer: 'contentinfo',
    form: 'form',
    table: 'table',
    dialog: 'dialog',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    img: 'img',
  };
  return implicit[tag] ?? tag;
}

/** Interactive or landmark HTML elements we care about. */
const INTERESTING_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label',
  'nav', 'main', 'header', 'footer', 'section', 'article',
  'dialog', 'form', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  '[role]', // pseudo-entry resolved below
]);

const INTERESTING_ROLES = new Set([
  'button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio',
  'textbox', 'combobox', 'listbox', 'dialog', 'navigation', 'main',
  'banner', 'contentinfo', 'heading', 'form',
]);

function isInteresting(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (INTERESTING_TAGS.has(tag)) return true;
  const role = el.getAttribute('role');
  if (role && INTERESTING_ROLES.has(role)) return true;
  return false;
}

/**
 * Serialize the interesting DOM elements under `root` into a compact JSON
 * structure suitable for sending to an LLM.
 *
 * @param root - defaults to `document.body`
 * @param maxElements - cap to keep the payload small (default 80)
 */
export function serializeDOM(root?: Element | null, maxElements = 80): DOMContext {
  if (!isBrowser()) {
    return { url: '', title: '', elements: [] };
  }

  const rootEl = root ?? document.body;
  const all = Array.from(rootEl.querySelectorAll('*')).filter(isInteresting);
  const capped = all.slice(0, maxElements);

  const elements: DOMContext['elements'] = capped.map((el) => {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const role = getRole(el);
    const label = getLabel(el);
    const info: DOMElementInfo = {
      selector: buildSelector(el),
      tag,
      role,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      visible: rect.width > 0 && rect.height > 0,
      interactive: isInteractive(el),
    };
    if (label !== undefined) info.label = label;
    return info;
  });

  return {
    url: window.location.href,
    title: document.title,
    elements,
  };
}
