// ---------------------------------------------------------------------------
// SSR-safe environment helpers
// Never accesses window/document at module evaluation time
// ---------------------------------------------------------------------------

export const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined'

export const getWindow = (): (Window & typeof globalThis) | null =>
  isBrowser() ? window : null

export const getDocument = (): Document | null =>
  isBrowser() ? document : null

/** Defer a callback to run only in browser environments */
export function onBrowser(fn: () => void): void {
  if (isBrowser()) fn()
}

/** Return a value only in browser, otherwise return the fallback */
export function browserOnly<T>(fn: () => T, fallback: T): T {
  return isBrowser() ? fn() : fallback
}

/** requestAnimationFrame with SSR fallback */
export const raf = (fn: FrameRequestCallback): number => {
  if (isBrowser()) {
    return window.requestAnimationFrame(fn)
  }
  return 0
}

/** Cancel a requestAnimationFrame */
export const cancelRaf = (id: number): void => {
  if (isBrowser()) window.cancelAnimationFrame(id)
}
