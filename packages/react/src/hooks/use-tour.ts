'use client'

// ---------------------------------------------------------------------------
// useTour — primary hook for controlling a flow from React
// ---------------------------------------------------------------------------

import type { FlowDefinition, GuidanceContext } from '@guideflow/core'
import { useCallback, useSyncExternalStore } from 'react'

import { useGuideFlow } from '../context.js'
import { getTourStore } from '../internal/tour-store.js'

export interface TourState {
  readonly isActive: boolean
  /** True between `pause()` and `resume()`. The flow position is preserved. */
  readonly isPaused: boolean
  readonly currentStepId: string | null
  readonly currentStepIndex: number
  readonly totalSteps: number
}

export interface UseTourReturn extends TourState {
  start: (flow?: FlowDefinition | string, context?: GuidanceContext) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (stepId: string) => Promise<void>
  send: (event: string) => Promise<void>
  stop: () => void
  /** Hide the tour UI without abandoning the flow. */
  pause: () => void
  /** Show a paused tour again, on the step it was paused at. */
  resume: () => void
  /** Dismiss the tour the way a user would — emits `tour:dismiss`, then `tour:abandon`. */
  skip: () => void
}

/**
 * Hook for controlling a GuideFlow tour.
 *
 * State is read through `useSyncExternalStore`, so it cannot tear under
 * concurrent rendering and it is safe during SSR (the server snapshot reports
 * an idle tour).
 *
 * @example
 * ```tsx
 * const { start, next, prev, isActive, currentStepIndex } = useTour()
 *
 * return <button onClick={() => void start(myFlow)}>Start Tour</button>
 * ```
 */
export function useTour(flowId?: string): UseTourReturn {
  const gf = useGuideFlow()
  const store = getTourStore(gf)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot)

  const start = useCallback(
    async (flow?: FlowDefinition | string, context?: GuidanceContext): Promise<void> => {
      const target = flow ?? flowId
      if (!target) {
        console.warn('[GuideFlow] useTour: no flow provided to start()')
        return
      }
      await gf.start(target, context)
    },
    [gf, flowId],
  )

  return {
    isActive: state.isActive,
    isPaused: state.isPaused,
    currentStepId: state.currentStepId,
    currentStepIndex: state.currentStepIndex,
    totalSteps: state.totalSteps,
    start,
    next: useCallback(() => gf.next(), [gf]),
    prev: useCallback(() => gf.prev(), [gf]),
    goTo: useCallback((id: string) => gf.goTo(id), [gf]),
    send: useCallback((event: string) => gf.send(event), [gf]),
    stop: useCallback(() => gf.stop(), [gf]),
    pause: useCallback(() => gf.pause(), [gf]),
    resume: useCallback(() => gf.resume(), [gf]),
    skip: useCallback(() => gf.skip(), [gf]),
  }
}
