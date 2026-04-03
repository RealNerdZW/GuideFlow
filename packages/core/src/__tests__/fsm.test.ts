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

  it('throws when initial state does not exist', () => {
    const badFlow: FlowDefinition = {
      id: 'bad',
      initial: 'nonexistent',
      states: {
        a: { steps: [], on: {} },
      },
    }
    expect(() => createMachine(badFlow)).toThrow(/Initial state "nonexistent" does not exist/)
  })

  it('goToStepById navigates to correct step', () => {
    const multiStepFlow: FlowDefinition = {
      id: 'multi',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 's1', content: { title: 'Step 1' } },
            { id: 's2', content: { title: 'Step 2' } },
            { id: 's3', content: { title: 'Step 3' } },
          ],
          on: {},
        },
      },
    }
    const m = createMachine(multiStepFlow)
    expect(m.goToStepById('s3')).toBe(true)
    expect(m.stepIndex).toBe(2)
    expect(m.currentStep?.id).toBe('s3')
  })

  it('goToStepById returns false for unknown step', () => {
    const m = createMachine(simpleFlow)
    expect(m.goToStepById('nonexistent')).toBe(false)
  })

  it('matches() returns true for current state', () => {
    const m = createMachine(simpleFlow)
    expect(m.matches('a')).toBe(true)
    expect(m.matches('b')).toBe(false)
  })

  it('updateContext merges into existing context', () => {
    const flow: FlowDefinition<{ count: number; name: string }> = {
      id: 'ctx-test',
      initial: 'a',
      context: { count: 0, name: 'test' },
      states: { a: { on: {} } },
    }
    const m = new FlowMachine(flow)
    m.updateContext({ count: 5 })
    expect(m.context.count).toBe(5)
    expect(m.context.name).toBe('test')
  })

  it('restore ignores invalid state', () => {
    const m = createMachine(simpleFlow)
    m.restore({ state: 'nonexistent', stepIndex: 0 })
    expect(m.state).toBe('a') // Should remain unchanged
  })

  it('subscribe returns unsubscribe function', () => {
    const m = createMachine(simpleFlow)
    let count = 0
    const unsub = m.subscribe(() => { count++ })
    m.send('NEXT')
    expect(count).toBe(1)
    unsub()
    // After unsub, transitions should not trigger
  })
})
