import { describe, it, expect } from 'vitest'
import { validateSteps, validateIntentSignal, validateGuidedAnswer } from '../validation.js'

describe('validateSteps', () => {
  it('returns an empty array for non-array input', () => {
    expect(validateSteps(null)).toEqual([])
    expect(validateSteps('not an array')).toEqual([])
    expect(validateSteps(42)).toEqual([])
    expect(validateSteps(undefined)).toEqual([])
  })

  it('filters out items without string id', () => {
    const result = validateSteps([
      { id: 'valid', title: 'Hi' },
      { noId: true },
      { id: 123, title: 'Nope' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('valid')
  })

  it('maps title and body into content', () => {
    const result = validateSteps([
      { id: 's1', title: 'Welcome', body: 'Hello world' },
    ])
    expect(result[0]!.content).toEqual({ title: 'Welcome', body: 'Hello world' })
  })

  it('defaults body to empty string when missing', () => {
    const result = validateSteps([{ id: 's1' }])
    expect(result[0]!.content).toEqual({ body: '' })
  })

  it('applies target when provided as string', () => {
    const result = validateSteps([{ id: 's1', target: '#btn' }])
    expect(result[0]!.target).toBe('#btn')
  })

  it('applies valid placement', () => {
    const result = validateSteps([{ id: 's1', placement: 'top-start' }])
    expect(result[0]!.placement).toBe('top-start')
  })

  it('ignores invalid placement', () => {
    const result = validateSteps([{ id: 's1', placement: 'invalid-place' }])
    expect(result[0]!.placement).toBeUndefined()
  })

  it('handles an empty array', () => {
    expect(validateSteps([])).toEqual([])
  })
})

describe('validateIntentSignal', () => {
  it('returns fallback for non-object input', () => {
    expect(validateIntentSignal(null)).toEqual({ type: 'exploring', confidence: 0 })
    expect(validateIntentSignal('string')).toEqual({ type: 'exploring', confidence: 0 })
  })

  it('maps valid type and confidence', () => {
    const result = validateIntentSignal({ type: 'confused', confidence: 0.9 })
    expect(result.type).toBe('confused')
    expect(result.confidence).toBe(0.9)
  })

  it('falls back to exploring for unknown type', () => {
    const result = validateIntentSignal({ type: 'unknown-type', confidence: 0.5 })
    expect(result.type).toBe('exploring')
  })

  it('uses intent field as fallback for type', () => {
    const result = validateIntentSignal({ intent: 'stuck', confidence: 0.8 })
    expect(result.type).toBe('stuck')
  })

  it('clamps confidence to [0, 1]', () => {
    expect(validateIntentSignal({ type: 'engaged', confidence: 5 }).confidence).toBe(1)
    expect(validateIntentSignal({ type: 'engaged', confidence: -2 }).confidence).toBe(0)
  })

  it('includes element when present', () => {
    const result = validateIntentSignal({ type: 'exploring', confidence: 0.5, element: '#btn' })
    expect(result.element).toBe('#btn')
  })
})

describe('validateGuidedAnswer', () => {
  it('returns fallback for non-object input', () => {
    const result = validateGuidedAnswer(null)
    expect(result.text).toBe('Sorry, I could not answer that.')
    expect(result.highlights).toEqual([])
  })

  it('maps text and highlights', () => {
    const result = validateGuidedAnswer({
      text: 'Click the button',
      highlights: ['#btn', '.link'],
    })
    expect(result.text).toBe('Click the button')
    expect(result.highlights).toEqual(['#btn', '.link'])
  })

  it('uses answer field as fallback for text', () => {
    const result = validateGuidedAnswer({ answer: 'Try this' })
    expect(result.text).toBe('Try this')
  })

  it('maps highlightSelector to highlights array', () => {
    const result = validateGuidedAnswer({ text: 'Hi', highlightSelector: '#el' })
    expect(result.highlights).toContain('#el')
  })

  it('includes confidence when present', () => {
    const result = validateGuidedAnswer({ text: 'Ok', confidence: 0.95 })
    expect(result.confidence).toBe(0.95)
  })

  it('filters non-string highlights', () => {
    const result = validateGuidedAnswer({
      text: 'Test',
      highlights: ['#ok', 123, null, '.valid'],
    })
    expect(result.highlights).toEqual(['#ok', '.valid'])
  })
})
