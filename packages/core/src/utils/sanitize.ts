// ---------------------------------------------------------------------------
// HTML sanitiser — parse, then allowlist.
//
// Replaces a regex denylist that was defeated by 6 of 8 trivial payloads
// (AUDIT `sanitize-html-regex-denylist-bypass`). Regex denylists cannot work
// here: they run *before* the HTML parser, so they never see entity-decoded
// values (`jav&#x61;script:`), they need a closing tag to match an element
// (`<script src=x>` alone slips through), and single-pass replacement splices
// fragments back into live elements (`<scr<script>ipt>`).
//
// The approach instead: let the browser's own parser build an inert document,
// walk it, and keep only what is explicitly allowed. Anything unrecognised —
// element, attribute or URL scheme — is dropped rather than patched, so a
// vector nobody thought of fails closed.
//
// DOMPurify would be the obvious dependency, but `@guideflow/core` promises
// zero runtime dependencies and a gzip budget measured in single-digit
// kilobytes (ADR-002); DOMPurify is roughly twice the entire package.
// ---------------------------------------------------------------------------

import { isBrowser } from './ssr.js'

/**
 * Elements permitted in `content.html`. Deliberately small: this is tour copy,
 * not a CMS. Notably absent and never to be added without revisiting the threat
 * model — script, style, iframe, object, embed, form, input, base, link, meta,
 * svg, math, template.
 */
// Space-delimited rather than array literals purely for bundle size: the
// quote-and-comma overhead of ~50 string literals costs more gzipped bytes than
// core has to spare (ADR-002).
const ALLOWED_ELEMENTS = new Set(
  ('A B BLOCKQUOTE BR CODE DIV EM H1 H2 H3 H4 H5 H6 HR I IMG LI OL P PRE S ' +
    'SMALL SPAN STRONG SUB SUP TABLE TBODY TD TH THEAD TR U UL').split(' '),
)

/** Attributes permitted on any allowed element. */
const GLOBAL_ATTRIBUTES = new Set('class dir lang title'.split(' '))

/** Additional attributes permitted per element. */
const ELEMENT_ATTRIBUTES: Record<string, string> = {
  A: 'href target rel',
  IMG: 'src alt width height loading',
  TD: 'colspan rowspan',
  TH: 'colspan rowspan scope',
  OL: 'start type',
}

/** Attributes whose value is a URL and must therefore be scheme-checked. */
const URL_ATTRIBUTES = new Set(['href', 'src'])

/**
 * Schemes we are willing to navigate or load. Anything else — `javascript:`,
 * `data:`, `vbscript:`, `blob:`, `file:` — is rejected.
 *
 * Relative URLs (`/x`, `./x`, `x`, `#x`, `?x`) have no scheme and are allowed.
 */
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i

/**
 * True if `url` is safe to place in an href/src.
 *
 * Browsers strip control characters and whitespace out of a URL before acting
 * on it, so `jav\tascript:alert(1)` navigates exactly like `javascript:alert(1)`.
 * They are removed here before the check for the same reason.
 */
function isSafeUrl(url: string): boolean {
  // Codepoint filter rather than a regex: these are exactly the characters a
  // browser discards when resolving a URL, so the check must discard them too
  // or the scheme can be split apart with a tab.
  const cleaned = [...url].filter((c) => c.charCodeAt(0) > 0x20).join('')
  // No colon before the first /, ? or # means there is no scheme: it is relative.
  const schemeEnd = cleaned.indexOf(':')
  if (schemeEnd === -1) return true
  const firstPathish = cleaned.search(/[/?#]/)
  if (firstPathish !== -1 && firstPathish < schemeEnd) return true
  return SAFE_SCHEME.test(cleaned)
}

/** Strip every attribute not explicitly permitted for this element. */
function cleanAttributes(el: Element): void {
  const allowed = ELEMENT_ATTRIBUTES[el.tagName]

  // Copy first: removing during iteration mutates the live NamedNodeMap.
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()

    // Namespaced attributes (xlink:href, xml:*) are dropped wholesale. They are
    // a known vector and carry no value for tour copy.
    // The ` ${name} ` padding makes the substring test exact, so `rel` cannot
    // match inside `relative`.
    const permitted =
      !name.includes(':') &&
      (GLOBAL_ATTRIBUTES.has(name) || (allowed !== undefined && ` ${allowed} `.includes(` ${name} `)))

    if (!permitted) {
      el.removeAttribute(attr.name)
      continue
    }

    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attr.value)) {
      el.removeAttribute(attr.name)
    }
  }

  // An anchor that opens a new tab without rel="noopener" hands the opener
  // window to the destination.
  if (el.tagName === 'A' && el.getAttribute('target') === '_blank') {
    el.setAttribute('rel', 'noopener noreferrer')
  }
}

/**
 * Recursively drop disallowed nodes.
 *
 * A disallowed *element* is removed together with its subtree rather than
 * unwrapped: unwrapping `<script>` would promote its text into the document,
 * and unwrapping `<iframe srcdoc=…>` would keep the payload alive.
 */
function cleanNode(node: Node): void {
  // Copy: the child list mutates as nodes are removed.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element
      if (!ALLOWED_ELEMENTS.has(el.tagName)) {
        el.remove()
        continue
      }
      cleanAttributes(el)
      cleanNode(el)
    } else if (child.nodeType !== 3 /* TEXT_NODE */) {
      // Comments, CDATA, processing instructions — no reason to keep them, and
      // conditional comments have their own history of being executable.
      child.remove()
    }
  }
}

/**
 * Sanitise a fragment of untrusted HTML for insertion into the document.
 *
 * Returns a string so callers can assign it to `innerHTML`; it has already been
 * through a real parser, so re-parsing it is idempotent rather than a second
 * chance to smuggle something in.
 *
 * On a server (no DOMParser) every tag is stripped and only text is returned —
 * failing closed rather than emitting markup nothing has vetted.
 */
export function sanitizeHTML(html: string): string {
  if (!html) return ''

  if (!isBrowser()) {
    return html.replace(/<[^>]*>/g, '')
  }

  // A <template>'s content is an inert DocumentFragment owned by a separate
  // document: assigning innerHTML runs the real HTML parser, but scripts do not
  // execute and no resource is fetched. DOMParser is inert by spec too, but
  // happy-dom's implementation is not — it eagerly loads <script src> and
  // <iframe>, which would make this sanitiser dangerous under test and hide
  // failures behind unhandled rejections.
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  cleanNode(tpl.content)
  return tpl.innerHTML
}
