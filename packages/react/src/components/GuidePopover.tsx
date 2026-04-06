// ---------------------------------------------------------------------------
// <GuidePopover> — themed default popover component
// Uses CSS custom properties from @guideflow/core tokens
// ---------------------------------------------------------------------------

import { computePosition, getViewportRect, defaultI18n } from '@guideflow/core'
import type { StepContent, Step, PopoverPlacement } from '@guideflow/core'
import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useGuideFlow } from '../context.js'

export interface GuidePopoverProps {
  /** Override popover width */
  width?: number
  /**
   * Optional custom content to render inside the popover instead of the
   * default title/body layout. Receives the active step context.
   */
  children?: ReactNode | ((props: { step: Step; content: StepContent; index: number; total: number }) => ReactNode)
  className?: string
}

interface ActiveStep {
  step: Step
  content: StepContent
  index: number
  total: number
  target: HTMLElement | null
}

/**
 * Renders the default GuideFlow popover using React portals.
 * Mount once at the root of your app alongside <TourProvider>.
 *
 * @example
 * ```tsx
 * <TourProvider config={...}>
 *   <App />
 *   <GuidePopover />
 * </TourProvider>
 * ```
 */
export function GuidePopover({ width = 320, className, children }: GuidePopoverProps): React.JSX.Element | null {
  const gf = useGuideFlow()
  const popoverRef = useRef<HTMLDivElement>(null)
  const [activeStep, setActiveStep] = useState<ActiveStep | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0, placement: 'bottom' as PopoverPlacement })
  const i18n = defaultI18n
  // Generate stable unique IDs for ARIA references (avoids duplicate IDs in concurrent renders)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const offEnter = gf.on('step:enter', ({ stepId, target }) => {
      // currentStep and currentContent are set by TourEngine before step:enter fires
      const step: Step = (gf.currentStep as Step) ?? {
        id: stepId,
        content: { title: '', body: '' },
        target: (target as HTMLElement) ?? null,
      }
      const content: StepContent = gf.currentContent ?? (
        typeof step.content !== 'function' ? step.content : { title: '', body: '' }
      )
      setActiveStep({
        step,
        content,
        index: gf.currentStepIndex,
        total: gf.totalSteps,
        target: target as HTMLElement | null,
      })
    })
    const offExit = gf.on('step:exit', () => setActiveStep(null))
    const offAbort = gf.on('tour:abandon', () => setActiveStep(null))
    const offDone = gf.on('tour:complete', () => setActiveStep(null))
    return () => { offEnter(); offExit(); offAbort(); offDone() }
  }, [gf])

  // Compute and update popover position
  const updatePosition = React.useCallback(() => {
    if (!activeStep || !popoverRef.current) return
    const el = popoverRef.current
    const popoverRect = { x: 0, y: 0, width: el.offsetWidth, height: el.offsetHeight }
    const viewport = getViewportRect()

    if (!activeStep.target) {
      setPosition({ x: window.innerWidth / 2 - el.offsetWidth / 2, y: window.innerHeight / 2 - el.offsetHeight / 2, placement: 'center' })
      return
    }
    const tr = activeStep.target.getBoundingClientRect()
    const pos = computePosition(
      { x: tr.left, y: tr.top, width: tr.width, height: tr.height },
      popoverRect,
      (activeStep.step.placement ?? 'bottom'),
      viewport,
    )
    setPosition(pos)
  }, [activeStep])

  // Position after render and on window resize
  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  useEffect(() => {
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [updatePosition])

  if (!activeStep) return null

  const { content, index, total } = activeStep
  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100

  // Allow fully custom content via children prop
  const customContent = typeof children === 'function'
    ? children({ step: activeStep.step, content, index, total })
    : children

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={`gf-popover${className ? ` ${className}` : ''}`}
      data-enter=""
      data-placement={position.placement}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width,
        zIndex: 999999,
      }}
    >
      {customContent ?? (
        <>
          {total > 1 && (
            <div className="gf-progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="gf-progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
          <div className="gf-popover-header">
            {content.title && <h2 className="gf-popover-title" id={titleId}>{content.title}</h2>}
            <button
              className="gf-popover-close"
              onClick={() => gf.stop()}
              aria-label={i18n.t('close')}
              type="button"
            >×</button>
          </div>
          {content.body && <p className="gf-popover-body" id={bodyId}>{content.body}</p>}
          <div className="gf-popover-footer">
            <span className="gf-popover-step-info">
              {total > 1 && i18n.t('stepOf', { current: index + 1, total })}
            </span>
            <div className="gf-popover-actions">
              <button className="gf-btn gf-btn-ghost" onClick={() => gf.stop()} type="button">
                {i18n.t('skip')}
              </button>
              {index > 0 && (
                <button className="gf-btn gf-btn-secondary" onClick={() => void gf.prev()} type="button">
                  {i18n.t('prev')}
                </button>
              )}
              <button className="gf-btn gf-btn-primary" onClick={() => void gf.next()} type="button">
                {index === total - 1 ? i18n.t('done') : i18n.t('next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}
