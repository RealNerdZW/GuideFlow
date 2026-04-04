// ---------------------------------------------------------------------------
// useTourStep — connects a DOM element to a specific step id
// Useful in headless mode to register refs as tour targets
// ---------------------------------------------------------------------------

import type { HotspotOptions } from '@guideflow/core'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { useGuideFlow } from '../context.js'

export interface UseTourStepReturn<T extends HTMLElement = HTMLElement> {
  ref: RefObject<T>
  isActive: boolean
}

/**
 * Register a React ref as the target for a specific step.
 * Returns `isActive` which is true when this step is currently shown.
 *
 * @example
 * ```tsx
 * const { ref, isActive } = useTourStep('dashboard-header')
 * return <div ref={ref} className={isActive ? 'highlighted' : ''}>...</div>
 * ```
 */
export function useTourStep<T extends HTMLElement = HTMLElement>(
  stepId: string,
): UseTourStepReturn<T> {
  const gf = useGuideFlow()
  const ref = useRef<T>(null)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    const offEnter = gf.on('step:enter', ({ stepId: id }) => {
      setIsActive(id === stepId)
    })
    const offExit = gf.on('step:exit', ({ stepId: id }) => {
      if (id === stepId) setIsActive(false)
    })
    const offAbandon = gf.on('tour:abandon', () => setIsActive(false))
    const offComplete = gf.on('tour:complete', () => setIsActive(false))

    return () => {
      offEnter()
      offExit()
      offAbandon()
      offComplete()
    }
  }, [gf, stepId])

  return { ref, isActive }
}

// ---------------------------------------------------------------------------
// useHotspot — attach a persistent hotspot beacon to a ref
// ---------------------------------------------------------------------------

export interface UseHotspotReturn {
  id: string | null
}

/**
 * Attach a pulsing hotspot beacon to any DOM element.
 *
 * @example
 * ```tsx
 * const divRef = useRef<HTMLDivElement>(null)
 * useHotspot(divRef, { title: 'New feature!', body: 'Click to explore.' })
 * ```
 */
export function useHotspot(
  targetRef: RefObject<HTMLElement>,
  options: HotspotOptions,
): UseHotspotReturn {
  const gf = useGuideFlow()
  const idRef = useRef<string | null>(null)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    idRef.current = gf.hotspot(el, options)

    return () => {
      if (idRef.current) {
        gf.removeHotspot(idRef.current)
        idRef.current = null
      }
    }

  }, [gf, targetRef])

  return { id: idRef.current }
}
