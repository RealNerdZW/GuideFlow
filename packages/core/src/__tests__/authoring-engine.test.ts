// ---------------------------------------------------------------------------
// The validator's severities, pinned to what the engine ACTUALLY does.
//
// A rule table is a set of claims about runtime behaviour, and this repo's
// eight-phase history is a list of claims that were true in a comment and false
// in the code. So every severity that matters is asserted twice here: once as
// engine behaviour, once as the validator's verdict about it.
//
// The most important one is `no-final-state`. CLAUDE.md said, for eight phases,
// that a flow with no `final: true` state "never completes". It does complete —
// measured below — which is why that rule is a warning and not an error.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateFlow } from '../authoring.js'
import { createGuideFlow } from '../index.js'
import type { FlowDefinition, GuideFlowInstance } from '../index.js'

let gf: GuideFlowInstance | null = null

afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function start(): GuideFlowInstance {
  gf = createGuideFlow({ injectStyles: false })
  return gf
}

const step = (id: string, title: string) => ({ id, content: { title } })

describe('no-final-state — WARNING', () => {
  it('the engine completes such a flow normally', async () => {
    const engine = start()
    const completed = vi.fn()
    engine.on('tour:complete', completed)

    await engine.start({
      id: 'no-final',
      initial: 'a',
      states: { a: { steps: [step('s1', 'One')] } },
    })
    await engine.next()

    // If this ever fails, the validator rule below must become an error and
    // CLAUDE.md's claim becomes true again.
    expect(completed).toHaveBeenCalledTimes(1)
    expect(engine.isActive).toBe(false)
  })

  it('so the validator warns rather than failing', () => {
    const r = validateFlow({
      id: 'no-final',
      initial: 'a',
      states: { a: { steps: [{ id: 's1', content: { title: 'One' }, target: '#a' }] } },
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.map((i) => i.code)).toContain('no-final-state')
  })
})

describe('unknown-transition-target — ERROR', () => {
  it('the engine truncates the tour AND records it as completed', async () => {
    const engine = start()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const completed = vi.fn()
    engine.on('tour:complete', completed)

    await engine.start({
      id: 'dangling',
      initial: 'a',
      states: {
        a: { steps: [step('s1', 'One')], on: { NEXT: 'ghost' } },
        b: { steps: [step('s2', 'Two')], final: true },
      },
    })
    await engine.next()

    // The whole reason this is an error and not a warning: step two never
    // shows, and the flow is marked complete, so it never shows again either.
    expect(completed).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalled()
  })

  it('so the validator refuses the flow', () => {
    const r = validateFlow({
      id: 'dangling',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'One' }, target: '#a' }], on: { NEXT: 'ghost' } },
        b: { steps: [{ id: 's2', content: { title: 'Two' }, target: '#b' }], final: true },
      },
    })
    expect(r.valid).toBe(false)
    expect(r.errors.map((i) => i.code)).toContain('unknown-transition-target')
  })
})

describe('forward-event-not-next — WARNING', () => {
  it('the engine under-counts the steps, which puts Done on step one', async () => {
    const engine = start()
    await engine.start({
      id: 'not-next',
      initial: 'a',
      states: {
        a: { steps: [step('s1', 'One')], on: { CONTINUE: 'b' } },
        b: { steps: [step('s2', 'Two')], final: true },
      },
    })

    // Two steps exist; the NEXT walk only sees one, and the renderer derives
    // the Done button from index vs total.
    expect(engine.totalSteps).toBe(1)
  })

  it('so the validator warns and names the consequence', () => {
    const r = validateFlow({
      id: 'not-next',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'One' }, target: '#a' }], on: { CONTINUE: 'b' } },
        b: { steps: [{ id: 's2', content: { title: 'Two' }, target: '#b' }], final: true },
      },
    })
    const issue = r.warnings.find((i) => i.code === 'forward-event-not-next')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('Done')
  })
})

describe('next-cycle — WARNING', () => {
  it('the engine survives it: the counter walk is cycle-guarded', async () => {
    const engine = start()
    await engine.start({
      id: 'cyclic',
      initial: 'a',
      states: {
        a: { steps: [step('s1', 'One')], on: { NEXT: 'b' } },
        b: { steps: [step('s2', 'Two')], on: { NEXT: 'a' } },
      },
    })
    // Does not hang, and reports the truncated walk.
    expect(engine.totalSteps).toBe(2)
  })

  it('so the validator warns rather than failing', () => {
    const r = validateFlow({
      id: 'cyclic',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'One' }, target: '#a' }], on: { NEXT: 'b' } },
        b: { steps: [{ id: 's2', content: { title: 'Two' }, target: '#b' }], on: { NEXT: 'a' } },
      },
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.map((i) => i.code)).toContain('next-cycle')
  })
})

describe('initial-not-found — ERROR', () => {
  it('the engine rejects the start', async () => {
    const engine = start()
    await expect(
      engine.start({ id: 'bad', initial: 'nope', states: { a: { steps: [step('s', 'x')] } } }),
    ).rejects.toThrow()
  })

  it('so the validator refuses the flow', () => {
    expect(
      validateFlow({ id: 'bad', initial: 'nope', states: { a: { steps: [] } } }).valid,
    ).toBe(false)
  })
})

describe('the flat shape the old exporter wrote — ERROR', () => {
  it('the engine cannot start it at all', async () => {
    const engine = start()
    const flat = { id: 'flat', name: 'Flat', steps: [{ id: 's1', title: 'One' }] }
    await expect(engine.start(flat as unknown as FlowDefinition)).rejects.toThrow()
  })

  it('so the validator names it precisely and points at the converter', () => {
    const r = validateFlow({ id: 'flat', name: 'Flat', steps: [{ id: 's1', title: 'One' }] })
    expect(r.errors[0]?.code).toBe('flat-steps-shape')
    expect(r.errors[0]?.hint).toContain('draftToFlow')
  })
})

describe('a validated flow actually runs', () => {
  it('end to end, through the real engine', async () => {
    const flow: FlowDefinition = {
      id: 'welcome',
      initial: 'a',
      states: {
        a: { steps: [step('s1', 'One')], on: { NEXT: 'b' } },
        b: { steps: [step('s2', 'Two')], final: true },
      },
    }
    expect(validateFlow(flow).valid).toBe(true)

    const engine = start()
    const completed = vi.fn()
    engine.on('tour:complete', completed)
    await engine.start(flow)
    expect(engine.totalSteps).toBe(2)
    await engine.next()
    await engine.next()
    expect(completed).toHaveBeenCalledTimes(1)
  })
})
