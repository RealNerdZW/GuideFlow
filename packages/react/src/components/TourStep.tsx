'use client'

// ---------------------------------------------------------------------------
// <TourStep> — visibility switch keyed on a step id
// Renders its children only while that step is on screen. It does not draw a
// popover and does not register a step with the engine.
// ---------------------------------------------------------------------------

import React, { type ReactNode } from 'react'

import { useGuideFlow } from '../context.js'
import { useTourStep } from '../hooks/use-tour-step.js'

export interface TourStepProps {
  /**
   * Unique step identifier — must match the `id` of a step in your FlowDefinition.
   * This is the only prop used to activate/deactivate the component.
   */
  id: string
  children?: ReactNode | ((props: { next: () => void; prev: () => void; isActive: boolean }) => ReactNode)
}

/**
 * Render content while a named step is active.
 *
 * A paused tour reports its step as inactive, so children are hidden by
 * `gf.pause()` and shown again by `gf.resume()`.
 *
 * @example
 * ```tsx
 * <TourStep id="dashboard-header">
 *   {({ next }) => <button onClick={next}>Continue</button>}
 * </TourStep>
 * ```
 */
export function TourStep({ id, children }: TourStepProps): React.JSX.Element | null {
  const gf = useGuideFlow()
  const { isActive } = useTourStep(id)

  if (!isActive || !children) return null

  const renderProps = {
    next: () => void gf.next(),
    prev: () => void gf.prev(),
    isActive,
  }

  return (
    <>{typeof children === 'function' ? children(renderProps) : children}</>
  )
}
