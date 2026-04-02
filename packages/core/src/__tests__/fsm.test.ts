import { describe, it, expect } from 'vitest'
import { FlowMachine, createMachine } from '../fsm/machine.js'
import type { FlowDefinition } from '../types/index.js'

const simpleFlow: FlowDefinition = {
  id: 'test',
  initial: 'a',
  states: {
    a: {
      steps: [{ id: 'step-1', content: { title: 'Hello' } }],
      on: { NEXT: 'b' },
    },
    b: {
      steps: [{ id: 'step-2', content: { title: 'World' } }],
      on: {},
      final: true,
    },
  },
}

describe('FlowMachine', () => {
  it('initialises to the correct state', () => {
    const m = createMachine(simpleFlow)
    expect(m.state).toBe('a')
    expect(m.stepIndex).toBe(0)
  })

  it('transitions on send()', () => {
    const m = createMachine(simpleFlow)
    const moved = m.send('NEXT')
    expect(moved).toBe(true)
    expect(m.state).toBe('b')
  })

  it('returns false on unknown event', () => {
    const m = createMachine(simpleFlow)
    const moved = m.send('UNKNOWN')
    expect(moved).toBe(false)
  })

  it('detects final state', () => {
    const m = createMachine(simpleFlow)
    m.send('NEXT')
    expect(m.isFinal).toBe(true)
  })

  it('advances steps within state', () => {
    const multiStepFlow: FlowDefinition = {
      id: 'multi',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 's1', content: { title: 'Step 1' } },
            { id: 's2', content: { title: 'Step 2' } },
          ],
          on: {},
        },
      },
    }
    const m = createMachine(multiStepFlow)
    expect(m.stepIndex).toBe(0)
    m.nextStep()
    expect(m.stepIndex).toBe(1)
    m.prevStep()
    expect(m.stepIndex).toBe(0)
  })

  it('snapshot / restore round-trips', () => {
    const m = createMachine(simpleFlow)
    m.send('NEXT')
    const snap = m.snapshot()
    const m2 = createMachine(simpleFlow)
    m2.restore(snap)
    expect(m2.state).toBe('b')
  })

  it('evaluates transition guards', () => {
    const guardedFlow: FlowDefinition<{ allowed: boolean }> = {
      id: 'guarded',
      initial: 'a',
      context: { allowed: false },
      states: {
        a: {
          on: { GO: { target: 'b', guard: (ctx) => ctx.allowed } },
        },
        b: { final: true, on: {} },
      },
    }
    const m = new FlowMachine(guardedFlow)
    expect(m.send('GO')).toBe(false)
    m.updateContext({ allowed: true })
    expect(m.send('GO')).toBe(true)
    expect(m.state).toBe('b')
  })

  it('notifies subscribers on transition', () => {
    const m = createMachine(simpleFlow)
    const calls: string[] = []
    m.subscribe((ctx) => calls.push(ctx.currentState))
    m.send('NEXT')
    expect(calls).toContain('b')
  })
})
