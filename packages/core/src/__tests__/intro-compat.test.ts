/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, afterEach, vi } from 'vitest'

import { scanAttributeTour } from '../compat/intro-compat.js'
import { createGuideFlow } from '../index.js'

describe('scanAttributeTour', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns null when no data-gf-step elements exist', () => {
    const result = scanAttributeTour()
    expect(result).toBeNull()
  })

  it('scans DOM elements with data-gf-step and builds a FlowDefinition', () => {
    document.body.innerHTML = `
      <button data-gf-step="1" data-gf-title="First" data-gf-body="Step one">Click</button>
      <button data-gf-step="2" data-gf-title="Second" data-gf-body="Step two">Next</button>
    `
    const flow = scanAttributeTour()
    expect(flow).not.toBeNull()
    expect(flow?.id).toBe('attribute-tour')
    expect(flow?.initial).toBe('tour')
    // All steps live in a single state so the renderer sees flow-wide totals
    // and intra-state navigation drives Back/Next. It used to emit one state
    // per step — see AUDIT `attribute-tour-one-step-per-state`.
    expect(Object.keys(flow?.states ?? {})).toEqual(['tour'])
    expect(flow?.states['tour']?.steps).toHaveLength(2)
  })

  it('orders steps by numeric data-gf-step value', () => {
    document.body.innerHTML = `
      <div data-gf-step="3" data-gf-title="Third">C</div>
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Second">B</div>
    `
    const flow = scanAttributeTour()
    const steps = flow?.states['tour']?.steps ?? []
    expect(steps.map((s) => (s.content as { title?: string }).title)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('uses custom flowId', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Only">A</div>`
    const flow = scanAttributeTour(undefined, 'custom-tour')
    expect(flow?.id).toBe('custom-tour')
  })

  it('reads data-gf-placement attribute', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Placed" data-gf-placement="left">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['tour']?.steps?.[0]
    expect(step?.placement).toBe('left')
  })

  it('defaults placement to bottom', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Default">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['tour']?.steps?.[0]
    expect(step?.placement).toBe('bottom')
  })

  it('builds safe showIf from dot-notation data-gf-show-if', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Conditional" data-gf-show-if="isAdmin">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['tour']?.steps?.[0]
    expect(step?.showIf).toBeDefined()
    // showIf should evaluate truthy property
    expect(step?.showIf?.({ isAdmin: true } as any)).toBe(true)
    expect(step?.showIf?.({ isAdmin: false } as any)).toBe(false)
    expect(step?.showIf?.({} as any)).toBe(false)
  })

  it('supports nested dot-notation in data-gf-show-if', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Nested" data-gf-show-if="featureFlags.showTour">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['tour']?.steps?.[0]
    expect(step?.showIf?.({ featureFlags: { showTour: true } } as any)).toBe(true)
    expect(step?.showIf?.({ featureFlags: { showTour: false } } as any)).toBe(false)
    expect(step?.showIf?.({} as any)).toBe(false)
  })

  it('rejects unsafe data-gf-show-if expressions (code injection)', () => {
    // Expressions with parentheses, semicolons, etc. should be rejected
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Unsafe" data-gf-show-if="alert('xss')">A</div>`
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = scanAttributeTour()
    const step = flow?.states['tour']?.steps?.[0]
    expect(step?.showIf).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('marks the single state as final so the tour can complete', () => {
    document.body.innerHTML = `
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Last">B</div>
    `
    const flow = scanAttributeTour()
    expect(flow?.states['tour']?.final).toBe(true)
    expect(flow?.states['tour']?.on).toEqual({})
  })

  it('reports flow-wide totals so Back and the progress bar work', async () => {
    // Regression: one state per step made totalSteps === 1 for every step, so
    // the renderer treated each step as both first and last — no Back button,
    // no progress bar, and a "Done" button that ended the tour on step 1.
    document.body.innerHTML = `
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Second">B</div>
      <div data-gf-step="3" data-gf-title="Third">C</div>
    `
    const flow = scanAttributeTour()
    const gf = createGuideFlow()
    await gf.start(flow as never)

    expect(gf.totalSteps).toBe(3)
    expect(gf.currentStepIndex).toBe(0)

    await gf.next()
    expect(gf.currentStepIndex).toBe(1)
    expect(gf.isActive).toBe(true)

    await gf.prev()
    expect(gf.currentStepIndex).toBe(0)

    gf.destroy()
  })
})

