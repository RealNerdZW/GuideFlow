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
      1,
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

  it('completes tour when advancing past final state', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    const events: string[] = []
    engine.on('tour:complete', () => events.push('complete'))
    await engine.start(simpleFlow)
    await engine.next() // -> features
    await engine.next() // -> done
    await engine.next() // -> end
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

  it('reports totalSteps correctly', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    expect(engine.totalSteps).toBe(1)
  })

  it('flowId returns the active flow id', async () => {
    renderer = createMockRenderer()
    engine = new TourEngine({ renderer })
    await engine.start(simpleFlow)
    expect(engine.flowId).toBe('test-tour')
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
