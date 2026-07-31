'use client'

// ---------------------------------------------------------------------------
// <GuidePopover> — the React-rendered popover
//
// Only draws in `renderer="react"` mode, where core has been given a headless
// renderer and draws nothing itself. In the default `renderer="core"` mode this
// component renders null: core's DefaultRenderer owns the popover, and drawing
// a second one produced two stacked `aria-modal` dialogs
// (AUDIT `react-guidepopover-duplicates-core-renderer`).
// ---------------------------------------------------------------------------

import { computePosition, getViewportRect } from '@guideflow/core'
import type { PopoverPlacement, Step, StepAction, StepContent } from '@guideflow/core'
import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useTourContext } from '../context.js'
import { warnOnce } from '../internal/dev.js'
import { useIsomorphicLayoutEffect } from '../internal/use-isomorphic-layout-effect.js'
import type { HeadlessRenderer } from '../renderer/headless-renderer.js'

export interface GuidePopoverRenderProps {
  step: Step
  content: StepContent
  index: number
  total: number
  /** Advance — completes the tour on the last step. */
  next: () => void
  prev: () => void
  /** Dismiss as a user would: emits `tour:dismiss`, then `tour:abandon`. */
  skip: () => void
  /** Close the popover and end the tour without completing it. */
  close: () => void
  /** Run any action string through core's handler (`next`/`prev`/`skip`/`end`/FSM event). */
  dispatch: (action: string) => void
}

export interface GuidePopoverProps {
  /** Override popover width. Default `320`. */
  width?: number
  /**
   * Optional custom content to render inside the popover instead of the
   * default title/body layout. Receives the active step context.
   */
  children?: ReactNode | ((props: GuidePopoverRenderProps) => ReactNode)
  className?: string
}

interface Position {
  x: number
  y: number
  placement: PopoverPlacement
}

/**
 * Renders the active tour step as a popover, through a React portal.
 *
 * Requires `<TourProvider renderer="react">` (or a provider given your own
 * {@link HeadlessRenderer}). Under the default `renderer="core"` it renders
 * nothing and warns once, because core is already drawing the popover.
 *
 * @example
 * ```tsx
 * <TourProvider renderer="react">
 *   <App />
 *   <GuidePopover />
 * </TourProvider>
 * ```
 */
export function GuidePopover(props: GuidePopoverProps): React.JSX.Element | null {
  const { renderer } = useTourContext()

  useEffect(() => {
    if (renderer) return
    warnOnce(
      'guidepopover-core-mode',
      '[GuideFlow] <GuidePopover> renders nothing because this provider is in renderer="core" mode, ' +
        "where core's DefaultRenderer already draws the popover. Pass " +
        '<TourProvider renderer="react"> to let React draw it instead, or remove <GuidePopover>.',
    )
  }, [renderer])

  if (!renderer) return null
  return <ReactPopover {...props} renderer={renderer} />
}

// ── Implementation ──────────────────────────────────────────────────────────

interface ReactPopoverProps extends GuidePopoverProps {
  renderer: HeadlessRenderer
}

function ReactPopover({
  width = 320,
  className,
  children,
  renderer,
}: ReactPopoverProps): React.JSX.Element | null {
  const { instance: gf } = useTourContext()
  const state = useSyncExternalStore(renderer.subscribe, renderer.getSnapshot, renderer.getServerSnapshot)
  const popoverRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const titleId = useId()
  const bodyId = useId()

  const updatePosition = useCallback((): void => {
    const el = popoverRef.current
    if (!el || !state) return

    const popoverRect = { x: 0, y: 0, width: el.offsetWidth, height: el.offsetHeight }
    const target = resolveTarget(state.step.target)

    const next: Position = target
      ? toPosition(computePosition(
        toRect(target.getBoundingClientRect()),
        popoverRect,
        state.step.placement ?? 'bottom',
        getViewportRect(),
      ))
      : {
        x: window.innerWidth / 2 - popoverRect.width / 2,
        y: window.innerHeight / 2 - popoverRect.height / 2,
        placement: 'center',
      }

    setPosition((prev) =>
      prev && prev.x === next.x && prev.y === next.y && prev.placement === next.placement ? prev : next,
    )
  }, [state])

  // Measure and place *before* the browser paints, then follow the page.
  // A passive useEffect painted the popover at 0,0 for one frame first, and
  // scroll was never tracked at all — AUDIT
  // `react-guidepopover-position-flash-and-no-scroll-tracking`.
  useIsomorphicLayoutEffect(() => {
    if (!state) {
      setPosition(null)
      return undefined
    }
    updatePosition()

    window.addEventListener('scroll', updatePosition, { passive: true, capture: true })
    window.addEventListener('resize', updatePosition, { passive: true })
    return () => {
      window.removeEventListener('scroll', updatePosition, { capture: true })
      window.removeEventListener('resize', updatePosition)
    }
  }, [state, updatePosition])

  // Move focus into the dialog on every step, and hand it back when the tour
  // ends or pauses. A full focus trap is Phase 6 — this closes
  // AUDIT `react-popover-never-focuses`.
  useEffect(() => {
    if (!state) {
      const previous = restoreFocusRef.current
      restoreFocusRef.current = null
      previous?.focus()
      return
    }
    const el = popoverRef.current
    if (!el) return
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLElement && !el.contains(active)) {
      restoreFocusRef.current = active
    }
    const focusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(focusable ?? el).focus()
  }, [state])

  if (!state) return null

  const { step, content, index, total } = state
  const i18n = gf.i18n
  const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100
  const isLast = index === total - 1

  const dispatch = (action: string): void => { renderer.dispatch(action) }

  const renderProps: GuidePopoverRenderProps = {
    step,
    content,
    index,
    total,
    next: () => dispatch('next'),
    prev: () => dispatch('prev'),
    skip: () => dispatch('skip'),
    close: () => dispatch('end'),
    dispatch,
  }

  const customContent = typeof children === 'function' ? children(renderProps) : children

  // Mirrors DefaultRenderer._buildHTML, with one deliberate difference: the
  // final button dispatches `next`, not `end`. `next()` on the last step ends
  // the tour through the completed path (`tour:complete`); `end` maps to
  // `stop()`, which reports the tour as abandoned.
  const defaultActions: StepAction[] = []
  if (index > 0) {
    defaultActions.push({ label: i18n.t('prev'), variant: 'secondary', action: 'prev' })
  }
  defaultActions.push({
    label: isLast ? i18n.t('done') : i18n.t('next'),
    variant: 'primary',
    action: 'next',
  })
  const actions: StepAction[] = step.actions ?? defaultActions

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={content.title ? titleId : undefined}
      aria-describedby={bodyId}
      tabIndex={-1}
      className={`gf-popover${className ? ` ${className}` : ''}`}
      data-enter=""
      data-placement={position?.placement ?? step.placement ?? 'bottom'}
      style={{
        position: 'fixed',
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        width,
        zIndex: 999999,
        // Hidden until measured, so it never paints at the origin first.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {customContent ?? (
        <>
          {total > 1 && (
            <div
              className="gf-progress-bar"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="gf-progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
          <div className="gf-popover-header">
            {content.title && <h2 className="gf-popover-title" id={titleId}>{content.title}</h2>}
            <button
              className="gf-popover-close"
              onClick={() => dispatch('end')}
              aria-label={i18n.t('close')}
              type="button"
            >×</button>
          </div>
          {step.media && <StepMedia media={step.media} />}
          <div className="gf-popover-body" id={bodyId}>
            {content.body ?? (content.html !== undefined ? htmlToText(content.html) : null)}
          </div>
          <div className="gf-popover-footer">
            <span className="gf-popover-step-info">
              {total > 1 && i18n.t('stepOf', { current: index + 1, total })}
            </span>
            <div className="gf-popover-actions">
              <button className="gf-btn gf-btn-ghost" onClick={() => dispatch('skip')} type="button">
                {i18n.t('skip')}
              </button>
              {actions.map((action, i) => (
                <button
                  key={`${action.action}-${i}`}
                  className={`gf-btn gf-btn-${action.variant ?? 'primary'}`}
                  onClick={() => dispatch(action.action)}
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function StepMedia({ media }: { media: NonNullable<Step['media']> }): React.JSX.Element {
  if (media.type === 'video') {
    return <video className="gf-popover-media" src={media.src} controls />
  }
  return <img className="gf-popover-media" src={media.src} alt={media.alt ?? ''} />
}

function resolveTarget(target: Step['target']): Element | null {
  if (typeof document === 'undefined' || target == null) return null
  if (target instanceof Element) return target
  if (typeof target === 'string') return document.querySelector(target)
  return null
}

function toRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

function toPosition(computed: { x: number; y: number; placement: PopoverPlacement }): Position {
  return { x: computed.x, y: computed.y, placement: computed.placement }
}

/**
 * Render `content.html` as **plain text**.
 *
 * Core's sanitiser is internal — it is not part of `@guideflow/core`'s public
 * API — so there is no safe way to mount raw HTML from here, and an
 * unsanitised `dangerouslySetInnerHTML` path is not an option. The words are
 * kept and the markup dropped. For rich content use the `children` render prop,
 * or let core's renderer draw the popover.
 *
 * `<template>` is what makes this safe: its `content` is an inert document
 * fragment, so assigning `innerHTML` never runs a script or fetches a resource
 * — unlike `DOMParser.parseFromString`, which executes scripts under happy-dom.
 * The result is rendered as a React text node either way.
 */
function htmlToText(html: string): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content.textContent ?? ''
}
