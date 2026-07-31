// ---------------------------------------------------------------------------
// The headless renderer: the RendererContract that turns core's render calls
// into React state instead of DOM.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance, type Step, type StepContent } from '@guideflow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHeadlessRenderer } from '../renderer/headless-renderer.js'

const flow: FlowDefinition = {
  id: 'headless-flow',
  initial: 'a',
  states: {
    a: {
      steps: [{ id: 's1', content: { title: 'One', body: 'First' } }],
      on: { NEXT: 'b' },
    },
    b: {
      steps: [{ id: 's2', content: { title: 'Two', body: 'Second' } }],
      final: true,
    },
  },
}

const step: Step = { id: 'x', content: { title: 't', body: 'b' } }
const content: StepContent = { title: 't', body: 'b' }

const instances: GuideFlowInstance[] = []
function makeInstance(renderer: ReturnType<typeof createHeadlessRenderer>): GuideFlowInstance {
  const gf = createGuideFlow({ renderer })
  instances.push(gf)
  return gf
}

afterEach(() => {
  instances.splice(0).forEach((gf) => gf.destroy())
  document.body.innerHTML = ''
})

describe('createHeadlessRenderer — store surface', () => {
  it('starts empty and reports nothing on the server', () => {
    const renderer = createHeadlessRenderer()
    expect(renderer.getSnapshot()).toBeNull()
    expect(renderer.getServerSnapshot()).toBeNull()
  })

  it('publishes the step core asked it to render', () => {
    const renderer = createHeadlessRenderer()
    const listener = vi.fn()
    renderer.subscribe(listener)

    renderer.renderStep(step, content, 1, 3)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(renderer.getSnapshot()).toEqual({ step, content, index: 1, total: 3 })
  })

  it('returns a stable snapshot reference between renders', () => {
    const renderer = createHeadlessRenderer()
    renderer.renderStep(step, content, 0, 1)
    expect(renderer.getSnapshot()).toBe(renderer.getSnapshot())
  })

  it('clears on hideStep, and does not notify twice', () => {
    const renderer = createHeadlessRenderer()
    const listener = vi.fn()
    renderer.subscribe(listener)

    renderer.renderStep(step, content, 0, 1)
    renderer.hideStep()
    renderer.hideStep()

    expect(renderer.getSnapshot()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const renderer = createHeadlessRenderer()
    const listener = vi.fn()
    const off = renderer.subscribe(listener)
    off()

    renderer.renderStep(step, content, 0, 1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('warns instead of throwing when dispatch runs before core wires it up', () => {
    const renderer = createHeadlessRenderer()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    renderer.dispatch('next')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no action handler'))
    warn.mockRestore()
  })

  it('draws no DOM of its own', () => {
    const renderer = createHeadlessRenderer()
    renderer.renderStep(step, content, 0, 1)
    expect(document.body.innerHTML).toBe('')
  })

  it('implements the rest of the contract as inert no-ops', () => {
    const renderer = createHeadlessRenderer()
    const listener = vi.fn()
    renderer.subscribe(listener)

    // Hotspots and hints are drawn by their own core subsystems; the renderer
    // hooks exist only to satisfy RendererContract.
    renderer.renderHotspot({
      id: 'h1',
      target: document.createElement('div'),
      options: {},
      beaconEl: document.createElement('div'),
      tooltipEl: null,
    })
    renderer.destroyHotspot('h1')
    renderer.renderHint({ id: 'hint-1', target: '#x', hint: 'Try this' })
    renderer.destroyHints()

    expect(listener).not.toHaveBeenCalled()
    expect(document.body.innerHTML).toBe('')
  })
})

describe('createHeadlessRenderer — wired into createGuideFlow', () => {
  it('receives steps from a real engine and suppresses core popover DOM', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)

    await gf.start(flow)

    expect(renderer.getSnapshot()?.step.id).toBe('s1')
    expect(renderer.getSnapshot()?.total).toBe(1)
    // The whole point: core's DefaultRenderer never runs.
    expect(document.querySelector('.gf-popover')).toBeNull()
  })

  it('receives the instance i18n registry and the config', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)
    await gf.start(flow)

    expect(renderer.i18n).toBe(gf.i18n)
    expect(renderer.config).not.toBeNull()
  })

  it('dispatch("next") advances the machine through core', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)
    await gf.start(flow)

    renderer.dispatch('next')
    await Promise.resolve()
    await Promise.resolve()

    expect(gf.currentStepId).toBe('s2')
  })

  it('dispatch("end") stops the tour and clears the snapshot', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)
    await gf.start(flow)

    renderer.dispatch('end')

    expect(gf.isActive).toBe(false)
    expect(renderer.getSnapshot()).toBeNull()
  })

  it('dispatch of an unknown action is forwarded to the state machine', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)
    await gf.start(flow)

    renderer.dispatch('NEXT')
    await Promise.resolve()
    await Promise.resolve()

    expect(gf.currentStepId).toBe('s2')
  })

  it('clears the snapshot when the tour is paused, and republishes on resume', async () => {
    const renderer = createHeadlessRenderer()
    const gf = makeInstance(renderer)
    await gf.start(flow)

    gf.pause()
    expect(renderer.getSnapshot()).toBeNull()

    gf.resume()
    await Promise.resolve()
    await Promise.resolve()
    expect(renderer.getSnapshot()?.step.id).toBe('s1')
  })
})
