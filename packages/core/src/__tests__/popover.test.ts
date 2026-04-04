import { describe, it, expect } from 'vitest'

import { computePosition } from '../engine/popover.js'

const target = { x: 400, y: 300, width: 100, height: 40 }
const popover = { x: 0, y: 0, width: 320, height: 200 }
const viewport = { x: 0, y: 0, width: 1280, height: 800 }

describe('computePosition', () => {
  it('places popover below target by default', () => {
    const pos = computePosition(target, popover, 'bottom', viewport)
    expect(pos.placement).toBe('bottom')
    expect(pos.y).toBeGreaterThan(target.y + target.height)
  })

  it('places popover above target for top placement', () => {
    const pos = computePosition(target, popover, 'top', viewport)
    expect(pos.placement).toBe('top')
    expect(pos.y).toBeLessThan(target.y)
  })

  it('computes right placement', () => {
    const pos = computePosition(target, popover, 'right', viewport)
    expect(pos.placement).toBe('right')
    expect(pos.x).toBeGreaterThan(target.x + target.width)
  })

  it('falls back when preferred placement overflows viewport', () => {
    // Target near top — 'top' would go off screen, should fall back to 'bottom'
    const nearTopTarget = { x: 400, y: 5, width: 100, height: 40 }
    const pos = computePosition(nearTopTarget, popover, 'top', viewport)
    expect(pos.placement).not.toBe('top')
  })

  it('falls back to clamped center as last resort', () => {
    // Huge popover in tiny viewport
    const tinyViewport = { x: 0, y: 0, width: 200, height: 200 }
    const bigPopover = { x: 0, y: 0, width: 400, height: 400 }
    const pos = computePosition(target, bigPopover, 'bottom', tinyViewport)
    expect(pos.x).toBeGreaterThanOrEqual(0)
    expect(pos.y).toBeGreaterThanOrEqual(0)
  })

  it('respects center placement', () => {
    const pos = computePosition(target, popover, 'center', viewport)
    expect(pos.placement).toBe('center')
  })
})
