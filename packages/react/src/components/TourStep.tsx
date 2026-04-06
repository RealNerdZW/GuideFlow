// ---------------------------------------------------------------------------
// <TourStep> — declarative step component
// Register a DOM element as a tour target and optionally render custom content
// ---------------------------------------------------------------------------

import React, { useEffect, type ReactNode } from 'react'

import { useGuideFlow } from '../context.js'

export interface TourStepProps {
  /**
   * Unique step identifier — must match the `id` of a step in your FlowDefinition.
   * This is the only prop used to activate/deactivate the component.
   */
  id: string
  children?: ReactNode | ((props: { next: () => void; prev: () => void; isActive: boolean }) => ReactNode)
}

/**
 * Declaratively define a tour step in JSX. The component registers the
 * step with the nearest <TourProvider> and renders children when active.
 *
 * @example
 * ```tsx
 * <TourStep id="dashboard-header" target="#header" title="Welcome!" body="This is your dashboard">
 *   {({ next }) => <button onClick={next}>Continue</button>}
 * </TourStep>
 * ```
 */
export function TourStep({ id, children }: TourStepProps): React.JSX.Element | null {

  const gf = useGuideFlow()
  const [isActive, setIsActive] = React.useState(false)

  useEffect(() => {
    const offEnter = gf.on('step:enter', ({ stepId }) => setIsActive(stepId === id))
    const offExit = gf.on('step:exit', ({ stepId }) => { if (stepId === id) setIsActive(false) })
    const offAbort = gf.on('tour:abandon', () => setIsActive(false))
    const offDone = gf.on('tour:complete', () => setIsActive(false))
    return () => { offEnter(); offExit(); offAbort(); offDone() }
  }, [gf, id])

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
