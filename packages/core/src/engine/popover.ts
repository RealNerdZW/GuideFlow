// ---------------------------------------------------------------------------
// Popover Positioning Engine
// 12 placements + viewport collision detection + auto-flip
// Zero dependencies
// ---------------------------------------------------------------------------

import type { PopoverPlacement, ComputedPosition } from '../types/index.js'
import { prefersReducedMotion } from '../utils/ssr.js'

const FALLBACK_SEQUENCES: Record<PopoverPlacement, PopoverPlacement[]> = {
  top: ['top', 'bottom', 'right', 'left', 'center'],
  'top-start': ['top-start', 'bottom-start', 'right', 'left', 'center'],
  'top-end': ['top-end', 'bottom-end', 'right', 'left', 'center'],
  bottom: ['bottom', 'top', 'right', 'left', 'center'],
  'bottom-start': ['bottom-start', 'top-start', 'right', 'left', 'center'],
  'bottom-end': ['bottom-end', 'top-end', 'right', 'left', 'center'],
  left: ['left', 'right', 'bottom', 'top', 'center'],
  'left-start': ['left-start', 'right-start', 'bottom', 'top', 'center'],
  'left-end': ['left-end', 'right-end', 'bottom', 'top', 'center'],
  right: ['right', 'left', 'bottom', 'top', 'center'],
  'right-start': ['right-start', 'left-start', 'bottom', 'top', 'center'],
  'right-end': ['right-end', 'left-end', 'bottom', 'top', 'center'],
  center: ['center'],
}

const OFFSET = 12 // px gap between target and popover

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Mirror the inline-axis alignment of a placement for right-to-left text.
 *
 * `-start` and `-end` are *logical*: "start" is the edge text begins at, which
 * is the right edge in RTL. `left` and `right` are physical and are deliberately
 * left alone — that is the convention floating-ui and the CSS logical-property
 * spec both use, and mirroring them would make `placement: 'left'` mean "right"
 * for half the world's users.
 *
 * The block-axis variants (`left-start`, `right-end`, ...) align on top/bottom,
 * which follows writing-mode rather than direction, so they do not mirror here
 * either. AUDIT `placement-math-not-direction-aware`.
 */
function mirrorPlacement(placement: PopoverPlacement): PopoverPlacement {
  switch (placement) {
    case 'top-start': return 'top-end'
    case 'top-end': return 'top-start'
    case 'bottom-start': return 'bottom-end'
    case 'bottom-end': return 'bottom-start'
    default: return placement
  }
}

function computeForPlacement(
  placement: PopoverPlacement,
  target: Rect,
  popover: Rect,
): { x: number; y: number; arrowX?: number; arrowY?: number } {
  const { x: tx, y: ty, width: tw, height: th } = target
  const { width: pw, height: ph } = popover

  switch (placement) {
    case 'top':
      return { x: tx + tw / 2 - pw / 2, y: ty - ph - OFFSET, arrowX: pw / 2 }
    case 'top-start':
      return { x: tx, y: ty - ph - OFFSET, arrowX: Math.min(24, pw * 0.25) }
    case 'top-end':
      return { x: tx + tw - pw, y: ty - ph - OFFSET, arrowX: pw - Math.min(24, pw * 0.25) }
    case 'bottom':
      return { x: tx + tw / 2 - pw / 2, y: ty + th + OFFSET, arrowX: pw / 2 }
    case 'bottom-start':
      return { x: tx, y: ty + th + OFFSET, arrowX: Math.min(24, pw * 0.25) }
    case 'bottom-end':
      return { x: tx + tw - pw, y: ty + th + OFFSET, arrowX: pw - Math.min(24, pw * 0.25) }
    case 'left':
      return { x: tx - pw - OFFSET, y: ty + th / 2 - ph / 2, arrowY: ph / 2 }
    case 'left-start':
      return { x: tx - pw - OFFSET, y: ty, arrowY: Math.min(24, ph * 0.25) }
    case 'left-end':
      return { x: tx - pw - OFFSET, y: ty + th - ph, arrowY: ph - Math.min(24, ph * 0.25) }
    case 'right':
      return { x: tx + tw + OFFSET, y: ty + th / 2 - ph / 2, arrowY: ph / 2 }
    case 'right-start':
      return { x: tx + tw + OFFSET, y: ty, arrowY: Math.min(24, ph * 0.25) }
    case 'right-end':
      return { x: tx + tw + OFFSET, y: ty + th - ph, arrowY: ph - Math.min(24, ph * 0.25) }
    case 'center': {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800
      return { x: vw / 2 - pw / 2, y: vh / 2 - ph / 2 }
    }
  }
}

function fitsInViewport(pos: { x: number; y: number }, popover: Rect, viewport: Rect): boolean {
  return (
    pos.x >= viewport.x &&
    pos.y >= viewport.y &&
    pos.x + popover.width <= viewport.x + viewport.width &&
    pos.y + popover.height <= viewport.y + viewport.height
  )
}

function clampToViewport(pos: { x: number; y: number }, popover: Rect, viewport: Rect): { x: number; y: number } {
  const padding = 8
  return {
    x: Math.max(viewport.x + padding, Math.min(pos.x, viewport.x + viewport.width - popover.width - padding)),
    y: Math.max(viewport.y + padding, Math.min(pos.y, viewport.y + viewport.height - popover.height - padding)),
  }
}

/**
 * Compute the best position for a popover relative to a target element.
 * Cascades through fallback placements until one fits in the viewport.
 */
export function computePosition(
  target: Rect,
  popover: Rect,
  preferredPlacement: PopoverPlacement = 'bottom',
  viewport?: Rect,
  direction: 'ltr' | 'rtl' = 'ltr',
): ComputedPosition {
  const vp: Rect = viewport ?? {
    x: 0,
    y: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }

  const requested = direction === 'rtl' ? mirrorPlacement(preferredPlacement) : preferredPlacement
  const sequence = FALLBACK_SEQUENCES[requested] ?? FALLBACK_SEQUENCES.bottom

  for (const placement of sequence) {
    const pos = computeForPlacement(placement, target, popover)
    if (fitsInViewport(pos, popover, vp)) {
      return { ...pos, placement }
    }
  }

  // Last resort: clamp center placement to viewport
  const centerPos = computeForPlacement('center', target, popover)
  const clamped = clampToViewport(centerPos, popover, vp)
  return { ...clamped, placement: 'center' }
}

/**
 * Scroll a target element into the centre of the viewport.
 *
 * Smooth by default, but instant under `prefers-reduced-motion` — a smooth
 * scroll on every step is exactly the vestibular trigger that setting exists to
 * suppress (AUDIT `ignores-prefers-reduced-motion`).
 */
export function scrollTargetIntoView(element: Element): void {
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  })
}

/**
 * Get the bounding rect of an element, accounting for scroll offset.
 * Returns absolute page coordinates.
 */
export function getAbsoluteRect(element: Element): DOMRect {
  const rect = element.getBoundingClientRect()
  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
  return new DOMRect(rect.left + scrollX, rect.top + scrollY, rect.width, rect.height)
}

/**
 * Get the current viewport rectangle in **client coordinates** — the same space
 * as `Element.getBoundingClientRect()` and `position: fixed`, so its origin is
 * always (0, 0) regardless of scroll position.
 *
 * This is the space `computePosition` expects. It previously returned page
 * coordinates (`window.scrollX/scrollY`), which meant every fit test failed once
 * the page was scrolled and the popover collapsed to a clamped centre — see
 * AUDIT `popover-viewport-coordinate-mismatch`.
 *
 * For page-coordinate maths use {@link getAbsoluteRect} instead.
 *
 * Returns a safe fallback in SSR environments.
 */
export function getViewportRect(): { x: number; y: number; width: number; height: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0, width: 1280, height: 800 }
  }
  return {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}
