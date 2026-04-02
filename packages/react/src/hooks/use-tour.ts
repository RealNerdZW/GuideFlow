// ---------------------------------------------------------------------------
// useTour — primary hook for controlling a flow from React
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from 'react'
import type { FlowDefinition, GuidanceContext, TourEvents } from '@guideflow/core'
import { useGuideFlow } from '../context.js'

export interface TourState {
  isActive: boolean
  currentStepId: string | null
  currentStepIndex: number
  totalSteps: number
}

export interface UseTourReturn extends TourState {
  start: (flow?: FlowDefinition | string, context?: GuidanceContext) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (stepId: string) => Promise<void>
  send: (event: string) => Promise<void>
  stop: () => void
}

type TourEventMap = TourEvents

/**
 * Hook for controlling a GuideFlow tour.
 *
 * @example
 * ```tsx
 * const { start, next, prev, isActive, currentStepIndex } = useTour()
 *
 * return <button onClick={() => start(myFlow)}>Start Tour</button>
 * ```
 */
export function useTour(flowId?: string): UseTourReturn {
  const gf = useGuideFlow()

  const [state, setState] = useState<TourState>({
    isActive: gf.isActive,
    currentStepId: gf.currentStepId,
    currentStepIndex: gf.currentStepIndex,
    totalSteps: gf.totalSteps,
  })

  useEffect(() => {
    const syncState = (): void => {
      setState({
        isActive: gf.isActive,
        currentStepId: gf.currentStepId,
        currentStepIndex: gf.currentStepIndex,
        totalSteps: gf.totalSteps,
      })
    }

    const events: Array<keyof TourEventMap> = [
      'tour:start',
      'tour:complete',
      'tour:abandon',
      'step:enter',
      'step:exit',
    ]
    const cleanups = events.map((ev) =>
      gf.on(ev as keyof TourEventMap, () => syncState()),
    )
    return () => cleanups.forEach((fn) => fn())
  }, [gf])

  const start = useCallback(
    async (flow?: FlowDefinition | string, context?: GuidanceContext): Promise<void> => {
      const target = flow ?? flowId
      if (!target) {
        console.warn('[GuideFlow] useTour: no flow provided to start()')
        return
      }
      await gf.start(target as FlowDefinition, context)
    },
    [gf, flowId],
  )

  return {
    ...state,
    start,
    next: useCallback(() => gf.next(), [gf]),
    prev: useCallback(() => gf.prev(), [gf]),
    goTo: useCallback((id: string) => gf.goTo(id), [gf]),
    send: useCallback((event: string) => gf.send(event), [gf]),
    stop: useCallback(() => gf.stop(), [gf]),
  }
}
