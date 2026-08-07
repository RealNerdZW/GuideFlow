// ---------------------------------------------------------------------------
// advanceOn — the missing half of `clickThrough` (Phase 8.1).
//
// ADR-004 spent ~1.3 kB carving a clip-path hole so the user can click the
// spotlit control, and the engine attaches exactly one listener — `keydown` on
// `document` — and nothing on the target. So the user clicked, the app
// responded, and the step waited for Next.
//
// The tests that matter here are not "a click advances the tour". They are the
// four lifecycle holes the design panel measured in the engine:
//
//   1. `step:enter` fires TWICE with no `step:exit` between (resume, rerender)
//   2. `pause()` never emits `step:exit`, AND drops the overlay's pointer
//      capture — so the whole page becomes clickable exactly when the rule must
//      not fire
//   3. `step:exit.stepId` names the step being ENTERED on send/goTo/prev
//   4. two events in one frame would advance two steps
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import { advanceOn } from '../navigation/advance.js'
import type { FlowDefinition } from '../types/index.js'

const flow: FlowDefinition = {
  id: 'advance-flow',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 's1', target: '#one', clickThrough: true, content: { title: 'One' } },
        { id: 's2', target: '#two', clickThrough: true, content: { title: 'Two' } },
        { id: 's3', target: '#three', clickThrough: true, content: { title: 'Three' } },
      ],
      final: true,
    },
  },
}

const branching: FlowDefinition = {
  id: 'branch-flow',
  initial: 'pick',
  states: {
    pick: {
      steps: [{ id: 'p1', target: '#one', clickThrough: true, content: { title: 'Pick' } }],
      on: { CHOSE_PRO: 'pro' },
    },
    pro: {
      steps: [{ id: 'pro1', target: '#two', clickThrough: true, content: { title: 'Pro' } }],
      final: true,
    },
  },
}

let gf: GuideFlowInstance | null = null
let stop: (() => void) | null = null

const el = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
const click = (id: string): void => {
  el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML =
    '<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>'
})

afterEach(() => {
  stop?.()
  stop = null
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('advanceOn — advancing', () => {
  it('advances when the user clicks the highlighted element', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)
    expect(gf.currentStepId).toBe('s1')

    click('one')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('s2') })
  })

  it('does nothing for a step that has no rule', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s2: 'click' })
    await gf.start(flow)

    click('one')
    await new Promise((r) => setTimeout(r, 10))
    expect(gf.currentStepId).toBe('s1')
  })

  it('accepts a non-pointer event, and a `when` gate', async () => {
    document.body.innerHTML = '<input id="name" />'
    const inputFlow: FlowDefinition = {
      id: 'input-flow',
      initial: 'm',
      states: {
        m: {
          steps: [
            { id: 'i1', target: '#name', clickThrough: true, content: { title: 'Type' } },
            { id: 'i2', content: { title: 'Done' } },
          ],
          final: true,
        },
      },
    }
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, {
      i1: {
        event: 'input',
        when: (e) => (e.target as HTMLInputElement).value.length >= 3,
      },
    })
    await gf.start(inputFlow)

    const input = el('name') as HTMLInputElement
    input.value = 'ab'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    expect(gf.currentStepId).toBe('i1')

    input.value = 'abc'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('i2') })
  })

  it('a throwing `when` means "no match", not a crash', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: { event: 'click', when: () => { throw new Error('boom') } } })
    await gf.start(flow)

    expect(() => { click('one') }).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    expect(gf.currentStepId).toBe('s1')
  })

  it('dispatches an FSM event through send() when `action` is set', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { p1: { event: 'click', action: 'CHOSE_PRO' } })
    await gf.start(branching)
    expect(gf.currentStepId).toBe('p1')

    click('one')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('pro1') })
  })

  it('matches a control INSIDE the highlighted element via `selector`', async () => {
    document.body.innerHTML = '<div id="menu"><button id="row">Row</button></div>'
    const menuFlow: FlowDefinition = {
      id: 'menu-flow',
      initial: 'm',
      states: {
        m: {
          steps: [
            { id: 'm1', target: '#menu', clickThrough: true, content: { title: 'Menu' } },
            { id: 'm2', content: { title: 'Done' } },
          ],
          final: true,
        },
      },
    }
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { m1: { event: 'click', selector: '#row' } })
    await gf.start(menuFlow)

    click('row')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('m2') })
  })
})

describe('advanceOn — the lifecycle holes', () => {
  it('re-entering the same step does not leak a listener (one click, one advance)', async () => {
    // `resume()` and `rerender()` both re-emit `step:enter` for the SAME step
    // with no `step:exit` between them. Arming without releasing first strands
    // the previous listener, and then one click advances two steps.
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    await gf.rerender()
    await gf.rerender()

    click('one')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('s2') })
    // s3 would mean two advances from one click.
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s2')
  })

  it('a paused tour does not advance — pause() emits no step:exit', async () => {
    // And it is not merely academic: pause() calls spotlight.hide(), which sets
    // `pointer-events: none` on the overlay. The whole page becomes clickable
    // at exactly the moment the rule must not fire.
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    gf.pause()
    click('one')
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s1')
    expect(gf.isPaused).toBe(true)
  })

  it('re-arms after resume(), with no tour:resume subscription', async () => {
    // `resume()` clears `_paused` synchronously and then kicks off an ASYNC
    // re-render. The rule re-arms on the `step:enter` that render emits, so
    // there is a window after resume() where `isPaused` is already false and
    // the rule is not yet armed. That is correct — the spotlight is not back up
    // either — but it means a test that waits on `isPaused` clicks too early.
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    let reEntered = false
    const offEnter = gf.on('step:enter', ({ stepId }) => { if (stepId === 's1') reEntered = true })

    gf.pause()
    reEntered = false
    gf.resume()
    expect(gf.isPaused).toBe(false)

    // The window: paused is false, the re-render has not landed, nothing armed.
    expect(reEntered).toBe(false)
    click('one')
    expect(gf.currentStepId).toBe('s1')

    await vi.waitFor(() => { expect(reEntered).toBe(true) })
    offEnter()

    click('one')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('s2') })
  })

  it('detaches on step:exit — the old target goes inert', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)
    await gf.next()
    expect(gf.currentStepId).toBe('s2')

    click('one')
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s2')
  })

  it('two clicks in the same frame advance exactly one step', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    click('one')
    click('one')
    click('one')
    await vi.waitFor(() => { expect(gf?.currentStepId).toBe('s2') })
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s2')
  })

  it('a pending delayed advance is cancelled when the step exits', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: { event: 'click', delay: 50 } })
    await gf.start(flow)

    click('one')
    // The user presses Next before the delay elapses.
    await gf.next()
    expect(gf.currentStepId).toBe('s2')

    await new Promise((r) => setTimeout(r, 80))
    // s3 would mean the stale timer fired on a step it was never armed for.
    expect(gf.currentStepId).toBe('s2')
  })

  it('does not advance off a detached target', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    const node = el('one')
    node.remove()
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s1')
  })

  it('detaches when send() lands in a step-less final state — which emits NO step:exit', async () => {
    // The leak this file exists to catch. `send()` moves the machine BEFORE
    // calling `_emitStepExit()`, and `_emitStepExit` reads the machine's
    // *current* step — which for `done: { final: true }` with no steps is null.
    // So the `if (step)` guard skips the emit while `_stepExitEmitted = true` is
    // still set, `_doEnd(true)` then early-returns on that flag, and only
    // `tour:complete` fires.
    //
    // "subscribe to step:exit, it covers every ending" is therefore FALSE, and
    // `done: { final: true }` is an entirely ordinary FSM shape — two other
    // test files in this package already use it.
    const stepless: FlowDefinition = {
      id: 'stepless-final',
      initial: 'work',
      states: {
        work: {
          steps: [{ id: 'w1', target: '#one', clickThrough: true, content: { title: 'Save' } }],
          on: { SAVED: 'done' },
        },
        done: { final: true },
      },
    }
    gf = createGuideFlow({ injectStyles: false })

    const exits: string[] = []
    gf.on('step:exit', ({ stepId }) => exits.push(stepId))

    // Count the listener rather than the behaviour. A leaked listener still
    // bails on `!host.isActive`, so "clicking again does nothing" passes either
    // way — the leak is that the closure and the document listener survive.
    const removed: string[] = []
    const realRemove = document.removeEventListener.bind(document)
    vi.spyOn(document, 'removeEventListener').mockImplementation((t, l, o) => {
      removed.push(String(t))
      realRemove(t, l as EventListener, o as boolean)
    })

    stop = advanceOn(gf, { w1: 'click' })
    await gf.start(stepless)
    expect(gf.currentStepId).toBe('w1')

    // The APP completes the tour itself, from its own save handler. The rule
    // never fires, so its one-shot `remove()` never runs — the only thing that
    // can release the listener is a terminal-event subscription.
    await gf.send('SAVED')
    expect(gf.isActive).toBe(false)

    // The engine really did complete without ever emitting step:exit.
    expect(exits).toEqual([])
    // ...and the helper let go anyway, via tour:complete.
    expect(removed).toContain('click')
  })

  it('survives every terminal path without throwing', async () => {
    for (const end of ['stop', 'skip', 'destroy'] as const) {
      const local = createGuideFlow({ injectStyles: false })
      const off = advanceOn(local, { s1: 'click' })
      await local.start(flow)

      if (end === 'stop') local.stop()
      else if (end === 'skip') local.skip()
      else local.destroy()

      expect(() => { click('one') }).not.toThrow()
      await new Promise((r) => setTimeout(r, 10))
      expect(local.isActive).toBe(false)
      off()
      if (end !== 'destroy') local.destroy()
    }
  })
})

describe('advanceOn — teardown', () => {
  it('the returned teardown stops it advancing', async () => {
    gf = createGuideFlow({ injectStyles: false })
    const off = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    off()
    click('one')
    await new Promise((r) => setTimeout(r, 20))
    expect(gf.currentStepId).toBe('s1')
  })

  it('is idempotent, and safe after destroy()', async () => {
    gf = createGuideFlow({ injectStyles: false })
    const off = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)

    off()
    expect(() => { off() }).not.toThrow()
    gf.destroy()
    expect(() => { off() }).not.toThrow()
  })

  it('leaks nothing when the host only calls gf.destroy()', async () => {
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { s1: 'click' })
    await gf.start(flow)
    gf.destroy()

    expect(() => { click('one') }).not.toThrow()
  })
})

describe('advanceOn — the clickThrough warning', () => {
  it('warns once when a pointer rule is armed on a step without clickThrough', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const noThrough: FlowDefinition = {
      id: 'no-through-flow',
      initial: 'm',
      states: {
        m: {
          steps: [
            { id: 'nt1', target: '#one', content: { title: 'One' } },
            { id: 'nt2', content: { title: 'Two' } },
          ],
          final: true,
        },
      },
    }
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { nt1: 'click' })
    await gf.start(noThrough)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('clickThrough')

    // A re-render must not produce a wall of warnings.
    await gf.rerender()
    await gf.rerender()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not warn for a non-pointer event', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const custom: FlowDefinition = {
      id: 'custom-evt-flow',
      initial: 'm',
      states: {
        m: {
          steps: [
            { id: 'ce1', target: '#one', content: { title: 'One' } },
            { id: 'ce2', content: { title: 'Two' } },
          ],
          final: true,
        },
      },
    }
    gf = createGuideFlow({ injectStyles: false })
    stop = advanceOn(gf, { ce1: 'app:invoice-created' })
    await gf.start(custom)

    // An app dispatching its own event needs no pointer access at all.
    expect(warn).not.toHaveBeenCalled()
  })
})
