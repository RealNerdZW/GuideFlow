/**
 * Waiting for an element to appear.
 *
 * rAF-polled rather than MutationObserver, for three reasons:
 *
 *  1. **Nothing to leak.** There is no observer to disconnect, so an engine
 *     path that skips teardown cannot strand it. Every handle is released in
 *     one `done()`.
 *  2. **It catches what a `childList` + `subtree` observer misses** — an element
 *     that was always in the DOM but only just became matchable, because a class
 *     changed, an attribute flipped, or a parent stopped being `display: none`.
 *  3. It costs at most one `querySelector` per frame, bounded by a deadline and
 *     stopped the instant it succeeds.
 *
 * If profiling ever objects, tick every 2nd or 3rd frame with a counter. Do not
 * add that speculatively.
 */

/**
 * A local copy of `isBrowser`, not an import.
 *
 * This module is bundled into a separate entry point with `splitting: false`,
 * so anything imported from core as a *value* would be inlined into this bundle
 * as a second copy. Two lines duplicated beats duplicating the module graph.
 */
const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

export interface WaitForElementOptions {
  /** Give up after this many ms. Default 5000. */
  timeoutMs?: number
  /** Abort the wait. Resolves `null` immediately. */
  signal?: AbortSignal
  /** Search inside this root instead of `document`. */
  root?: ParentNode
}

/**
 * Resolve when `selector` matches something, or `null` on timeout or abort.
 *
 * Never rejects. A step that cannot find its target is a rendering decision,
 * not an exception — the engine emits `step:timeout` and renders unanchored.
 *
 * Usable with no navigation adapter at all, which makes it the equivalent of
 * shepherd.js's `beforeShowPromise`:
 *
 * ```ts
 * { id: 'save', target: () => waitForElement('#save', { timeoutMs: 5000 }) }
 * ```
 */
export function waitForElement(
  selector: string,
  options: WaitForElementOptions = {},
): Promise<Element | null> {
  if (!isBrowser()) return Promise.resolve(null)

  const root = options.root ?? document
  const timeoutMs = options.timeoutMs ?? 5000
  const signal = options.signal

  const immediate = root.querySelector(selector)
  if (immediate) return Promise.resolve(immediate)
  if (signal?.aborted) return Promise.resolve(null)
  if (timeoutMs <= 0) return Promise.resolve(null)

  return new Promise<Element | null>((resolve) => {
    let rafId = 0
    let timer: ReturnType<typeof setTimeout> | undefined = undefined

    const done = (el: Element | null): void => {
      if (rafId) cancelAnimationFrame(rafId)
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(el)
    }

    const onAbort = (): void => done(null)
    signal?.addEventListener('abort', onAbort, { once: true })

    // A parallel setTimeout deadline, NOT one derived from the frame count.
    // rAF is throttled to zero in a background tab, so a rAF-only deadline
    // never fires there — and because the engine awaits this render, `next()`
    // and the progress save behind it would never resolve either. That is a
    // hang, not a pause.
    timer = setTimeout(() => done(null), timeoutMs)

    const tick = (): void => {
      const el = root.querySelector(selector)
      if (el) {
        done(el)
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  })
}
