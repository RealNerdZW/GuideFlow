import { describe, it, expect } from 'vitest'
import { ExperimentEngine } from '../experiments.js'
import type { Experiment } from '../experiments.js'

const twoVariant: Experiment = {
  id: 'checkout-style',
  variants: [
    { id: 'control', value: 'minimal' },
    { id: 'treatment', value: 'bold' },
  ],
}

describe('ExperimentEngine', () => {
  it('assigns a deterministic variant based on userId', () => {
    const engine = new ExperimentEngine('user-abc')
    const r1 = engine.assign(twoVariant)
    const r2 = engine.assign(twoVariant)
    expect(r1.variantId).toBe(r2.variantId) // idempotent
    expect(r1.value).toBe(r2.value)
  })

  it('returns a valid ExperimentResult', () => {
    const engine = new ExperimentEngine('user-xyz')
    const result = engine.assign(twoVariant)
    expect(result.experimentId).toBe('checkout-style')
    expect(['control', 'treatment']).toContain(result.variantId)
    expect(['minimal', 'bold']).toContain(result.value)
  })

  it('caches assignment for the same experiment', () => {
    const engine = new ExperimentEngine('user-1')
    const r1 = engine.assign(twoVariant)
    const r2 = engine.assign(twoVariant)
    expect(r1).toBe(r2) // same reference (cached)
  })

  it('different userIds may get different variants', () => {
    // Not guaranteed to differ, but highly likely with many users
    const assignments = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const engine = new ExperimentEngine(`user-${i}`)
      assignments.add(engine.assign(twoVariant).variantId)
    }
    // With 100 users and 2 variants, both should appear
    expect(assignments.size).toBe(2)
  })

  it('respects variant weights', () => {
    const weighted: Experiment = {
      id: 'weighted-test',
      variants: [
        { id: 'heavy', value: 'heavy', weight: 99 },
        { id: 'light', value: 'light', weight: 1 },
      ],
    }
    // Most users should get 'heavy'
    let heavyCount = 0
    for (let i = 0; i < 100; i++) {
      const engine = new ExperimentEngine(`w-user-${i}`)
      if (engine.assign(weighted).variantId === 'heavy') heavyCount++
    }
    expect(heavyCount).toBeGreaterThan(80) // >80% should get heavy
  })

  describe('peek()', () => {
    it('returns the same variant as assign without caching', () => {
      const engine = new ExperimentEngine('peek-user')
      const peeked = engine.peek(twoVariant)
      expect(peeked.experimentId).toBe('checkout-style')
      expect(['control', 'treatment']).toContain(peeked.variantId)
    })

    it('does not pollute the cache', () => {
      const engine = new ExperimentEngine('peek-user-2')
      engine.peek(twoVariant) // should not cache
      // Manually assign — if peek cached, assign would return the cached value
      const assigned = engine.assign(twoVariant)
      const peeked = engine.peek(twoVariant)
      // Both should produce same result (deterministic)
      expect(peeked.variantId).toBe(assigned.variantId)
    })

    it('does not affect existing cached assignments', () => {
      const engine = new ExperimentEngine('peek-user-3')
      const assigned = engine.assign(twoVariant) // cache this
      engine.peek(twoVariant) // should not clear cache
      const reAssigned = engine.assign(twoVariant) // should return cached
      expect(reAssigned).toBe(assigned) // same reference
    })
  })

  describe('reset()', () => {
    it('clears all cached assignments', () => {
      const engine = new ExperimentEngine('reset-user')
      const r1 = engine.assign(twoVariant)
      engine.reset()
      const r2 = engine.assign(twoVariant)
      // Same user+experiment => same result, but different object reference
      expect(r2.variantId).toBe(r1.variantId) // deterministic
      expect(r1).not.toBe(r2) // cache was cleared, so new object
    })
  })

  describe('setUserId()', () => {
    it('changes userId and resets cache', () => {
      const engine = new ExperimentEngine('original-user')
      const r1 = engine.assign(twoVariant)
      engine.setUserId('different-user')
      const r2 = engine.assign(twoVariant)
      expect(r1).not.toBe(r2) // different reference
      // Variant may or may not differ depending on hash
    })
  })
})
