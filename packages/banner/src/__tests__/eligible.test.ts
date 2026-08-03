// ---------------------------------------------------------------------------
// Selection is a pure function, and that is where the value is — most of this
// file tests it directly, with no DOM and no storage.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'

import { evaluateAll, evaluateBanner } from '../eligible.js'
import type { BannerRecord } from '../store.js'
import type { BannerDefinition } from '../types.js'

function banner(id: string, extra: Partial<BannerDefinition> = {}): BannerDefinition {
  return { id, title: id, ...extra }
}

function env(overrides: Partial<Parameters<typeof evaluateBanner>[1]> = {}) {
  return {
    context: {},
    url: 'https://app.example.com/dashboard',
    now: Date.parse('2026-08-02T12:00:00Z'),
    record: { v: 1, dismissed: {} } as BannerRecord,
    ...overrides,
  }
}

describe('evaluateBanner', () => {
  it('an untargeted banner is eligible', () => {
    const r = evaluateBanner(banner('b'), env())
    expect(r.eligible).toBe(true)
    expect(r.blockedBy).toEqual([])
    expect(r.priority).toBe(0)
  })

  it('blocks on url, and reports it in core’s vocabulary', () => {
    const r = evaluateBanner(banner('b', { targeting: { urlPattern: '/billing/**' } }), env())
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toEqual(['url'])
  })

  it('blocks on audience', () => {
    const r = evaluateBanner(
      banner('b', { targeting: { audience: { where: { plan: 'pro' } } } }),
      env({ context: { plan: 'free' } }),
    )
    expect(r.blockedBy).toEqual(['audience'])
  })

  it('blocks on schedule', () => {
    const r = evaluateBanner(
      banner('b', { targeting: { schedule: { startsAt: '2026-09-01T00:00:00Z' } } }),
      env(),
    )
    expect(r.blockedBy).toEqual(['schedule'])
  })

  it('a throwing audience predicate means not-eligible, not a crash', () => {
    // Inherited from core's matchAudience rather than reimplemented. One bad
    // predicate must not take the whole surface down.
    const r = evaluateBanner(
      banner('b', {
        targeting: {
          audience: () => {
            throw new Error('boom')
          },
        },
      }),
      env(),
    )
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toEqual(['audience'])
  })

  it('checks the free guards before the stored one', () => {
    // Guard ORDER, not just the outcome: `blockedBy[0]` is what a person reads,
    // and it must agree with what `evaluateFlow` would say about a tour in the
    // same situation.
    const r = evaluateBanner(
      banner('b', { targeting: { urlPattern: '/nope/**' } }),
      env({ record: { v: 1, dismissed: { b: { at: 1 } } } }),
    )
    expect(r.blockedBy).toEqual(['url'])
  })
})

describe('dismissal scoping', () => {
  it('a dismissal with no version suppresses forever', () => {
    const r = evaluateBanner(
      banner('b'),
      env({ record: { v: 1, dismissed: { b: { at: 1 } } } }),
    )
    expect(r.blockedBy).toEqual(['dismissed'])
  })

  it('a versioned dismissal suppresses only that revision', () => {
    const record: BannerRecord = { v: 1, dismissed: { b: { ver: 1, at: 1 } } }
    expect(evaluateBanner(banner('b', { version: 1 }), env({ record })).eligible).toBe(false)
    expect(evaluateBanner(banner('b', { version: 2 }), env({ record })).eligible).toBe(true)
  })

  it('an unversioned dismissal still suppresses a banner that later gained a version', () => {
    // The conservative direction, and the same one ADR-014 chose for
    // completion: there is no way to know which revision the old record meant.
    const record: BannerRecord = { v: 1, dismissed: { b: { at: 1 } } }
    expect(evaluateBanner(banner('b', { version: 7 }), env({ record })).eligible).toBe(false)
  })
})

describe('evaluateAll', () => {
  it('sorts by priority, descending', () => {
    const out = evaluateAll(
      [
        banner('low', { targeting: { priority: 1 } }),
        banner('high', { targeting: { priority: 10 } }),
      ],
      env(),
    )
    expect(out.map((r) => r.banner.id)).toEqual(['high', 'low'])
  })

  it('ties keep registration order', () => {
    // The same tie-break createTargeting().evaluate() uses, so `priority` means
    // one thing across the library rather than two.
    const out = evaluateAll([banner('first'), banner('second'), banner('third')], env())
    expect(out.map((r) => r.banner.id)).toEqual(['first', 'second', 'third'])
  })

  it('scores ineligible banners too — it never filters', () => {
    const out = evaluateAll([banner('a', { targeting: { urlPattern: '/x/**' } })], env())
    expect(out).toHaveLength(1)
    expect(out[0]?.eligible).toBe(false)
  })
})
