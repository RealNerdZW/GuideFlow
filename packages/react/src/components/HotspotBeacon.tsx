// ---------------------------------------------------------------------------
// <HotspotBeacon> — renders a pulsing beacon attached to a ref or selector 
// ---------------------------------------------------------------------------

import type { HotspotOptions } from '@guideflow/core'
import { useRef, useEffect } from 'react'

import { useGuideFlow } from '../context.js'

export interface HotspotBeaconProps extends HotspotOptions {
  /** CSS selector for the target element */
  target: string
}

/**
 * Mount a persistent pulsing hotspot beacon on any element.
 *
 * @example
 * ```tsx
 * <HotspotBeacon target="#new-feature-btn" title="New!" body="Click to try the new dashboard." />
 * ```
 */
export function HotspotBeacon({ target, ...options }: HotspotBeaconProps): null {
  const gf = useGuideFlow()
  const idRef = useRef<string | null>(null)
  // Keep a stable ref to options so the hotspot is recreated only when
  // `target` or `gf` changes, but still picks up option prop updates.
  const optionsRef = useRef<HotspotOptions>(options)
  useEffect(() => { optionsRef.current = options })

  useEffect(() => {
    idRef.current = gf.hotspot(target, optionsRef.current)
    return () => {
      if (idRef.current) {
        gf.removeHotspot(idRef.current)
        idRef.current = null
      }
    }
  }, [gf, target])

  return null
}
