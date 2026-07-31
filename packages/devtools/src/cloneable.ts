/**
 * Make a value safe to hand to `window.postMessage`.
 *
 * Lives in its own module so it can be tested: `bridge.ts` runs side effects at
 * import time (it reads `document.currentScript`, subscribes to the page's
 * GuideFlow instance and starts a retry loop), so importing it from a test is
 * not practical.
 *
 * ## Why this exists
 *
 * `postMessage` uses the structured clone algorithm, which throws
 * `DataCloneError` on DOM nodes and functions. Two GuideFlow payloads contain
 * exactly those:
 *
 * - `step:enter` emits `{ stepId, stepIndex, target }` where `target` is an
 *   `Element`.
 * - `listFlows()` returns `FlowDefinition`s that may hold `showIf` guards and
 *   function `content`.
 *
 * The throw is synchronous and happens *inside* the page's own event handler,
 * which runs inside `TourEngine._renderCurrentStep()`'s try block. The engine's
 * error boundary catches it, emits `tour:error` and ends the tour. So merely
 * having the extension installed killed every tour with a targeted step on its
 * first step (AUDIT `bridge-dataclone-aborts-every-tour`,
 * `flows-list-clone-failure`).
 *
 * This is **not** a security boundary — the content script validates everything
 * again on receipt, and that is where trust decisions belong. This exists so
 * that observing a page cannot break it.
 */

/** How an `Element` is represented once it cannot be cloned. */
export interface ElementDescriptor {
  __gfElement: true
  tagName: string
  id?: string
  className?: string
}

/** Guard against a cyclic or pathologically deep object costing real time. */
const MAX_DEPTH = 10

export function toCloneable(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[max depth]'

  if (value === null || typeof value !== 'object') {
    // Functions, symbols and bigints are not cloneable. Returning undefined
    // makes the caller drop the key rather than throw.
    const t = typeof value
    return t === 'function' || t === 'symbol' || t === 'bigint' ? undefined : value
  }

  // An element descriptor is more useful to the panel than the node would have
  // been — the panel cannot touch the page's DOM anyway.
  if (typeof Element !== 'undefined' && value instanceof Element) {
    const className = typeof value.className === 'string' ? value.className : undefined
    const descriptor: ElementDescriptor = {
      __gfElement: true,
      tagName: value.tagName.toLowerCase(),
      ...(value.id ? { id: value.id } : {}),
      ...(className ? { className } : {}),
    }
    return descriptor
  }

  // Any other host object — Node, Window, Event — is described, not cloned.
  if (typeof Node !== 'undefined' && value instanceof Node) return '[node]'
  if (typeof Window !== 'undefined' && value instanceof Window) return '[window]'

  if (Array.isArray(value)) return value.map((v) => toCloneable(v, depth + 1))

  // Dates and other structured-cloneable built-ins pass through untouched.
  if (value instanceof Date || value instanceof RegExp) return value

  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const cleaned = toCloneable(v, depth + 1)
    if (cleaned !== undefined) out[key] = cleaned
  }
  return out
}
