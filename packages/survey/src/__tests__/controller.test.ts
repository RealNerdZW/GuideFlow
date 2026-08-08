import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createSurveys } from '../controller.js'
import { SUFFIX } from '../store.js'
import type { SurveyController, SurveyDefinition, SurveyEvent } from '../types.js'

function survey(id: string, extra: Partial<SurveyDefinition> = {}): SurveyDefinition {
  return { id, question: `Question ${id}`, ...extra }
}

const TOUR: Parameters<GuideFlowInstance['createFlow']>[0] = {
  id: 'a-tour',
  initial: 'main',
  states: { main: { steps: [{ id: 's1', content: { title: 'Step' } }], final: true } },
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5))
}

describe('createSurveys', () => {
  let gf: GuideFlowInstance
  let surveys: SurveyController | null = null

  beforeEach(() => {
    localStorage.clear()
    gf = createGuideFlow({ injectStyles: false, context: { userId: 'u1' } })
  })

  afterEach(() => {
    surveys?.destroy()
    surveys = null
    gf.destroy()
  })

  it('paints nothing until storage answers', () => {
    surveys = createSurveys(gf, [survey('a')])
    expect(surveys.getSnapshot().hydrated).toBe(false)
    expect(surveys.getSnapshot().current).toBeNull()
  })

  it('shows the highest-priority eligible survey, asking, with no score', async () => {
    surveys = createSurveys(gf, [survey('low'), survey('high', { targeting: { priority: 5 } })])
    await settle()

    const view = surveys.getSnapshot().current
    expect(view?.id).toBe('high')
    expect(view?.phase).toBe('asking')
    expect(view?.score).toBeNull()
    expect(view?.values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(surveys.getSnapshot().queued).toBe(1)
  })

  it('getSnapshot is referentially stable while nothing changed', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    expect(surveys.getSnapshot()).toBe(surveys.getSnapshot())
    expect(surveys.getSnapshot().current).toBe(surveys.getSnapshot().current)
  })

  it('getServerSnapshot is idle and frozen', () => {
    surveys = createSurveys(gf, [survey('a')])
    const ssr = surveys.getServerSnapshot()
    expect(ssr.hydrated).toBe(false)
    expect(Object.isFrozen(ssr)).toBe(true)
  })

  // ── The little lifecycle ─────────────────────────────────────────────────

  it('select() shows the follow-up, and does not submit', async () => {
    surveys = createSurveys(gf, [survey('a', { followUp: { label: 'Why?' } })])
    await settle()
    expect(surveys.getSnapshot().current?.followUp).toBeUndefined()

    surveys.select(9)
    const view = surveys.getSnapshot().current
    expect(view?.score).toBe(9)
    expect(view?.phase).toBe('asking')
    expect(view?.followUp?.label).toBe('Why?')
    // Nothing written yet: the user may still be typing a comment.
    expect(await gf.progress.getRecord('u1', SUFFIX)).toBeNull()
  })

  it('ignores a score that is not on the scale', async () => {
    // A host driving the controller directly must not be able to submit a value
    // the question never offered — that lands in analytics as a real answer.
    surveys = createSurveys(gf, [survey('a', { scale: { min: 1, max: 5 } })])
    await settle()

    surveys.select(9)
    expect(surveys.getSnapshot().current?.score).toBeNull()
    surveys.select(4)
    expect(surveys.getSnapshot().current?.score).toBe(4)
  })

  it('submit() emits the response, persists, and shows the thanks', async () => {
    const events: SurveyEvent[] = []
    surveys = createSurveys(
      gf,
      [survey('a', { followUp: { label: 'Why?' }, thanks: 'Much appreciated.' })],
      { onEvent: (e) => events.push(e) },
    )
    await settle()

    surveys.select(10)
    await surveys.submit('  it is fast  ')

    const response = events.find((e) => e.type === 'response')
    expect(response).toMatchObject({ surveyId: 'a', score: 10, comment: 'it is fast', normalized: 1 })
    expect(surveys.getSnapshot().current?.phase).toBe('thanks')
    expect(surveys.getSnapshot().current?.thanks).toBe('Much appreciated.')
    expect(await gf.progress.getRecord('u1', SUFFIX)).toMatchObject({ v: 1 })
  })

  it('normalizes the score against the scale, so 4/5 and 8/10 agree', async () => {
    const events: SurveyEvent[] = []
    surveys = createSurveys(gf, [survey('csat', { scale: { min: 1, max: 5 } })], {
      onEvent: (e) => events.push(e),
    })
    await settle()
    surveys.select(5)
    await surveys.submit()

    const response = events.find((e) => e.type === 'response')
    expect(response).toMatchObject({ score: 5, normalized: 1, comment: undefined })
  })

  it('an empty comment is undefined, not an empty string', async () => {
    const events: SurveyEvent[] = []
    surveys = createSurveys(gf, [survey('a')], { onEvent: (e) => events.push(e) })
    await settle()
    surveys.select(3)
    await surveys.submit('   ')

    expect(events.find((e) => e.type === 'response')).toMatchObject({ comment: undefined })
  })

  it('submit() without a score is a no-op', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    await surveys.submit('a comment with no score')
    expect(surveys.getSnapshot().current?.phase).toBe('asking')
  })

  it('does not ask again after an answer', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    surveys.select(7)
    await surveys.submit()
    await surveys.dismiss()
    surveys.destroy()

    surveys = createSurveys(gf, [survey('a')])
    await settle()
    expect(surveys.getSnapshot().current).toBeNull()
  })

  it('does not ask again after a dismissal WITHOUT an answer', async () => {
    // Closing the card is an answer of a kind. Re-asking tomorrow is the
    // behaviour people uninstall over.
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    await surveys.dismiss()
    surveys.destroy()

    surveys = createSurveys(gf, [survey('a')])
    await settle()
    expect(surveys.getSnapshot().current).toBeNull()
  })

  it('reports whether a dismissal followed an answer', async () => {
    const events: SurveyEvent[] = []
    surveys = createSurveys(gf, [survey('a')], { onEvent: (e) => events.push(e) })
    await settle()
    await surveys.dismiss()
    expect(events.find((e) => e.type === 'dismiss')).toMatchObject({ answered: false })
  })

  it('advances to the next survey, without carrying the score over', async () => {
    surveys = createSurveys(gf, [
      survey('first', { targeting: { priority: 5 } }),
      survey('second'),
    ])
    await settle()
    surveys.select(8)
    expect(surveys.getSnapshot().current?.score).toBe(8)

    await surveys.dismiss()
    const next = surveys.getSnapshot().current
    expect(next?.id).toBe('second')
    expect(next?.score).toBeNull()
    expect(next?.phase).toBe('asking')
  })

  it('asks again once the cooldown elapses', async () => {
    const day = 24 * 3600_000
    const def = survey('nps', { targeting: { cooldownMs: 30 * day } })
    const clock = vi.spyOn(Date, 'now')
    try {
      const t0 = Date.parse('2026-01-01T00:00:00Z')
      clock.mockReturnValue(t0)
      surveys = createSurveys(gf, [def])
      await settle()
      await surveys.dismiss()
      surveys.destroy()

      clock.mockReturnValue(t0 + 10 * day)
      surveys = createSurveys(gf, [def])
      await settle()
      expect(surveys.getSnapshot().current).toBeNull()
      surveys.destroy()

      clock.mockReturnValue(t0 + 31 * day)
      surveys = createSurveys(gf, [def])
      await settle()
      expect(surveys.getSnapshot().current?.id).toBe('nps')
    } finally {
      clock.mockRestore()
    }
  })

  it('evaluate() explains why nothing is showing', async () => {
    surveys = createSurveys(gf, [survey('s', { targeting: { audience: { where: { plan: 'pro' } } } })])
    await settle()
    const [result] = surveys.evaluate()
    expect(result?.eligible).toBe(false)
    expect(result?.blockedBy).toEqual(['audience'])
  })

  it('with no identity nothing is written, and suppression is session-only', async () => {
    const anon = createGuideFlow({ injectStyles: false })
    const local = createSurveys(anon, [survey('a')])
    await settle()
    expect(local.getSnapshot().persisted).toBe(false)

    await local.dismiss()
    expect(local.getSnapshot().current).toBeNull()
    expect(localStorage.length).toBe(0)

    local.destroy()
    anon.destroy()
  })

  it('reset() clears stored asks', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    await surveys.dismiss()
    expect(surveys.getSnapshot().current).toBeNull()

    await surveys.reset()
    expect(surveys.getSnapshot().current?.id).toBe('a')
  })

  it('a dismissal touches nothing outside its own suffix', async () => {
    await gf.progress.markCompleted('u1', 'some-flow')
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    await surveys.dismiss()

    expect(await gf.progress.getCompletedFlows('u1')).toEqual(['some-flow'])
  })

  // ── Tour interaction ─────────────────────────────────────────────────────

  it('goes inert while a tour runs, and comes back after', async () => {
    gf.createFlow(TOUR)
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    expect(surveys.getSnapshot().tourActive).toBe(false)

    await gf.start('a-tour')
    expect(surveys.getSnapshot().tourActive).toBe(true)

    gf.stop()
    await settle()
    expect(surveys.getSnapshot().tourActive).toBe(false)
  })

  it('a throwing onEvent is isolated — the answers seam must not break the card', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    surveys = createSurveys(gf, [survey('a')], {
      onEvent: () => {
        throw new Error('host collector is down')
      },
    })
    await settle()
    surveys.select(5)
    await surveys.submit()

    expect(surveys.getSnapshot().current?.phase).toBe('thanks')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('setSurveys replaces the set without recording an ask', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    surveys.setSurveys([survey('b')])

    expect(surveys.getSnapshot().current?.id).toBe('b')
    expect(await gf.progress.getRecord('u1', SUFFIX)).toBeNull()
  })

  it('anonymousId mints an identifier so asks survive a reload', async () => {
    const anon = createGuideFlow({ injectStyles: false })
    const local = createSurveys(anon, [survey('a')], { anonymousId: true })
    await settle()
    expect(local.getSnapshot().persisted).toBe(true)

    await local.dismiss()
    expect(localStorage.getItem('gf:survey-anon-id')).toMatch(/^anon-/)
    local.destroy()

    const again = createSurveys(anon, [survey('a')], { anonymousId: true })
    await settle()
    expect(again.getSnapshot().current).toBeNull()
    again.destroy()
    anon.destroy()
  })

  it('uses its own anon key, never the checklist’s, banner’s or targeting’s', async () => {
    const anon = createGuideFlow({ injectStyles: false })
    const local = createSurveys(anon, [survey('a')], { anonymousId: true })
    await settle()

    expect(localStorage.getItem('gf:anon-id')).toBeNull()
    expect(localStorage.getItem('gf:checklist-anon-id')).toBeNull()
    expect(localStorage.getItem('gf:banner-anon-id')).toBeNull()
    local.destroy()
    anon.destroy()
  })

  it('refresh() re-reads storage', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    expect(surveys.getSnapshot().current?.id).toBe('a')

    await gf.progress.setRecord('u1', 'survey', { v: 1, asked: { a: { at: Date.now() } } })
    await surveys.refresh()
    expect(surveys.getSnapshot().current).toBeNull()
  })

  it('select() and submit() are no-ops once the thanks is showing', async () => {
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    surveys.select(4)
    await surveys.submit()
    expect(surveys.getSnapshot().current?.phase).toBe('thanks')

    surveys.select(9)
    await surveys.submit()
    expect(surveys.getSnapshot().current?.score).toBe(4)
  })

  it('dismiss() with nothing showing is a no-op', async () => {
    surveys = createSurveys(gf, [])
    await settle()
    await expect(surveys.dismiss()).resolves.toBeUndefined()
  })

  it('destroy() releases the tour listeners', async () => {
    gf.createFlow(TOUR)
    surveys = createSurveys(gf, [survey('a')])
    await settle()
    surveys.destroy()

    await gf.start('a-tour')
    expect(surveys.getSnapshot().tourActive).toBe(false)
    surveys = null
  })
})
