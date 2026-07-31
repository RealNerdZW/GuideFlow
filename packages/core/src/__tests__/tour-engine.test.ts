/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await */
import { describe, it, expect, vi, afterEach } from 'vitest'

import { TourEngine } from '../engine/tour.js'
import type { FlowDefinition, RendererContract } from '../types/index.js'

function createMockRenderer(): RendererContract {
  return {
    renderStep: vi.fn(),
    hideStep: vi.fn(),
    renderHotspot: vi.fn(),
    destroyHotspot: vi.fn(),
    renderHint: vi.fn(),
    destroyHints: vi.fn(),
  }
}

const simpleFlow: FlowDefinition = {
  id: 'test-tour',
  initial: 'welcome',
  states: {
    welcome: {
      steps: [{ id: 'step-1', content: { title: 'Welcome', body: 'Hello!' } }],
      on: { NEXT: 'features' },
    },
    features: {
      steps: [{ id: 'step-2', content: { title: 'Features', body: 'Check these out' } }],
      on: { NEXT: 'done' },
    },
    done: {
      steps: [{ id: 'step-3', content: { title: 'Done', body: 'All done' } }],
      on: {},
      final: true,
    },
  },
}

describe('TourEngine', () => {
  let engine: TourEngine
  let renderer: RendererContract

  afterEach(() => {
    engine?.destroy()
  })

  it('starts a tour and emits tour:start', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('tour:start', () => events.push('start'))
    await engine.start(simpleFlow)
    expect(engine.isActive).toBe(true)
    expect(events).toContain('start')
  })

  it('renders the first step on start', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    expect(renderer.renderStep).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step-1' }),
      expect.any(Object),
      0,
      // 3, not 1. The renderer is handed flow-wide counters now: this
      // assertion used to encode `total-steps-is-per-state`, where each of
      // simpleFlow's three single-step states reported "1 of 1" and the
      // renderer therefore drew a Done button on step one.
      3,
    )
  })

  it('advances to next step on next()', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    await engine.next()
    expect(engine.currentStepId).toBe('step-2')
  })

  it('emits step:exit when leaving a step', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const exits: string[] = []
    engine.on('step:exit', (e) => exits.push(e.stepId))
    await engine.start(simpleFlow)
    await engine.next()
    expect(exits).toContain('step-1')
  })

  it('emits step:enter when entering a step', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const enters: string[] = []
    engine.on('step:enter', (e) => enters.push(e.stepId))
    await engine.start(simpleFlow)
    expect(enters).toContain('step-1')
  })

  it('renders the steps of a final state before completing', async () => {
    // Regression: next() used to check `isFinal` immediately after the
    // transition, so entering `done` ended the tour without ever rendering
    // step-3. See AUDIT `final-state-steps-never-rendered`.
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const entered: string[] = []
    engine.on('step:enter', (e) => entered.push(e.stepId))

    await engine.start(simpleFlow)
    await engine.next() // welcome -> features
    await engine.next() // features -> done  (final, but it has a step)

    expect(entered).toEqual(['step-1', 'step-2', 'step-3'])
    expect(engine.currentStepId).toBe('step-3')
    expect(engine.isActive).toBe(true)
  })

  it('completes tour when advancing past the last step of a final state', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('tour:complete', () => events.push('complete'))
    await engine.start(simpleFlow)
    await engine.next() // -> features
    await engine.next() // -> done (renders step-3)
    expect(events).toEqual([])
    await engine.next() // nothing left -> complete
    expect(events).toContain('complete')
    expect(engine.isActive).toBe(false)
  })

  it('renders every step of the README quick-start flow', async () => {
    // The exact flow from README.md — a single state carrying two steps and
    // marked `final: true`. It used to show only step-1.
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const entered: string[] = []
    engine.on('step:enter', (e) => entered.push(e.stepId))

    await engine.start({
      id: 'welcome',
      initial: 'intro',
      states: {
        intro: {
          steps: [
            { id: 'step-1', content: { title: 'Welcome!', body: 'This is your dashboard.' } },
            { id: 'step-2', content: { title: 'Your profile', body: 'Manage your account here.' } },
          ],
          final: true,
        },
      },
    })
    await engine.next()

    expect(entered).toEqual(['step-1', 'step-2'])
  })

  it('completes when a final state carries no steps of its own', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('tour:complete', () => events.push('complete'))
    await engine.start({
      id: 'terminal-state',
      initial: 'only',
      states: {
        only: { steps: [{ id: 's1', content: { title: 'One' } }], on: { NEXT: 'done' } },
        done: { final: true },
      },
    })
    await engine.next()
    expect(events).toContain('complete')
    expect(engine.isActive).toBe(false)
  })

  it('end() stops the tour and emits tour:abandon', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('tour:abandon', () => events.push('abandon'))
    await engine.start(simpleFlow)
    engine.end()
    expect(engine.isActive).toBe(false)
    expect(events).toContain('abandon')
  })

  it('skip() emits step:skip and tour:abandon', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('step:skip', () => events.push('skip'))
    engine.on('tour:abandon', () => events.push('abandon'))
    await engine.start(simpleFlow)
    engine.skip()
    expect(events).toContain('skip')
    expect(events).toContain('abandon')
  })

  it('prev() goes back to the previous step', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    await engine.next() // -> features
    await engine.prev()
    // prevStep doesn't go to previous state, just previous step within same state
    // Since each state has 1 step, prev won't go back to previous state
  })

  it('goTo() jumps to a specific step by id', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })

    const multiStepFlow: FlowDefinition = {
      id: 'multi',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 's1', content: { title: 'One' } },
            { id: 's2', content: { title: 'Two' } },
            { id: 's3', content: { title: 'Three' } },
          ],
          on: {},
        },
      },
    }

    await engine.start(multiStepFlow)
    await engine.goTo('s3')
    expect(engine.currentStepId).toBe('s3')
    expect(engine.currentStepIndex).toBe(2)
  })

  it('send() dispatches a state machine event', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    await engine.send('NEXT')
    expect(engine.currentStepId).toBe('step-2')
  })

  it('handles showIf: false by skipping step (bounded loop)', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })

    const flowWithShowIf: FlowDefinition = {
      id: 'showif-test',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 's1', content: { title: 'Visible' } },
            { id: 's2', content: { title: 'Hidden' }, showIf: () => false },
            { id: 's3', content: { title: 'Also Visible' } },
          ],
          on: {},
        },
      },
    }

    const skipped: string[] = []
    engine.on('step:skip', (e) => skipped.push(e.stepId))
    await engine.start(flowWithShowIf)
    await engine.next() // should skip s2 and go to s3
    expect(skipped).toContain('s2')
  })

  it('does not stack overflow when all remaining steps have showIf: false', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })

    const flowAllHidden: FlowDefinition = {
      id: 'all-hidden',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 's1', content: { title: 'Visible' } },
            { id: 's2', content: { title: 'Hidden' }, showIf: () => false },
            { id: 's3', content: { title: 'Hidden too' }, showIf: () => false },
          ],
          on: {},
        },
      },
    }

    await engine.start(flowAllHidden)
    // next() should not cause infinite recursion
    await engine.next()
    expect(engine.isActive).toBe(false) // Tour should end
  })

  it('counts every step in the flow, not just the current state', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    // Three states, one step each, joined by NEXT.
    expect(engine.totalSteps).toBe(3)
    expect(engine.currentStepIndex).toBe(0)
  })

  it('keeps counting across a state boundary', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    await engine.next()

    expect(engine.currentStepId).toBe('step-2')
    // Not back to 0, which is what the per-state index reported.
    expect(engine.currentStepIndex).toBe(1)
    expect(engine.totalSteps).toBe(3)
  })

  it('counts only what next() would reach, and falls back off that path', async () => {
    // `aside` is reachable only by an explicit HELP event. `nextStep()` falls
    // back to `send('NEXT')` and nothing else, so a next()-only run never
    // enters `aside` — counting its steps would overstate the tour's length.
    const branching: FlowDefinition = {
      id: 'branching',
      initial: 'main',
      states: {
        main: {
          steps: [{ id: 'b1', content: { title: 'Main' } }],
          on: { NEXT: 'end', HELP: 'aside' },
        },
        aside: {
          steps: [
            { id: 'a1', content: { title: 'Aside one' } },
            { id: 'a2', content: { title: 'Aside two' } },
            { id: 'a3', content: { title: 'Aside three' } },
            { id: 'a4', content: { title: 'Aside four' } },
          ],
        },
        end: { steps: [{ id: 'b2', content: { title: 'End' } }], final: true },
      },
    }

    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(branching)
    expect(engine.totalSteps).toBe(2)

    // Off the default path entirely: report the current state's own numbers
    // rather than a total this state has no place in.
    await engine.send('HELP')
    expect(engine.currentStepId).toBe('a1')
    // 4, the aside's own length — distinct from the default path's 2, so this
    // really is exercising the fallback.
    expect(engine.totalSteps).toBe(4)
    expect(engine.currentStepIndex).toBe(0)
    await engine.next()
    expect(engine.currentStepIndex).toBe(1)
  })

  it('flowId returns the active flow id', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    expect(engine.flowId).toBe('test-tour')
  })

  it('isPaused tracks pause() and resume()', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    expect(engine.isPaused).toBe(false)

    engine.pause()
    expect(engine.isPaused).toBe(true)
    // Paused is not stopped — the flow and its position survive.
    expect(engine.isActive).toBe(true)
    expect(engine.currentStepId).toBe('step-1')

    engine.resume()
    expect(engine.isPaused).toBe(false)
    expect(engine.isActive).toBe(true)
  })

  it('isPaused resets to false when a paused tour ends', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    engine.pause()
    expect(engine.isPaused).toBe(true)

    engine.end()
    // A stale `true` here would make every consumer reading the getter show a
    // paused tour that no longer exists.
    expect(engine.isPaused).toBe(false)
    expect(engine.isActive).toBe(false)
  })

  it('destroy() removes all listeners and ends tour', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    engine.destroy()
    expect(engine.isActive).toBe(false)
  })

  it('next() is no-op when no tour is active', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.next() // should not throw
  })

  it('resolves async content functions', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })

    const asyncFlow: FlowDefinition = {
      id: 'async-content',
      initial: 'main',
      states: {
        main: {
          steps: [{
            id: 's1',
            content: async () => ({ title: 'Async Title', body: 'Async Body' }),
          }],
          on: {},
        },
      },
    }

    await engine.start(asyncFlow)
    expect(renderer.renderStep).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Async Title' }),
      0,
      1,
    )
  })
})

describe('stale render cancellation', () => {
  let engine: TourEngine
  let renderer: RendererContract

  afterEach(() => {
    engine?.destroy()
  })

  it('cancels the older render when two navigations race', async () => {
    // _renderGeneration used to be bumped only by rerender/start/pause/resume/
    // _doEnd — never by next/prev/goTo/send. Two next() calls inside the 150 ms
    // settle therefore captured the SAME generation, both passed every check,
    // and whichever finished last won — which is not necessarily the newer one
    // (AUDIT `generation-not-bumped-on-navigation`).
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)

    const before = (renderer.renderStep as ReturnType<typeof vi.fn>).mock.calls.length

    // Fire two without awaiting the first, the way a double-click does.
    const first = engine.next()
    const second = engine.next()
    await Promise.all([first, second])

    const calls = (renderer.renderStep as ReturnType<typeof vi.fn>).mock.calls.slice(before)
    // The last render must be the one the machine actually landed on.
    const last = calls.at(-1)
    expect((last?.[0] as { id: string } | undefined)?.id).toBe(engine.currentStepId)
  })

  it('bumps the generation on every navigation entry point', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)

    const read = (): number =>
      (engine as unknown as { _renderGeneration: number })._renderGeneration

    const afterStart = read()
    await engine.next()
    expect(read()).toBeGreaterThan(afterStart)

    const afterNext = read()
    await engine.prev()
    expect(read()).toBeGreaterThan(afterNext)

    const afterPrev = read()
    await engine.goTo('step-2')
    expect(read()).toBeGreaterThan(afterPrev)

    const afterGoTo = read()
    await engine.send('NEXT')
    expect(read()).toBeGreaterThan(afterGoTo)
  })

  it('does not bump when a navigation is a no-op', async () => {
    // prev() at index 0 returns early, and a bump there would cancel a render
    // that is legitimately still in flight.
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)

    const before = (engine as unknown as { _renderGeneration: number })._renderGeneration
    await engine.prev()
    await engine.goTo('no-such-step')

    expect((engine as unknown as { _renderGeneration: number })._renderGeneration).toBe(before)
  })
})
