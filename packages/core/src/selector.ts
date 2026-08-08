/**
 * `@guideflow/core/selector` — build a CSS selector for an element that the
 * engine can still resolve after the next deploy.
 *
 * ```ts
 * import { buildSelector } from '@guideflow/core/selector'
 *
 * const { selector, confidence, unique } = buildSelector(el)
 * ```
 *
 * This is the piece the roadmap calls the make-or-break of any recorder: a
 * selector that silently resolves to the wrong element ships a tour that
 * highlights the wrong thing, and nobody finds out until a user does.
 *
 * Three copies of this logic existed before this module, all of them broken in
 * the same two ways — they trusted framework-generated ids, and **none of them
 * ever re-queried to check the selector they had just built**. Measured against
 * real Chromium, the previous implementation pointed at the wrong element for
 * two ordinary page shapes: two buttons sharing `aria-label="Close"`, and a
 * sidebar/main pair with matching nesting.
 *
 * A separate entry point because most consumers never author a tour, and core
 * is size-gated. Nothing here is imported by `src/index.ts`, so `dist/index.js`
 * is unchanged.
 *
 * Purely DOM-computational: it reads elements and attributes and re-queries the
 * document it was given. No layout, no geometry, no `window`. That is
 * deliberate — happy-dom reports a zero rect for everything, so a
 * layout-dependent heuristic would be untestable in the unit corpus by
 * construction.
 */

// ── Public API ─────────────────────────────────────────────────────────────

export type SelectorStrategy =
  | 'gf-id'
  | 'testid'
  | 'id'
  | 'name'
  | 'aria-label'
  | 'href'
  | 'structural'

export type SelectorConfidence = 'stable' | 'semantic' | 'fragile'

export type SelectorWarning =
  /** An id was present and was rejected as framework-generated. */
  | 'generated-id'
  /** The selector embeds user-visible text, so translating the page breaks it. */
  | 'i18n-fragile'
  /** The path contains `:nth-of-type`, so re-ordering the markup breaks it. */
  | 'positional'
  /** Nothing resolved uniquely. `unique` is false and the result is a best effort. */
  | 'not-unique'
  /** Inside `[data-gf-private]` — only structural segments were used. */
  | 'redacted'
  /** The selector points at an interactive ancestor, not the element passed in. */
  | 'retargeted'
  /** Inside a shadow root: no document-level selector can reach it. */
  | 'shadow-dom'

export interface SelectorOptions {
  /**
   * Test-id attributes, tried in order. The first one present wins.
   * Default: `data-testid`, `data-test-id`, `data-test`, `data-cy`, `data-qa`, `data-pw`.
   */
  testIdAttributes?: readonly string[]
  /** Subtree opt-out marker. Default `'[data-gf-private]'`. */
  privateSelector?: string
  /** Where uniqueness is verified. Default `el.ownerDocument`. */
  root?: ParentNode
  /** Ancestor segments before the walk gives up. Default 12. */
  maxDepth?: number
  /** Levels climbed looking for an interactive ancestor. Default 4; 0 disables. */
  retargetDepth?: number
}

export interface SelectorResult {
  /** Never empty. */
  selector: string
  strategy: SelectorStrategy
  confidence: SelectorConfidence
  /**
   * **Verified by re-query**, not asserted. False only when nothing resolved to
   * exactly this element — in which case the caller must refuse to save the
   * step rather than ship a selector that points somewhere else.
   */
  unique: boolean
  matchCount: number
  /** What the selector actually resolves to. Differs from the input after retargeting. */
  element: Element
  warnings: SelectorWarning[]
}

const DEFAULT_TEST_IDS: readonly string[] = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
  'data-pw',
]

/**
 * Elements a tour can sensibly point at.
 *
 * Used to climb out of an icon: clicking the `<path>` inside
 * `<button><svg><path/></svg></button>` must record the button, not the path.
 * The old recorder used `e.target` verbatim and anchored the spotlight to a
 * zero-area SVG child.
 */
const INTERACTIVE =
  'a[href],button,input,select,textarea,summary,label,' +
  '[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
  '[role="checkbox"],[role="radio"],[role="switch"],[role="option"],' +
  '[tabindex]:not([tabindex="-1"]),[contenteditable="true"]'

/**
 * Is this id worth building a selector out of?
 *
 * Exported because the ranking rule is the interesting part and has to be
 * pinned by tests independently of the walk.
 *
 * **The asymmetry is deliberate.** A false reject costs one rank position and
 * an amber badge. A false accept ships `#:r1:` — syntactically valid, unique
 * today, and matching nothing after the next render. Bias toward rejection.
 */
export function isStableId(id: string): boolean {
  if (!id || id.length > 64) return false
  // React 18 useId — ':r1:' — and React 19's '«r1»'.
  if (/^:.+:$/.test(id)) return false
  if (/^«.+»$/.test(id)) return false
  // Component-library generated ids.
  if (/(^|[-_:])(radix|headlessui|mui|mantine|chakra|reach|downshift|rc|ember|aria)[-_:]/i.test(id))
    return false
  // uuid
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return false
  // bare hex / content hash
  if (/^[0-9a-f]{8,}$/i.test(id)) return false
  // nanoid and friends
  if (/^[A-Za-z0-9_-]{20,}$/.test(id)) return false
  // timestamps, row counters, database keys
  if (/\d{4,}/.test(id)) return false
  return true
}

/**
 * Climb to the interactive ancestor a user meant to click.
 *
 * An element inside an `<svg>` is never a tour target — jumping straight out of
 * the SVG also means an interior node's camelCase name (`clipPath`,
 * `linearGradient`, `foreignObject`) can never be lowercased into a structural
 * segment that matches nothing.
 */
export function retargetToInteractive(el: Element, maxClimb = 4): Element {
  const svg = el.closest('svg')
  if (svg) {
    const host = svg.parentElement
    if (host) return host.matches(INTERACTIVE) ? host : (host.closest(INTERACTIVE) ?? host)
  }
  if (maxClimb <= 0) return el
  if (el.matches(INTERACTIVE)) return el

  let cur: Element | null = el.parentElement
  for (let i = 0; i < maxClimb && cur; i++) {
    if (cur.matches(INTERACTIVE)) return cur
    cur = cur.parentElement
  }
  return el
}

/**
 * Does `selector` resolve to exactly `el`, and nothing else?
 *
 * Never throws: a malformed candidate must demote to the next strategy, not
 * propagate out of the recorder. The identity check is not optional — after
 * retargeting, a selector can be unique and still resolve to a different
 * element than the one being described.
 */
export function verifySelector(
  selector: string,
  el: Element,
  root?: ParentNode,
): 'unique' | 'ambiguous' | 'no-match' | 'invalid' {
  const scope = root ?? el.ownerDocument ?? undefined
  if (!scope) return 'invalid'
  let found: ArrayLike<Element>
  try {
    found = scope.querySelectorAll(selector)
  } catch {
    return 'invalid'
  }
  if (found.length === 0) return 'no-match'
  if (found.length > 1) return 'ambiguous'
  return found[0] === el ? 'unique' : 'no-match'
}

/** How many elements does `selector` match? `-1` when it is not a valid selector. */
function countMatches(selector: string, root: ParentNode): number {
  try {
    return root.querySelectorAll(selector).length
  } catch {
    return -1
  }
}

/**
 * Build the most durable selector available for `el`.
 *
 * Strategies are tried in descending order of survivability and **every
 * candidate is re-queried before it is accepted**. When nothing resolves
 * uniquely the result carries `unique: false` and a `'not-unique'` warning
 * rather than a plausible-looking string — an authoring UI must be able to
 * refuse the step.
 */
export function buildSelector(el: Element, options: SelectorOptions = {}): SelectorResult {
  const testIds = options.testIdAttributes ?? DEFAULT_TEST_IDS
  const privateSelector = options.privateSelector ?? '[data-gf-private]'
  const maxDepth = options.maxDepth ?? 12
  const retargetDepth = options.retargetDepth ?? 4

  const warnings: SelectorWarning[] = []
  const original = el
  const target = retargetDepth > 0 ? retargetToInteractive(el, retargetDepth) : el
  if (target !== original) warnings.push('retargeted')

  const root = options.root ?? target.ownerDocument ?? undefined

  // No document-level selector can cross a shadow boundary, and TourEngine
  // resolves targets with document.querySelector. Say so instead of guessing.
  if (!root || (target.getRootNode() !== target.ownerDocument && target.ownerDocument !== null)) {
    warnings.push('shadow-dom', 'not-unique')
    return {
      selector: tagName(target),
      strategy: 'structural',
      confidence: 'fragile',
      unique: false,
      matchCount: 0,
      element: target,
      warnings,
    }
  }

  // Evaluated once, at entry. The previous implementation returned an id-based
  // selector BEFORE consulting the privacy marker, so ids and test ids walked
  // straight out of an opted-out subtree.
  const redacted = target.closest(privateSelector) !== null
  if (redacted) warnings.push('redacted')

  const accept = (
    selector: string,
    strategy: SelectorStrategy,
    confidence: SelectorConfidence,
    extra?: SelectorWarning,
  ): SelectorResult | null => {
    if (verifySelector(selector, target, root) !== 'unique') return null
    if (extra) warnings.push(extra)
    return {
      selector,
      strategy,
      confidence,
      unique: true,
      matchCount: 1,
      element: target,
      warnings,
    }
  }

  if (!redacted) {
    // 1 — the documented opt-in hook. Wins outright: the author put it there.
    const gfId = target.getAttribute('data-gf-id')
    if (gfId) {
      const hit = accept(`[data-gf-id="${cssString(gfId)}"]`, 'gf-id', 'stable')
      if (hit) return hit
    }

    // 2 — test ids, ABOVE aria-label. The old order preferred aria-label, which
    //     is user-visible text and collides across a page.
    for (const attr of testIds) {
      const value = target.getAttribute(attr)
      if (!value) continue
      const hit = accept(`[${attr}="${cssString(value)}"]`, 'testid', 'stable')
      if (hit) return hit
    }

    // 3 — a hand-written id.
    const id = target.getAttribute('id')
    if (id) {
      if (isStableId(id)) {
        const hit = accept(`#${escapeIdent(id)}`, 'id', 'stable')
        if (hit) return hit
      } else {
        warnings.push('generated-id')
      }
    }

    // 4 — a form control's `name`. It is submitted to a server, so it is as
    //     stable as the backend contract.
    const name = target.getAttribute('name')
    if (name && /^(input|select|textarea)$/i.test(target.localName)) {
      const hit = accept(
        `${target.localName}[name="${cssString(name)}"]`,
        'name',
        'stable',
      )
      if (hit) return hit
    }

    // 5 — aria-label, tag-scoped rather than bare so a shared label across
    //     different element types does not collide.
    const label = target.getAttribute('aria-label')
    if (label) {
      const hit = accept(
        `${tagName(target)}[aria-label="${cssString(label)}"]`,
        'aria-label',
        'semantic',
        'i18n-fragile',
      )
      if (hit) return hit
    }

    // 6 — a link's own destination.
    const href = target.getAttribute('href')
    if (href && target.localName === 'a' && href.length <= 60 && !/[?#]/.test(href)) {
      const hit = accept(`a[href="${cssString(href)}"]`, 'href', 'semantic')
      if (hit) return hit
    }
  }

  // 7 — an ANCHORED structural path. Always produces something.
  return structural(target, root, { maxDepth, testIds, privateSelector, redacted, warnings })
}

// ── Structural path ────────────────────────────────────────────────────────

interface StructuralContext {
  maxDepth: number
  testIds: readonly string[]
  privateSelector: string
  redacted: boolean
  warnings: SelectorWarning[]
}

/**
 * Walk up emitting `:nth-of-type` segments until the path resolves uniquely, or
 * until an ancestor with a stable anchor roots it.
 *
 * Three differences from the implementation this replaces, each of which was a
 * measured defect:
 *
 * - **No fixed depth.** The old walk stopped after four segments and emitted
 *   the result *unanchored*, so `document.querySelector` returned the first
 *   structurally similar match anywhere in the document. That is how clicking
 *   a button in `<main>` produced a selector resolving into `<aside>`.
 * - **`:nth-of-type`, not `:nth-child`.** A portal, tooltip or overlay `<div>`
 *   appended as a sibling shifts every `nth-child` index on the page;
 *   `nth-of-type` counts only same-tag siblings and survives it.
 * - **Case is preserved for non-HTML elements**, so an SVG `clipPath` is never
 *   lowercased into `clippath`, which matches nothing.
 */
function structural(
  el: Element,
  root: ParentNode,
  ctx: StructuralContext,
): SelectorResult {
  const parts: string[] = []
  let cur: Element | null = el
  let depth = 0
  /**
   * The shortest unanchored path that already resolves uniquely.
   *
   * Kept as a fallback rather than returned immediately. A short path like
   * `li:nth-of-type(2) > span` can be unique *today* and stop being unique the
   * moment an unrelated part of the page grows a second `li`. Rooting the path
   * on a stable ancestor is strictly more durable, so the walk keeps climbing
   * to look for one and only falls back to this if it never finds it.
   */
  let shortestUnanchored: string | null = null

  while (cur && depth < ctx.maxDepth) {
    const anchor = ctx.redacted ? null : anchorFor(cur, root, ctx.testIds)
    if (anchor) {
      parts.unshift(anchor)
      const rooted = parts.join(' > ')
      if (verifySelector(rooted, el, root) === 'unique') {
        return done(rooted, el, root, ctx, parts.length > 1)
      }
      // The anchor did not disambiguate; drop it and keep climbing.
      parts.shift()
    }

    parts.unshift(`${tagName(cur)}:nth-of-type(${indexAmongSameTag(cur)})`)
    const candidate = parts.join(' > ')
    if (shortestUnanchored === null && verifySelector(candidate, el, root) === 'unique') {
      shortestUnanchored = candidate
    }

    cur = cur.parentElement
    depth++
  }

  if (shortestUnanchored !== null) return done(shortestUnanchored, el, root, ctx, true)

  // Give up honestly rather than returning a selector nobody verified.
  const best = parts.join(' > ') || tagName(el)
  ctx.warnings.push('positional', 'not-unique')
  return {
    selector: best,
    strategy: 'structural',
    confidence: 'fragile',
    unique: false,
    matchCount: Math.max(countMatches(best, root), 0),
    element: el,
    warnings: ctx.warnings,
  }
}

function done(
  selector: string,
  el: Element,
  root: ParentNode,
  ctx: StructuralContext,
  positional: boolean,
): SelectorResult {
  if (positional) ctx.warnings.push('positional')
  return {
    selector,
    strategy: 'structural',
    confidence: 'fragile',
    unique: true,
    matchCount: 1,
    element: el,
    warnings: ctx.warnings,
  }
}

/** A uniquely-resolving anchor on `el` itself — never a positional segment. */
function anchorFor(el: Element, root: ParentNode, testIds: readonly string[]): string | null {
  const gfId = el.getAttribute('data-gf-id')
  if (gfId) {
    const s = `[data-gf-id="${cssString(gfId)}"]`
    if (countMatches(s, root) === 1) return s
  }
  for (const attr of testIds) {
    const value = el.getAttribute(attr)
    if (!value) continue
    const s = `[${attr}="${cssString(value)}"]`
    if (countMatches(s, root) === 1) return s
  }
  const id = el.getAttribute('id')
  if (id && isStableId(id)) {
    const s = `#${escapeIdent(id)}`
    if (countMatches(s, root) === 1) return s
  }
  return null
}

/** 1-based position among same-tag siblings, which is what `:nth-of-type` counts. */
function indexAmongSameTag(el: Element): number {
  const parent = el.parentElement
  if (!parent) return 1
  let n = 0
  for (const sibling of Array.from(parent.children)) {
    if (sibling.localName === el.localName) {
      n++
      if (sibling === el) return n
    }
  }
  return 1
}

/**
 * The tag name to put in a selector.
 *
 * `localName` verbatim for anything outside the HTML namespace, because SVG and
 * MathML names are case-sensitive. Anything that is not a plain identifier
 * becomes `*` rather than an invalid selector.
 */
function tagName(el: Element): string {
  const name =
    el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? el.localName.toLowerCase() : el.localName
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name) ? name : '*'
}

// ── Escaping ───────────────────────────────────────────────────────────────

/**
 * Escape a value for use inside a double-quoted attribute selector.
 *
 * Deliberately NOT `CSS.escape`, which escapes for an *identifier* — running it
 * over an attribute value produces a string that no longer matches.
 */
function cssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Escape an id for use after `#`.
 *
 * `CSS.escape` where the environment has it; otherwise a conservative fallback,
 * because happy-dom and older Safari do not.
 */
function escapeIdent(value: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } }
  const native = g.CSS?.escape
  if (typeof native === 'function') return native(value)
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`).replace(/^(\d)/, '\\3$1 ')
}
