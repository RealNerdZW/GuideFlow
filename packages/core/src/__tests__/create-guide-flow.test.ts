/* eslint-disable @typescript-eslint/no-explicit-any */
// ---------------------------------------------------------------------------
// createGuideFlow — the package's public assembly.
//
// This file had no tests at all (AUDIT `no-tests-for-create-guide-flow`), which
// is why the persistence, i18n and configure() defects below all shipped.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import type { FlowDefinition, RendererContract } from '../types/index.js'

const twoStepFlow: FlowDefinition = {
  id: 'persist-flow',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 's1', content: { title: 'One' } },
        { id: 's2', content: { title: 'Two' } },
        { id: 's3', content: { title: 'Three' } },
      ],
      final: true,
    },
  },
}

const twoStateFlow: FlowDefinition = {
  id: 'two-state-flow',
  initial: 'a',
  states: {
    a: { steps: [{ id: 'a1', content: { title: 'A1' } }, { id: 'a2', content: { title: 'A2' } }], on: { NEXT: 'b' } },
    b: { steps: [{ id: 'b1', content: { title: 'B1' } }], final: true },
  },
}

let gf: GuideFlowInstance | null = null

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
})

describe('persistence', () => {
  it('resumes onto the saved step, not step 0', async () => {
    // AUDIT `resume-renders-step-zero`
    gf = createGuideFlow({ context: { userId: 'u1' } })
    await gf.start(twoStepFlow)
    await gf.next()
    await gf.next()
    expect(gf.currentStepId).toBe('s3')
    gf.destroy()

    const resumed = createGuideFlow({ context: { userId: 'u1' } })
    const entered: string[] = []
    resumed.on('step:enter', (e) => entered.push(e.stepId))
    await resumed.start(twoStepFlow)

    expect(resumed.currentStepId).toBe('s3')
    expect(entered.at(-1)).toBe('s3')
    resumed.destroy()
  })

  it('does not replay a completed tour', async () => {
    // AUDIT `completed-tours-replay-forever`
    gf = createGuideFlow({ context: { userId: 'u2' } })
    await gf.start(twoStepFlow)
    await gf.next()
    await gf.next()
    await gf.next() // completes
    expect(gf.isActive).toBe(false)
    await new Promise((r) => setTimeout(r, 0)) // let the async persistence handler settle
    gf.destroy()

    const second = createGuideFlow({ context: { userId: 'u2' } })
    await second.start(twoStepFlow)
    expect(second.isActive).toBe(false)
    second.destroy()
  })

  it('saves progress on start, so abandoning the first step is remembered', async () => {
    // AUDIT `progress-not-saved-on-start-or-abandon`
    gf = createGuideFlow({ context: { userId: 'u3' } })
    await gf.start(twoStepFlow)
    const snapshot = await gf.progress.loadSnapshot('u3', 'persist-flow')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.stepIndex).toBe(0)
  })

  it('persists the abandon position', async () => {
    gf = createGuideFlow({ context: { userId: 'u4' } })
    await gf.start(twoStepFlow)
    await gf.next()
    gf.stop()
    const snapshot = await gf.progress.loadSnapshot('u4', 'persist-flow')
    expect(snapshot?.stepIndex).toBe(1)
  })

  it('only writes dismissal when the flow opts in', async () => {
    // AUDIT `dismissal-never-written`
    gf = createGuideFlow({ context: { userId: 'u5' } })
    await gf.start(twoStepFlow)
    gf.skip()
    expect(await gf.progress.isDismissed('u5', 'persist-flow')).toBe(false)
    gf.destroy()

    const optedIn = createGuideFlow({ context: { userId: 'u6' } })
    await optedIn.start({ ...twoStepFlow, id: 'dismissable', persistDismissal: true })
    optedIn.skip()
    await new Promise((r) => setTimeout(r, 0))
    expect(await optedIn.progress.isDismissed('u6', 'dismissable')).toBe(true)

    // and a dismissed flow does not start again
    await optedIn.start({ ...twoStepFlow, id: 'dismissable', persistDismissal: true })
    expect(optedIn.isActive).toBe(false)
    optedIn.destroy()
  })

  it('treats ttl: 0 as "never expires", not "expire immediately"', async () => {
    // AUDIT `ttl-zero-expires-immediately`
    gf = createGuideFlow({ context: { userId: 'u7' }, persistence: { ttl: 0 } })
    await gf.start(twoStepFlow)
    await gf.next()
    const snapshot = await gf.progress.loadSnapshot('u7', 'persist-flow')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.stepIndex).toBe(1)
  })

  it('clamps a stepIndex that the flow no longer has', async () => {
    // AUDIT `machine-restore-unvalidated` — storage is untrusted.
    gf = createGuideFlow({ context: { userId: 'u8' } })
    await gf.progress.saveSnapshot('u8', {
      flowId: 'persist-flow',
      currentState: 'main',
      stepIndex: 99,
      completed: false,
      timestamp: Date.now(),
    })
    await gf.start(twoStepFlow)
    expect(gf.isActive).toBe(true)
    expect(gf.currentStepId).toBe('s3') // clamped to the last real step
  })
})

describe('i18n', () => {
  it('uses the instance registry for rendered strings', async () => {
    // AUDIT `per-instance-i18n-dead`
    gf = createGuideFlow()
    gf.i18n.register('fr', { next: 'Suivant', skip: 'Passer', done: 'Terminé' })
    gf.i18n.use('fr')
    await gf.start(twoStepFlow)

    const html = document.querySelector('.gf-popover')?.innerHTML ?? ''
    expect(html).toContain('Suivant')
    expect(html).toContain('Passer')
    expect(html).not.toContain('Skip tour')
  })

  it('interpolates every occurrence of a token', () => {
    gf = createGuideFlow()
    gf.i18n.register('dup', { stepOf: '{current}/{total} ({current} of {total})' })
    gf.i18n.use('dup')
    expect(gf.i18n.t('stepOf', { current: 2, total: 5 })).toBe('2/5 (2 of 5)')
  })
})

describe('navigation across states', () => {
  it('goTo() reaches a step in another state', async () => {
    // AUDIT `fsm-navigation-cannot-cross-states`
    gf = createGuideFlow()
    await gf.start(twoStateFlow)
    await gf.goTo('b1')
    expect(gf.currentStepId).toBe('b1')
  })

  it('prev() crosses back into the previous state', async () => {
    gf = createGuideFlow()
    await gf.start(twoStateFlow)
    await gf.next() // a2
    await gf.next() // -> state b, b1
    expect(gf.currentStepId).toBe('b1')
    await gf.prev()
    expect(gf.currentStepId).toBe('a2') // last step of the previous state
  })

  it('prev() at the very first step is a no-op, not a duplicate step:enter', async () => {
    gf = createGuideFlow()
    const entered: string[] = []
    gf.on('step:enter', (e) => entered.push(e.stepId))
    await gf.start(twoStateFlow)
    await gf.prev()
    expect(entered).toEqual(['a1'])
  })

  it('rejects a transition to a state that does not exist', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    gf = createGuideFlow()
    await gf.start({
      id: 'typo',
      initial: 'a',
      states: { a: { steps: [{ id: 'a1', content: { title: 'A' } }], on: { NEXT: 'featurs' } } },
    })
    await gf.send('NEXT')
    expect(gf.currentStepId).toBe('a1') // did not move into a void
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('renderer contract', () => {
  function createCustomRenderer(): RendererContract & {
    onInit: ReturnType<typeof vi.fn>
    setI18n: ReturnType<typeof vi.fn>
    setActionHandler: ReturnType<typeof vi.fn>
  } {
    return {
      renderStep: vi.fn(),
      hideStep: vi.fn(),
      renderHotspot: vi.fn(),
      destroyHotspot: vi.fn(),
      renderHint: vi.fn(),
      destroyHints: vi.fn(),
      onInit: vi.fn(),
      setI18n: vi.fn(),
      setActionHandler: vi.fn(),
    }
  }

  it('calls onInit, setI18n and setActionHandler on a custom renderer', () => {
    // AUDIT `custom-renderer-oninit-never-called` — these only ran for DefaultRenderer.
    const renderer = createCustomRenderer()
    gf = createGuideFlow({ renderer, nonce: 'abc123' })
    expect(renderer.onInit).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'abc123' }))
    expect(renderer.setI18n).toHaveBeenCalledWith(gf.i18n)
    expect(renderer.setActionHandler).toHaveBeenCalled()
  })

  it('re-runs onInit when configure() changes the config', () => {
    const renderer = createCustomRenderer()
    gf = createGuideFlow({ renderer })
    renderer.onInit.mockClear()
    gf.configure({ nonce: 'xyz' })
    expect(renderer.onInit).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'xyz' }))
  })
})

describe('configure()', () => {
  it('pushes context into the running flow so showIf sees it', async () => {
    // AUDIT `configure-mostly-ignored`
    gf = createGuideFlow({ context: { userId: 'u9', roles: [] } })
    const skipped: string[] = []
    gf.on('step:skip', (e) => skipped.push(e.stepId))

    gf.configure({ context: { userId: 'u9', roles: ['admin'] } })
    await gf.start({
      id: 'guarded',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 'admin-only', content: { title: 'Admin' }, showIf: (c) => (c.roles ?? []).includes('admin') },
            { id: 'everyone', content: { title: 'All' } },
          ],
          final: true,
        },
      },
    })

    expect(skipped).toEqual([])
    expect(gf.currentStepId).toBe('admin-only')
  })
})
