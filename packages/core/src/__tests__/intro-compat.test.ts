/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, afterEach, vi } from 'vitest'

import { scanAttributeTour } from '../compat/intro-compat.js'

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
    expect(flow?.initial).toBe('step-1')
    expect(Object.keys(flow?.states ?? {})).toHaveLength(2)
  })

  it('orders steps by numeric data-gf-step value', () => {
    document.body.innerHTML = `
      <div data-gf-step="3" data-gf-title="Third">C</div>
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Second">B</div>
    `
    const flow = scanAttributeTour()
    const stateKeys = Object.keys(flow?.states ?? {})
    expect(stateKeys).toEqual(['step-1', 'step-2', 'step-3'])
    // First state's step should have title "First"
    const firstStep = flow?.states['step-1']?.steps?.[0]
    expect(firstStep?.content).toHaveProperty('title', 'First')
  })

  it('uses custom flowId', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Only">A</div>`
    const flow = scanAttributeTour(undefined, 'custom-tour')
    expect(flow?.id).toBe('custom-tour')
  })

  it('reads data-gf-placement attribute', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Placed" data-gf-placement="left">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['step-1']?.steps?.[0]
    expect(step?.placement).toBe('left')
  })

  it('defaults placement to bottom', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Default">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['step-1']?.steps?.[0]
    expect(step?.placement).toBe('bottom')
  })

  it('builds safe showIf from dot-notation data-gf-show-if', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Conditional" data-gf-show-if="isAdmin">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['step-1']?.steps?.[0]
    expect(step?.showIf).toBeDefined()
    // showIf should evaluate truthy property
    expect(step?.showIf?.({ isAdmin: true } as any)).toBe(true)
    expect(step?.showIf?.({ isAdmin: false } as any)).toBe(false)
    expect(step?.showIf?.({} as any)).toBe(false)
  })

  it('supports nested dot-notation in data-gf-show-if', () => {
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Nested" data-gf-show-if="featureFlags.showTour">A</div>`
    const flow = scanAttributeTour()
    const step = flow?.states['step-1']?.steps?.[0]
    expect(step?.showIf?.({ featureFlags: { showTour: true } } as any)).toBe(true)
    expect(step?.showIf?.({ featureFlags: { showTour: false } } as any)).toBe(false)
    expect(step?.showIf?.({} as any)).toBe(false)
  })

  it('rejects unsafe data-gf-show-if expressions (code injection)', () => {
    // Expressions with parentheses, semicolons, etc. should be rejected
    document.body.innerHTML = `<div data-gf-step="1" data-gf-title="Unsafe" data-gf-show-if="alert('xss')">A</div>`
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const flow = scanAttributeTour()
    const step = flow?.states['step-1']?.steps?.[0]
    expect(step?.showIf).toBeUndefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('marks last state as final', () => {
    document.body.innerHTML = `
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Last">B</div>
    `
    const flow = scanAttributeTour()
    expect(flow?.states['step-2']?.final).toBe(true)
    expect(flow?.states['step-1']?.final).toBeUndefined()
  })

  it('sets NEXT transitions between non-final states', () => {
    document.body.innerHTML = `
      <div data-gf-step="1" data-gf-title="First">A</div>
      <div data-gf-step="2" data-gf-title="Second">B</div>
      <div data-gf-step="3" data-gf-title="Third">C</div>
    `
    const flow = scanAttributeTour()
    expect(flow?.states['step-1']?.on).toHaveProperty('NEXT', 'step-2')
    expect(flow?.states['step-2']?.on).toHaveProperty('NEXT', 'step-3')
    expect(flow?.states['step-3']?.on).toEqual({})
  })
})

