// ---------------------------------------------------------------------------
// Tour state store — the external store every React hook subscribes to
//
// `useSyncExternalStore` requires a `getSnapshot` that is cheap, and that
// returns the *same object reference* while nothing has changed. The engine
// only exposes mutable getters, so this module derives an immutable snapshot
// and caches it, rebuilding it only when a field actually differs.
// ---------------------------------------------------------------------------

import type { GuideFlowInstance } from '@guideflow/core'

export interface TourSnapshot {
  readonly isActive: boolean
  /** True between `gf.pause()` and `gf.resume()`. */
  readonly isPaused: boolean
  readonly currentStepId: string | null
  readonly currentStepIndex: number
  readonly totalSteps: number
}

/** The snapshot for "no tour running" — a frozen singleton so identity is stable. */
const IDLE: TourSnapshot = Object.freeze({
  isActive: false,
  isPaused: false,
  currentStepId: null,
  currentStepIndex: 0,
  totalSteps: 0,
})

export interface TourStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => TourSnapshot
  getServerSnapshot: () => TourSnapshot
}

function same(a: TourSnapshot, b: TourSnapshot): boolean {
  return (
    a.isActive === b.isActive &&
    a.isPaused === b.isPaused &&
    a.currentStepId === b.currentStepId &&
    a.currentStepIndex === b.currentStepIndex &&
    a.totalSteps === b.totalSteps
  )
}

export function createTourStore(gf: GuideFlowInstance): TourStore {
  const listeners = new Set<() => void>()
  let offs: Array<() => void> = []
  // `_paused` is private to TourEngine and there is no public getter, so the
  // store tracks it from the tour:pause / tour:resume events instead.
  let paused = false

  function read(): TourSnapshot {
    if (!gf.isActive) return IDLE
    return {
      isActive: true,
      isPaused: paused,
      currentStepId: gf.currentStepId,
      currentStepIndex: gf.currentStepIndex,
      totalSteps: gf.totalSteps,
    }
  }

  let snapshot: TourSnapshot = read()

  function refresh(): void {
    const next = read()
    if (same(snapshot, next)) return
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  function attach(): void {
    offs = [
      gf.on('tour:start', () => { paused = false; refresh() }),
      gf.on('tour:complete', () => { paused = false; refresh() }),
      gf.on('tour:abandon', () => { paused = false; refresh() }),
      gf.on('tour:pause', () => { paused = true; refresh() }),
      gf.on('tour:resume', () => { paused = false; refresh() }),
      gf.on('step:enter', () => refresh()),
      gf.on('step:exit', () => refresh()),
    ]
  }

  function detach(): void {
    offs.forEach((off) => off())
    offs = []
    paused = false
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (offs.length === 0) attach()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) detach()
      }
    },
    /**
     * Recomputes on every call rather than trusting the cache: an event can fire
     * between render and the subscription being installed, and React compares
     * this value again immediately after subscribing.
     */
    getSnapshot() {
      const next = read()
      if (!same(snapshot, next)) snapshot = next
      return snapshot
    },
    getServerSnapshot() {
      return IDLE
    },
  }
}

/**
 * One store per instance, so N components share one set of engine listeners.
 * Keyed weakly — a destroyed instance and its store are collectable together.
 */
const _stores = new WeakMap<GuideFlowInstance, TourStore>()

export function getTourStore(gf: GuideFlowInstance): TourStore {
  let store = _stores.get(gf)
  if (!store) {
    store = createTourStore(gf)
    _stores.set(gf, store)
  }
  return store
}
