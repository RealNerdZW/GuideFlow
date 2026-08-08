import { describe, it, expect } from 'vitest'

import { evaluateAll, evaluateSurvey, scaleValues } from '../eligible.js'
import type { SurveyRecord } from '../store.js'
import type { SurveyDefinition } from '../types.js'

function survey(id: string, extra: Partial<SurveyDefinition> = {}): SurveyDefinition {
  return { id, question: `Question ${id}`, ...extra }
}

const NOW = Date.parse('2026-08-03T12:00:00Z')

function env(overrides: Partial<Parameters<typeof evaluateSurvey>[1]> = {}) {
  return {
    context: {},
    url: 'https://app.example.com/dashboard',
    now: NOW,
    record: { v: 1, asked: {} } as SurveyRecord,
    ...overrides,
  }
}

describe('scaleValues', () => {
  it('defaults to NPS — the reason this feature exists', () => {
    expect(scaleValues(undefined)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('produces a CSAT scale', () => {
    expect(scaleValues({ min: 1, max: 5 })).toEqual([1, 2, 3, 4, 5])
  })

  it('produces a thumbs poll', () => {
    expect(scaleValues({ min: 1, max: 2 })).toEqual([1, 2])
  })

  it('normalises reversed bounds rather than throwing', () => {
    // An obvious typo with an obvious intent. Throwing would take down a host's
    // page over a survey.
    expect(scaleValues({ min: 10, max: 0 })).toEqual(scaleValues({ min: 0, max: 10 }))
  })

  it('clamps an absurd range — a hundred radios is a hundred tab stops', () => {
    expect(scaleValues({ min: 0, max: 999 })).toHaveLength(21)
  })

  it('handles a single-value scale without producing an empty group', () => {
    expect(scaleValues({ min: 3, max: 3 })).toEqual([3])
  })
})

describe('evaluateSurvey', () => {
  it('an untargeted survey is eligible', () => {
    const r = evaluateSurvey(survey('s'), env())
    expect(r.eligible).toBe(true)
    expect(r.blockedBy).toEqual([])
  })

  it('blocks on url, audience and schedule in core’s vocabulary', () => {
    expect(
      evaluateSurvey(survey('s', { targeting: { urlPattern: '/billing/**' } }), env()).blockedBy,
    ).toEqual(['url'])
    expect(
      evaluateSurvey(
        survey('s', { targeting: { audience: { where: { plan: 'pro' } } } }),
        env({ context: { plan: 'free' } }),
      ).blockedBy,
    ).toEqual(['audience'])
    expect(
      evaluateSurvey(
        survey('s', { targeting: { schedule: { startsAt: '2026-09-01T00:00:00Z' } } }),
        env(),
      ).blockedBy,
    ).toEqual(['schedule'])
  })

  it('a throwing audience predicate means not-eligible, not a crash', () => {
    const r = evaluateSurvey(
      survey('s', {
        targeting: {
          audience: () => {
            throw new Error('boom')
          },
        },
      }),
      env(),
    )
    expect(r.eligible).toBe(false)
  })

  it('checks the free guards before the stored one', () => {
    const r = evaluateSurvey(
      survey('s', { targeting: { urlPattern: '/nope/**' } }),
      env({ record: { v: 1, asked: { s: { at: NOW } } } }),
    )
    expect(r.blockedBy).toEqual(['url'])
  })
})

describe('asking once, and asking again', () => {
  it('an ask with no cooldown is final', () => {
    const r = evaluateSurvey(survey('s'), env({ record: { v: 1, asked: { s: { at: NOW } } } }))
    expect(r.blockedBy).toEqual(['answered'])
  })

  it('a cooldown suppresses until it elapses, then asks again', () => {
    const day = 24 * 3600_000
    const asked = { v: 1, asked: { s: { at: NOW - 30 * day } } } as SurveyRecord
    const def = survey('s', { targeting: { cooldownMs: 90 * day } })

    expect(evaluateSurvey(def, env({ record: asked })).eligible).toBe(false)
    expect(evaluateSurvey(def, env({ record: asked, now: NOW + 61 * day })).eligible).toBe(true)
  })

  it('measures the cooldown from the ASK, not the answer', () => {
    // Someone who closed it without answering has also been asked, and
    // re-asking them tomorrow is the behaviour people uninstall over.
    const day = 24 * 3600_000
    const dismissedUnanswered = { v: 1, asked: { s: { at: NOW } } } as SurveyRecord
    const def = survey('s', { targeting: { cooldownMs: 7 * day } })
    expect(evaluateSurvey(def, env({ record: dismissedUnanswered })).eligible).toBe(false)
  })

  it('a new version asks again immediately, overriding an unelapsed cooldown', () => {
    // A genuinely different question should not wait out the old one's timer.
    const day = 24 * 3600_000
    const record = { v: 1, asked: { s: { at: NOW, ver: 1 } } } as SurveyRecord
    expect(
      evaluateSurvey(survey('s', { version: 1, targeting: { cooldownMs: 90 * day } }), env({ record }))
        .eligible,
    ).toBe(false)
    expect(
      evaluateSurvey(survey('s', { version: 2, targeting: { cooldownMs: 90 * day } }), env({ record }))
        .eligible,
    ).toBe(true)
  })
})

describe('evaluateAll', () => {
  it('sorts by priority, ties keeping registration order', () => {
    const out = evaluateAll(
      [
        survey('a'),
        survey('high', { targeting: { priority: 10 } }),
        survey('b'),
      ],
      env(),
    )
    expect(out.map((r) => r.survey.id)).toEqual(['high', 'a', 'b'])
  })

  it('scores ineligible surveys too — it never filters', () => {
    const out = evaluateAll([survey('a', { targeting: { urlPattern: '/x/**' } })], env())
    expect(out).toHaveLength(1)
    expect(out[0]?.eligible).toBe(false)
  })
})
