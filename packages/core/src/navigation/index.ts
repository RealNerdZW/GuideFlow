/**
 * `@guideflow/core/navigation` — route-aware target resolution.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { createNavigation } from '@guideflow/core/navigation'
 *
 * const gf = createGuideFlow({
 *   navigation: createNavigation({
 *     // Recommended: wire your own router and GuideFlow never touches history.
 *     subscribe: (onChange) => router.subscribe(() => onChange(new URL(location.href))),
 *     navigate: (url) => router.push(url),
 *   }),
 * })
 * ```
 *
 * A separate entry point because it is ~1.6 kB that a single-page tour does not
 * need, and `@guideflow/core` is size-gated. Without it the engine resolves each
 * target once with `querySelector` — the behaviour that predates this module.
 */
import type {
  GuidanceContext,
  NavigationAdapter,
  ResolveTargetRequest,
  ResolveTargetResult,
  TimeoutReason,
} from '../types/index.js'

import { watchHistory } from './history.js'
import { matchRoute } from './route.js'
import { waitForElement } from './wait.js'

export { matchRoute, currentUrl } from './route.js'
export { waitForElement } from './wait.js'
export type { WaitForElementOptions } from './wait.js'
export { watchHistory } from './history.js'
export { advanceOn } from './advance.js'
export type { AdvanceOnHost, AdvanceOnRule, AdvanceOnSpec } from './advance.js'

export interface NavigationConfig {
  /**
   * Where route changes come from.
   *
   * Supply this and GuideFlow **never touches `history`** — the recommended
   * integration for React Router, Next, Vue Router and SvelteKit, all of which
   * patch history themselves. Omit it and the built-in watcher is used, which
   * prefers the Navigation API and only patches as a fallback.
   */
  subscribe?: (onChange: (url: URL) => void) => () => void
  /**
   * Drive the router when a state declares a route the app is not on.
   *
   * Omit it and the engine waits passively for the user to navigate — which is
   * the right default for a tour that is *teaching* navigation.
   */
  navigate?: (url: string, direction: 'forward' | 'backward') => void | Promise<void>
  /** Default per-step wait for a target element, ms. Default 5000. */
  waitForTarget?: number
  /** Max wait for a state's `route` to match, ms. Default 15_000. */
  waitForRoute?: number
  /**
   * Grace period before the busy affordance appears, ms. Default 400.
   *
   * A route that arrives in 80 ms should not flash a spinner; one that takes
   * three seconds must not look frozen.
   */
  indicatorDelay?: number
}

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * Build a {@link NavigationAdapter}.
 *
 * Deadlines are **absolute**. A navigation re-checks whether the route matches;
 * it never resets the timer. Resetting on every navigation means a redirect
 * bounce waits forever.
 */
export function createNavigation<TContext extends GuidanceContext = GuidanceContext>(
  config: NavigationConfig = {},
): NavigationAdapter<TContext> {
  const waitForRoute = config.waitForRoute ?? 15_000
  const defaultTargetWait = config.waitForTarget ?? 5000
  const indicatorDelay = config.indicatorDelay ?? 400

  /**
   * States we have already asked the router to navigate to, for this tour.
   * Without it a route that redirects would be re-pushed on every check and the
   * app would fight itself.
   */
  let navigatedFor = new Set<string>()

  async function resolveTarget(
    req: ResolveTargetRequest<TContext>,
  ): Promise<ResolveTargetResult> {
    if (!isBrowser()) return { target: null }

    const route = req.state.route
    let timedOut: TimeoutReason | undefined

    // ── Phase 1: the route ──────────────────────────────────────────────────
    if (route !== undefined && !matchRoute(route)) {
      const key = typeof route === 'string' ? route : String(req.step.id)
      if (config.navigate && !navigatedFor.has(key)) {
        navigatedFor.add(key)
        if (typeof route === 'string') {
          try {
            await config.navigate(route, req.direction)
          } catch {
            // A router that refuses is not fatal — fall through and wait for
            // the user, which is what happens with no `navigate` at all.
          }
        }
      }
      const matched = await waitFor(
        () => matchRoute(route),
        waitForRoute,
        req.signal,
        () => { req.onWaiting('route') },
        indicatorDelay,
      )
      if (!matched) timedOut = 'route'
      if (req.signal.aborted) return { target: null }
    }

    // ── Phase 2: the element ────────────────────────────────────────────────
    const target = req.step.target
    if (target == null) return withTimeout({ target: null }, timedOut)

    if (typeof target === 'function') {
      const el = await target(req.context)
      return withTimeout({ target: el ?? null }, timedOut)
    }
    if (typeof target !== 'string') {
      return withTimeout({ target: target }, timedOut)
    }

    const timeoutMs = req.step.waitForTarget ?? defaultTargetWait
    const immediate = document.querySelector(target)
    if (immediate) return withTimeout({ target: immediate }, timedOut)
    if (timeoutMs <= 0) return withTimeout({ target: null }, timedOut ?? 'target')

    // Only now does the wait become user-visible.
    const indicator = setTimeout(() => { req.onWaiting('target') }, indicatorDelay)
    try {
      const el = await waitForElement(target, { timeoutMs, signal: req.signal })
      if (el === null && !req.signal.aborted) timedOut = timedOut ?? 'target'
      return withTimeout({ target: el }, timedOut)
    } finally {
      clearTimeout(indicator)
    }
  }

  const adapter: NavigationAdapter<TContext> = {
    resolveTarget,
    attach(onChange) {
      navigatedFor = new Set()
      const subscribe = config.subscribe ?? watchHistory
      return subscribe(() => { onChange() })
    },
    destroy() {
      navigatedFor = new Set()
    },
  }
  return adapter
}

/** `exactOptionalPropertyTypes` forbids assigning an explicit `undefined`. */
function withTimeout(
  result: { target: Element | null },
  timedOut: TimeoutReason | undefined,
): ResolveTargetResult {
  return { ...result, ...(timedOut !== undefined && { timedOut }) }
}

/**
 * Poll a predicate until it holds, the deadline passes, or the signal aborts.
 *
 * Same rAF-plus-parallel-timer shape as `waitForElement`, and for the same
 * reason: rAF is throttled to zero in a background tab, so a rAF-derived
 * deadline would never fire there and the awaiting render would hang.
 */
function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  signal: AbortSignal,
  onSlow: () => void,
  slowAfterMs: number,
): Promise<boolean> {
  if (predicate()) return Promise.resolve(true)
  if (signal.aborted) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    let rafId = 0
    let deadline: ReturnType<typeof setTimeout> | undefined = undefined
    let indicator: ReturnType<typeof setTimeout> | undefined = undefined

    const done = (ok: boolean): void => {
      if (rafId) cancelAnimationFrame(rafId)
      if (deadline !== undefined) clearTimeout(deadline)
      if (indicator !== undefined) clearTimeout(indicator)
      signal.removeEventListener('abort', onAbort)
      resolve(ok)
    }
    const onAbort = (): void => done(false)
    signal.addEventListener('abort', onAbort, { once: true })

    deadline = setTimeout(() => done(false), timeoutMs)
    indicator = setTimeout(onSlow, slowAfterMs)

    const tick = (): void => {
      if (predicate()) {
        done(true)
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  })
}
