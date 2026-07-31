'use client'

// ---------------------------------------------------------------------------
// useTourStep — track whether a given step is the one on screen
// useHotspot — attach a persistent beacon to a ref
// ---------------------------------------------------------------------------

import type { HotspotOptions } from '@guideflow/core'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'

import { useGuideFlow } from '../context.js'
import { getTourStore } from '../internal/tour-store.js'

export interface UseTourStepReturn<T extends HTMLElement = HTMLElement> {
  /**
   * A plain ref for your own use — attach it to style the element, measure it,
   * or scroll it. It does **not** register the element as the step's target:
   * targets come from the `target` field of the step in your `FlowDefinition`.
   */
  ref: RefObject<T>
  /** True while this step is the one on screen. A paused tour reports `false`. */
  isActive: boolean
}

/**
 * Track whether the step with this id is currently displayed.
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
  const store = getTourStore(gf)

  const getIsActive = useCallback((): boolean => {
    const snapshot = store.getSnapshot()
    return snapshot.isActive && !snapshot.isPaused && snapshot.currentStepId === stepId
  }, [store, stepId])

  const isActive = useSyncExternalStore(store.subscribe, getIsActive, getServerIsActive)

  return { ref, isActive }
}

function getServerIsActive(): boolean {
  return false
}

// ---------------------------------------------------------------------------
// useHotspot — attach a persistent hotspot beacon to a ref
// ---------------------------------------------------------------------------

export interface UseHotspotReturn {
  /** The registered hotspot id, or `null` before the beacon is attached. */
  id: string | null
}

/**
 * Attach a pulsing hotspot beacon to any DOM element for as long as the
 * component is mounted.
 *
 * The beacon is created in an effect, so `id` is `null` on the first render and
 * the real id on the next one. Nothing happens if the ref is still empty when
 * the effect runs.
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
  // State, not a ref: a ref assigned inside an effect never reaches the caller,
  // so `id` was permanently null — AUDIT `react-usehotspot-returns-null-id`.
  const [id, setId] = useState<string | null>(null)
  // Stable reference to options — avoids re-creating the hotspot on every render
  // while still picking up genuine prop changes.
  const optionsRef = useRef<HotspotOptions>(options)
  useEffect(() => { optionsRef.current = options })

  useEffect(() => {
    const el = targetRef.current
    if (!el) return undefined

    const hotspotId = gf.hotspot(el, optionsRef.current)
    setId(hotspotId)

    return () => {
      gf.removeHotspot(hotspotId)
      setId((current) => (current === hotspotId ? null : current))
    }
  }, [gf, targetRef])

  return { id }
}
