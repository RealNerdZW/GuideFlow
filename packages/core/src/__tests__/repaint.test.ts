// ---------------------------------------------------------------------------
// `repaint()` — re-resolve what the step SAYS without re-announcing which step
// it is.
//
// The defect it closes is an interaction between two things that shipped in the
// same phase. `rerender()` re-emits `step:enter`; `@guideflow/analytics` maps
// that to `guideflow.step.viewed`; and `computeFunnel` counts those into each
// step's `reached`. So the documented way to move a live step into another
// language — `i18n.use('es')` then `rerender()` — inflated the funnel, and
// three toggles on one step produced four views of it.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import type { FlowDefinition } from '../types/index.js'

const flow: FlowDefinition = {
  id: 'repaint-flow',
  initial: 'intro',
  states: {
    intro: {
      label: 'Getting started',
      steps: [
        { id: 'r1', content: { title: 'Welcome, {{firstName}}' } },
        { id: 'r2', content: { title: 'Second' } },
      ],
      final: true,
    },
  },
}

let gf: GuideFlowInstance | null = null
const title = (): string | undefined =>
  document.querySelector('.gf-popover-title')?.textContent ?? undefined

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
})

describe('repaint', () => {
  it('moves a live step into the new locale', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' }, injectStyles: false })
    gf.i18n.registerContent('es', { steps: { r1: { title: 'Bienvenido, {{firstName}}' } } })
    await gf.start(flow)
    expect(title()).toBe('Welcome, Ada')

    gf.i18n.use('es')
    await gf.repaint()

    // Translated AND interpolated — the catalogue is applied before the token,
    // which is the ordering the whole content pipeline exists for.
    expect(title()).toBe('Bienvenido, Ada')
  })

  it('emits NOTHING — which is the entire point', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' }, injectStyles: false })
    gf.i18n.registerContent('es', { steps: { r1: { title: 'Bienvenido, {{firstName}}' } } })
    await gf.start(flow)

    const events: string[] = []
    for (const name of ['step:enter', 'step:exit', 'tour:start', 'tour:complete'] as const) {
      gf.on(name, () => events.push(name))
    }

    gf.i18n.use('es')
    await gf.repaint()
    await gf.repaint()
    await gf.repaint()

    expect(events).toEqual([])
    expect(title()).toBe('Bienvenido, Ada')
  })

  it('rerender() DOES re-emit, which is why repaint exists', async () => {
    // Pinned in both directions so the distinction cannot quietly collapse.
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    await gf.start(flow)

    const enters: string[] = []
    gf.on('step:enter', ({ stepId }) => enters.push(stepId))

    await gf.repaint()
    expect(enters).toEqual([])

    await gf.rerender()
    expect(enters).toEqual(['r1'])
  })

  it('picks up a context change, so {{token}} values can refresh', async () => {
    // Not only i18n. `configure({ context })` while data loads is the other
    // half of what this method is for.
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    await gf.start(flow)
    expect(title()).toBe('Welcome, {{firstName}}')

    gf.configure({ context: { userId: 'u', firstName: 'Grace' } })
    await gf.repaint()

    expect(title()).toBe('Welcome, Grace')
  })

  it('repaints the chapter label too', async () => {
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    gf.i18n.registerContent('es', { states: { intro: 'Primeros pasos' } })
    await gf.start(flow)
    expect(document.querySelector('.gf-popover-chapter')?.textContent).toBe('Getting started')

    gf.i18n.use('es')
    await gf.repaint()

    expect(document.querySelector('.gf-popover-chapter')?.textContent).toBe('Primeros pasos')
  })

  it('updates currentContent, not just the DOM', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' }, injectStyles: false })
    gf.i18n.registerContent('es', { steps: { r1: { title: 'Bienvenido, {{firstName}}' } } })
    await gf.start(flow)

    gf.i18n.use('es')
    await gf.repaint()

    expect(gf.currentContent?.title).toBe('Bienvenido, Ada')
  })
})

describe('repaint — when it declines', () => {
  it('does nothing with no tour running', async () => {
    gf = createGuideFlow({ injectStyles: false })
    await expect(gf.repaint()).resolves.toBeUndefined()
  })

  it('does nothing while paused', async () => {
    gf = createGuideFlow({ context: { userId: 'u', firstName: 'Ada' }, injectStyles: false })
    gf.i18n.registerContent('es', { steps: { r1: { title: 'Bienvenido' } } })
    await gf.start(flow)
    gf.pause()

    gf.i18n.use('es')
    await gf.repaint()

    // The popover is hidden; painting into it would resurrect a step the host
    // deliberately took down. `resume()` re-renders and picks the locale up.
    expect(gf.isPaused).toBe(true)
  })

  it('defers to a navigation that started while it was resolving', async () => {
    // It deliberately does not bump `_renderGeneration` — that would cancel a
    // render legitimately in flight — so it checks instead.
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    gf.i18n.registerContent('es', { steps: { r1: { title: 'ESPAÑOL UNO' } } })
    await gf.start(flow)

    gf.i18n.use('es')
    const repainting = gf.repaint()
    await gf.next()          // navigation wins
    await repainting

    // The repaint must not have painted step one's copy over step two.
    expect(gf.currentStepId).toBe('r2')
    expect(title()).toBe('Second')
  })

  it('a throwing content function does not end the tour', async () => {
    // Callers are fire-and-forget, so this needs its own boundary — and unlike
    // `_renderCurrentStep` it must not treat a bad translation as fatal.
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    let blowUp = false
    await gf.start({
      id: 'throwy',
      initial: 'm',
      states: {
        m: {
          steps: [{
            id: 't1',
            content: () => {
              if (blowUp) throw new Error('bad translation')
              return { title: 'Fine' }
            },
          }],
          final: true,
        },
      },
    })
    expect(gf.isActive).toBe(true)

    blowUp = true
    await expect(gf.repaint()).resolves.toBeUndefined()

    expect(gf.isActive).toBe(true)
    expect(title()).toBe('Fine')
  })
})
