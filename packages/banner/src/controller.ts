// ---------------------------------------------------------------------------
// createBanners() — the headless half.
//
// The visible banner is DERIVED, never pushed. Every input change (hydration,
// dismissal, route change, tour start/end, a new set of definitions) re-runs
// the same pure selection, so `current` is a function of state rather than
// something a caller mutates. That is the checklist's projection discipline
// applied to a different surface, and it is what makes the queue trivially
// correct: dismissing the head does not "advance" anything, it just changes an
// input.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

import { evaluateAll, type EligibleEnv } from './eligible.js'
import { identity } from './identity.js'
import { clearRecord, loadRecord, recordDismissal, type BannerRecord } from './store.js'
import type {
  BannerController,
  BannerDefinition,
  BannerEvaluation,
  BannerEvent,
  BannerOptions,
  BannerState,
  BannerView,
} from './types.js'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

const EMPTY_RECORD: BannerRecord = { v: 1, dismissed: {} }

/** Frozen so SSR and the first client render are the same object shape. */
const IDLE: BannerState = Object.freeze({
  current: null,
  queued: 0,
  tourActive: false,
  persisted: false,
  hydrated: false,
})

export function createBanners<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definitions: readonly BannerDefinition<TContext>[],
  options: BannerOptions = {},
): BannerController<TContext> {
  let banners = [...definitions]
  let record: BannerRecord = EMPTY_RECORD
  let hydrated = false
  let destroyed = false
  let state: BannerState = IDLE

  const listeners = new Set<() => void>()
  const cleanups: Array<() => void> = []
  /** Serialises writes, so two dismissals in one tick cannot lose an entry. */
  let queue: Promise<void> = Promise.resolve()

  function emit(event: BannerEvent): void {
    try {
      options.onEvent?.(event)
    } catch (error) {
      // A host analytics callback must never take the surface down with it.
      console.error('[@guideflow/banner] onEvent threw. It was isolated.', error)
    }
  }

  function env(): EligibleEnv<TContext> {
    return {
      context: gf.context,
      url: isBrowser() ? window.location.href : '',
      now: Date.now(),
      record,
    }
  }

  function evaluate(): readonly BannerEvaluation<TContext>[] {
    return evaluateAll(banners, env())
  }

  /**
   * Reuse the previous `current` object when nothing about it changed.
   *
   * `getSnapshot` must be referentially stable or `useSyncExternalStore` loops
   * forever. Comparing field-by-field rather than by id alone means an edit to
   * the visible banner's copy still produces a new object, which is what a
   * re-render needs.
   */
  function reuse(next: BannerView | null): BannerView | null {
    const prev = state.current
    if (!prev || !next) return next
    if (
      prev.id === next.id &&
      prev.title === next.title &&
      prev.body === next.body &&
      prev.tone === next.tone &&
      prev.dismissible === next.dismissible &&
      prev.actions === next.actions
    ) {
      return prev
    }
    return next
  }

  function toView(def: BannerDefinition<TContext>): BannerView {
    return {
      id: def.id,
      title: def.title,
      body: def.body,
      tone: def.tone ?? 'neutral',
      actions: def.actions ?? [],
      dismissible: def.dismissible ?? true,
    }
  }

  function derive(): void {
    if (destroyed) return
    const results = evaluate()
    const eligible = results.filter((r) => r.eligible)
    const head = eligible[0]
    const current = reuse(head ? toView(head.banner) : null)

    const next: BannerState = {
      current,
      queued: Math.max(0, eligible.length - 1),
      tourActive: gf.isActive,
      persisted: identity(gf, options.anonymousId ?? false) !== null,
      hydrated,
    }

    const changed =
      next.current !== state.current ||
      next.queued !== state.queued ||
      next.tourActive !== state.tourActive ||
      next.persisted !== state.persisted ||
      next.hydrated !== state.hydrated

    if (!changed) return

    const shown = next.current !== null && next.current.id !== state.current?.id
    state = next
    if (shown && next.current) emit({ type: 'show', bannerId: next.current.id })
    for (const listener of [...listeners]) listener()
  }

  async function hydrate(): Promise<void> {
    const userId = identity(gf, options.anonymousId ?? false)
    record = userId === null ? EMPTY_RECORD : await loadRecord(gf.progress, userId)
    hydrated = true
    derive()
  }

  // ── Tour interaction ─────────────────────────────────────────────────────
  //
  // `tourActive` is read from `gf.isActive` at derive time rather than tracked
  // by listener order. The checklist learned this the hard way: listener order
  // flips across a React remount, so inferring "a tour is running" from which
  // handler fired last is wrong exactly when a host re-mounts.

  for (const name of ['tour:start', 'tour:complete', 'tour:abandon'] as const) {
    cleanups.push(gf.on(name, () => { derive() }))
  }

  // Route changes. A banner scoped with `urlPattern` must appear and disappear
  // as the user navigates, and every SPA navigation is a `pushState`.
  //
  // Armed only when something actually declares a `urlPattern`, and re-armed by
  // `setBanners`. `watchHistory` patches `history.pushState` cooperatively, and
  // a package that patched it for every consumer — including the many with no
  // url-scoped banner — would be taking a page-global side effect for nothing.
  let unwatch: (() => void) | null = null

  function syncRouteWatch(): void {
    const needed = isBrowser() && banners.some((b) => b.targeting?.urlPattern !== undefined)
    if (needed && !unwatch) {
      // Imported lazily so a consumer with no url-scoped banner never pulls the
      // navigation subpath into their bundle at all.
      void import('@guideflow/core/navigation').then((nav) => {
        if (destroyed || unwatch) return
        unwatch = nav.watchHistory(() => { derive() })
      })
    } else if (!needed && unwatch) {
      unwatch()
      unwatch = null
    }
  }

  syncRouteWatch()
  void hydrate()

  // ── Public surface ───────────────────────────────────────────────────────

  async function dismiss(bannerId: string): Promise<void> {
    if (destroyed) return
    const def = banners.find((b) => b.id === bannerId)
    if (!def) return

    const userId = identity(gf, options.anonymousId ?? false)
    if (userId === null) {
      // No identity: suppress for this session only, in memory. Nothing is
      // written, and the banner returns on reload — stated on the docs page
      // rather than left to be discovered.
      record = {
        v: 1,
        dismissed: {
          ...record.dismissed,
          [bannerId]: { ...(def.version !== undefined && { ver: def.version }), at: Date.now() },
        },
      }
      emit({ type: 'dismiss', bannerId })
      derive()
      return
    }

    const run = queue.then(async () => {
      record = await recordDismissal(gf.progress, userId, bannerId, def.version)
      emit({ type: 'dismiss', bannerId })
      derive()
    })
    queue = run.catch(() => undefined)
    return run
  }

  async function select(index: number): Promise<void> {
    if (destroyed) return
    const current = state.current
    if (!current) return
    const action = current.actions[index]
    if (!action) return

    emit({ type: 'action', bannerId: current.id, label: action.label })

    // Dismiss FIRST when asked, so the record is written even if the handler
    // throws or navigates the page away.
    if (action.dismisses) await dismiss(current.id)

    if (action.onSelect) {
      await action.onSelect()
      return
    }
    if (action.flowId !== undefined) {
      // Never interrupt: `gf.start()` ends a running tour first, which emits
      // `tour:abandon` — analytics would log that as the user giving up. This
      // is the same discipline `targeting.autoStart()` applies.
      if (gf.isActive) return
      await gf.start(action.flowId)
    }
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    getServerSnapshot: () => IDLE,

    evaluate,
    dismiss,
    select,

    setBanners(next: readonly BannerDefinition<TContext>[]): void {
      if (destroyed) return
      banners = [...next]
      syncRouteWatch()
      derive()
    },

    async reset(): Promise<void> {
      const userId = identity(gf, options.anonymousId ?? false)
      record = EMPTY_RECORD
      if (userId !== null) await clearRecord(gf.progress, userId)
      derive()
    },

    async refresh(): Promise<void> {
      hydrated = false
      await hydrate()
    },

    destroy(): void {
      destroyed = true
      for (const off of cleanups) off()
      cleanups.length = 0
      unwatch?.()
      unwatch = null
      listeners.clear()
    },
  }
}
