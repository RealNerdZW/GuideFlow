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
  /**
   * True while the engine waits for a route change or a target element.
   *
   * Not derivable from the other fields: the store refreshes on `step:exit`,
   * which fires *before* the render, so without this React shows the new step
   * index against no popover and has no way to branch.
   */
  readonly isWaiting: boolean
  readonly currentStepId: string | null
  readonly currentStepIndex: number
  readonly totalSteps: number
}

/** The snapshot for "no tour running" — a frozen singleton so identity is stable. */
const IDLE: TourSnapshot = Object.freeze({
  isActive: false,
  isPaused: false,
  isWaiting: false,
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

  /**
   * Every field is read from the instance at call time — the store keeps no
   * mirrored copy of anything, `isPaused` included. A mirror fed only by
   * `tour:pause` / `tour:resume` was wrong twice over: it started at `false`,
   * so the first consumer to mount during an already-paused tour saw a running
   * one; and because the subscription is ref-counted, pause/resume that
   * happened while no component was subscribed were never observed at all.
   *
   * Ending a tour needs no special case here. `_doEnd()` clears `_active`
   * *before* it emits `tour:complete` / `tour:abandon`, so `gf.isActive` is
   * already false by the time those handlers run and this returns IDLE — which
   * is why the Vue and Svelte stores hard-code their idle values and this does
   * not.
   */
  function read(): TourSnapshot {
    if (!gf.isActive) return IDLE
    return {
      isActive: true,
      isPaused: gf.isPaused,
      isWaiting: gf.isWaiting,
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

  // These events carry no state — they exist only to tell React when to
  // re-read. The values themselves always come from the instance, via read().
  function attach(): void {
    offs = [
      gf.on('tour:start', () => refresh()),
      gf.on('tour:complete', () => refresh()),
      gf.on('tour:abandon', () => refresh()),
      gf.on('tour:pause', () => refresh()),
      gf.on('tour:resume', () => refresh()),
      gf.on('step:enter', () => refresh()),
      gf.on('step:exit', () => refresh()),
      gf.on('step:waiting', () => refresh()),
      gf.on('step:timeout', () => refresh()),
    ]
  }

  function detach(): void {
    offs.forEach((off) => off())
    offs = []
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
