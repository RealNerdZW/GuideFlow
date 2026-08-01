import type { DOMContext, DOMElementInfo } from '@guideflow/core';
import { isBrowser } from '@guideflow/core';
// The third copy of a selector builder in this repo, deleted. This one ranked
// aria-label above data-testid and fell back to a bare, unanchored
// `tag:nth-of-type(n)` with no uniqueness check at all — so it could name an
// element on the other side of the document. One engine now, verified by
// re-query, tested against a hostile corpus.
import { buildSelector as buildCoreSelector } from '@guideflow/core/selector';

const buildSelector = (el: Element): string => buildCoreSelector(el).selector;

/** CSS selector strategies tried in order (most specific first). */
const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'details', 'summary']);
function isInteractive(el: Element): boolean {
  return INTERACTIVE_TAGS.has(el.tagName.toLowerCase()) || el.hasAttribute('tabindex') || el.getAttribute('role') === 'button';
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

/**
 * Elements the page has marked as not for AI capture.
 *
 * `serializeDOM` ships page text — labels, headings, table cells — to a
 * third-party model. On a real application page that routinely includes names,
 * balances, order numbers and email addresses, and there was previously no way
 * to hold any of it back (AUDIT `ai-serializedom-pii-to-third-party`,
 * `dom-context-pii-exfiltration`).
 *
 * `data-gf-private` on an element excludes that element and everything inside
 * it. Password inputs are always excluded — there is no legitimate reason to
 * describe one to a model, and their surrounding labels are usually enough to
 * identify an account.
 */
function isPrivate(el: Element): boolean {
  if (el.closest('[data-gf-private]') !== null) return true;
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  return false;
}

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
  const all = Array.from(rootEl.querySelectorAll('*'))
    .filter(isInteresting)
    .filter((el) => !isPrivate(el));
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
