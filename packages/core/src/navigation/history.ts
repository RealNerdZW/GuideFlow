/**
 * Knowing when the route changed, without breaking the router that owns it.
 *
 * Three rules govern everything here:
 *
 *  1. **Prefer the Navigation API.** Where it exists (Chromium) we subscribe to
 *     `navigatesuccess` and patch nothing at all.
 *  2. **Patch cooperatively.** The fallback wraps whatever is installed *right
 *     now* — which on Next.js 14.1+ is already Next's own wrapper — calls it,
 *     and only then notifies.
 *  3. **Unpatch honestly.** On teardown we restore the original only if
 *     `history.pushState` is still our function. If somebody patched on top of
 *     us, ripping ours out would delete theirs; we go inert instead.
 *
 * The better answer for a real app is to skip all of this and pass
 * `createNavigation({ subscribe })` wired to your router. This exists for the
 * apps that will not.
 */

type Listener = (url: URL) => void

interface Slot {
  subscribers: Set<Listener>
  teardown: (() => void) | null
  lastHref: string
}

/**
 * The refcount lives on a global symbol, not a module variable, so a dual
 * ESM/CJS load shares one count and one patch. Two copies of this module each
 * patching `history` would notify twice and unpatch each other's wrapper.
 */
const SLOT = Symbol.for('guideflow.navigation')

function slot(): Slot {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>
  let s = g[SLOT]
  if (!s) {
    s = { subscribers: new Set(), teardown: null, lastHref: '' }
    g[SLOT] = s
  }
  return s
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

interface NavigationApi {
  addEventListener(type: string, fn: () => void): void
  removeEventListener(type: string, fn: () => void): void
}

/** Structural cast, never `any` — `no-explicit-any` is an error in this repo. */
function navigationApi(): NavigationApi | null {
  const w = window as unknown as { navigation?: NavigationApi }
  return w.navigation && typeof w.navigation.addEventListener === 'function' ? w.navigation : null
}

type HistoryFn = History['pushState']

/**
 * Subscribe to route changes. Returns a teardown.
 *
 * Notifications are coalesced on `href`: a router that calls `replaceState`
 * three times for one navigation produces one notification.
 */
export function watchHistory(onChange: Listener): () => void {
  if (!isBrowser()) return () => { /* SSR: nothing to watch */ }

  const s = slot()
  s.subscribers.add(onChange)

  if (s.teardown === null) {
    s.lastHref = window.location.href
    s.teardown = install(s)
  }

  return () => {
    s.subscribers.delete(onChange)
    if (s.subscribers.size === 0 && s.teardown) {
      s.teardown()
      s.teardown = null
    }
  }
}

function notify(s: Slot): void {
  const href = window.location.href
  if (href === s.lastHref) return
  s.lastHref = href
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return
  }
  // Copy: a subscriber may unsubscribe from inside its own callback.
  for (const fn of [...s.subscribers]) fn(url)
}

function install(s: Slot): () => void {
  const fire = (): void => { notify(s) }

  // ── Navigation API: no patching at all ────────────────────────────────────
  const nav = navigationApi()
  if (nav) {
    nav.addEventListener('navigatesuccess', fire)
    return () => { nav.removeEventListener('navigatesuccess', fire) }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  window.addEventListener('popstate', fire)
  window.addEventListener('hashchange', fire)

  /*
   * Reading these unbound is the whole point: we keep the originals to call
   * through with `.apply(this, args)` and to restore on teardown. Binding them
   * here would break the `this` the router expects.
   */
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalPush = history.pushState
  const originalReplace = history.replaceState
  /* eslint-enable @typescript-eslint/unbound-method */

  // queueMicrotask, not a direct call: the router that invoked pushState has
  // not finished its own synchronous work yet, and a subscriber that reads the
  // DOM immediately would see the previous route's markup.
  const ourPush: HistoryFn = function pushState(this: History, ...args) {
    const result = originalPush.apply(this, args)
    queueMicrotask(fire)
    return result
  }
  const ourReplace: HistoryFn = function replaceState(this: History, ...args) {
    const result = originalReplace.apply(this, args)
    queueMicrotask(fire)
    return result
  }

  history.pushState = ourPush
  history.replaceState = ourReplace

  return () => {
    window.removeEventListener('popstate', fire)
    window.removeEventListener('hashchange', fire)
    // Only if ours is still the outermost wrapper. Somebody who patched on top
    // of us has our function in their closure; replacing `history.pushState`
    // wholesale would delete their patch along with ours.
    if (history.pushState === ourPush) history.pushState = originalPush
    if (history.replaceState === ourReplace) history.replaceState = originalReplace
  }
}
