// ---------------------------------------------------------------------------
// @guideflow/vue — plugin + useTour composable
//
// These exercise the adapter against a real `createGuideFlow()` instance from
// @guideflow/core, not a mock: the point is to prove the Vue refs track the
// engine's actual lifecycle. happy-dom has no layout engine, so nothing here
// asserts geometry — only state, delegation and cleanup.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance } from '@guideflow/core'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, effectScope, h, inject } from 'vue'

import { useTour, type UseTourReturn } from '../composables/use-tour.js'
import { GUIDEFLOW_KEY, GuideFlowPlugin, useGuideFlow } from '../plugin.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * A valid two-step flow. Steps deliberately carry no `target` so the engine
 * skips `scrollTargetIntoView()` and its 150 ms settle — `await start()` then
 * resolves once the step has actually been rendered.
 */
function makeFlow(id = 'vue-test-flow'): FlowDefinition {
  return {
    id,
    initial: 'main',
    states: {
      main: {
        steps: [
          { id: 'one', content: { title: 'Step one', body: 'First' } },
          { id: 'two', content: { title: 'Step two', body: 'Second' } },
        ],
        final: true,
      },
    },
  }
}

interface Harness {
  api: UseTourReturn
  unmount: () => void
}

/** Mount a throwaway component that calls `useTour()` under an installed plugin. */
function mountTour(gf: GuideFlowInstance, flowId?: string): Harness {
  const captured: { api: UseTourReturn | null } = { api: null }

  const wrapper = mount(
    defineComponent({
      name: 'TourConsumer',
      setup() {
        captured.api = useTour(flowId)
        return () => h('div')
      },
    }),
    { global: { plugins: [[GuideFlowPlugin, { instance: gf }]] } },
  )

  if (!captured.api) throw new Error('useTour() did not run in setup()')
  return { api: captured.api, unmount: () => wrapper.unmount() }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

let gf: GuideFlowInstance

beforeEach(() => {
  gf = createGuideFlow()
})

afterEach(() => {
  gf.destroy()
  vi.restoreAllMocks()
})

// ── GuideFlowPlugin / useGuideFlow ──────────────────────────────────────────

describe('GuideFlowPlugin', () => {
  it('provides the instance under GUIDEFLOW_KEY', () => {
    const seen: { injected: GuideFlowInstance | undefined; viaComposable: GuideFlowInstance | null } = {
      injected: undefined,
      viaComposable: null,
    }

    mount(
      defineComponent({
        setup() {
          seen.injected = inject(GUIDEFLOW_KEY)
          seen.viaComposable = useGuideFlow()
          return () => h('div')
        },
      }),
      { global: { plugins: [[GuideFlowPlugin, { instance: gf }]] } },
    )

    expect(seen.injected).toBe(gf)
    expect(seen.viaComposable).toBe(gf)
  })

  it('exposes the instance as the $guideflow global property', () => {
    const wrapper = mount(
      defineComponent({ setup: () => () => h('div') }),
      { global: { plugins: [[GuideFlowPlugin, { instance: gf }]] } },
    )

    expect(wrapper.vm.$.appContext.config.globalProperties['$guideflow']).toBe(gf)
  })

  it('creates its own instance when none is supplied', () => {
    const seen: { instance: GuideFlowInstance | null } = { instance: null }

    mount(
      defineComponent({
        setup() {
          seen.instance = useGuideFlow()
          return () => h('div')
        },
      }),
      { global: { plugins: [GuideFlowPlugin] } },
    )

    expect(seen.instance).not.toBeNull()
    expect(seen.instance).not.toBe(gf)
    expect(typeof seen.instance?.start).toBe('function')
    seen.instance?.destroy()
  })
})

describe('useGuideFlow / useTour outside plugin scope', () => {
  const message = '[GuideFlow] useGuideFlow() called outside plugin scope. Install the GuideFlowPlugin.'

  it('useGuideFlow() throws when the plugin is not installed', () => {
    // Vue logs the failed injection and the setup error; silence both.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const Bad = defineComponent({
      setup() {
        useGuideFlow()
        return () => h('div')
      },
    })

    expect(() => mount(Bad)).toThrow(message)
  })

  it('useTour() fails loudly when the plugin is not installed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const Bad = defineComponent({
      setup() {
        useTour()
        return () => h('div')
      },
    })

    expect(() => mount(Bad)).toThrow(message)
  })
})

// ── Reactive state ──────────────────────────────────────────────────────────

describe('useTour reactive state', () => {
  it('starts idle', () => {
    const { api } = mountTour(gf)

    expect(api.isActive.value).toBe(false)
    expect(api.currentStepId.value).toBeNull()
    expect(api.currentStepIndex.value).toBe(0)
    expect(api.totalSteps.value).toBe(0)
  })

  it('tracks start -> next -> stop', async () => {
    const { api } = mountTour(gf)
    const flow = makeFlow()

    await api.start(flow)
    expect(api.isActive.value).toBe(true)
    expect(api.currentStepId.value).toBe('one')
    expect(api.currentStepIndex.value).toBe(0)
    expect(api.totalSteps.value).toBe(2)

    await api.next()
    expect(api.isActive.value).toBe(true)
    expect(api.currentStepId.value).toBe('two')
    expect(api.currentStepIndex.value).toBe(1)
    expect(api.totalSteps.value).toBe(2)

    api.stop()
    expect(api.isActive.value).toBe(false)
    expect(gf.isActive).toBe(false)
  })

  it('goes back with prev()', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    await api.next()
    expect(api.currentStepId.value).toBe('two')

    await api.prev()
    expect(api.currentStepId.value).toBe('one')
    expect(api.currentStepIndex.value).toBe(0)
  })

  it('jumps with goTo()', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    await api.goTo('two')

    expect(api.currentStepId.value).toBe('two')
    expect(api.currentStepIndex.value).toBe(1)
  })

  it('goes inactive once the final state runs out of steps', async () => {
    const { api } = mountTour(gf)
    const completed = vi.fn()
    gf.on('tour:complete', completed)

    await api.start(makeFlow())
    await api.next()
    // Past the last step of the only (final) state — the tour completes.
    await api.next()

    expect(completed).toHaveBeenCalledTimes(1)
    expect(api.isActive.value).toBe(false)
    expect(gf.isActive).toBe(false)
  })

  it('exposes read-only refs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    // `readonly()` refuses the write (and warns in dev) rather than mutating.
    ;(api.isActive as { value: boolean }).value = false

    expect(api.isActive.value).toBe(true)
  })
})

// ── Delegation ──────────────────────────────────────────────────────────────

describe('useTour action delegation', () => {
  it('delegates start/next/prev/goTo/send/stop to the instance', async () => {
    const startSpy = vi.spyOn(gf, 'start')
    const nextSpy = vi.spyOn(gf, 'next')
    const prevSpy = vi.spyOn(gf, 'prev')
    const goToSpy = vi.spyOn(gf, 'goTo')
    const sendSpy = vi.spyOn(gf, 'send')
    const stopSpy = vi.spyOn(gf, 'stop')

    const { api } = mountTour(gf)
    const flow = makeFlow()

    await api.start(flow)
    await api.next()
    await api.prev()
    await api.goTo('two')
    await api.send('NEXT')
    api.stop()

    expect(startSpy).toHaveBeenCalledWith(flow, undefined)
    expect(nextSpy).toHaveBeenCalledTimes(1)
    expect(prevSpy).toHaveBeenCalledTimes(1)
    expect(goToSpy).toHaveBeenCalledWith('two')
    expect(sendSpy).toHaveBeenCalledWith('NEXT')
    expect(stopSpy).toHaveBeenCalledTimes(1)
  })

  it('forwards the guidance context given to start()', async () => {
    const startSpy = vi.spyOn(gf, 'start')
    const { api } = mountTour(gf)
    const flow = makeFlow()

    await api.start(flow, { userId: 'u-1' })

    expect(startSpy).toHaveBeenCalledWith(flow, { userId: 'u-1' })
  })

  it('falls back to the flow id passed to useTour()', async () => {
    const flow = gf.createFlow(makeFlow('registered-flow'))
    const startSpy = vi.spyOn(gf, 'start')
    const { api } = mountTour(gf, 'registered-flow')

    await api.start()

    expect(startSpy).toHaveBeenCalledWith('registered-flow', undefined)
    expect(api.currentStepId.value).toBe(flow.states['main']?.steps?.[0]?.id)
  })

  it('is a no-op when neither a flow nor a default flow id is available', async () => {
    const startSpy = vi.spyOn(gf, 'start')
    const { api } = mountTour(gf)

    await api.start()

    expect(startSpy).not.toHaveBeenCalled()
    expect(api.isActive.value).toBe(false)
  })
})

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe('useTour cleanup', () => {
  it('unsubscribes from core events when the component unmounts', async () => {
    const { api, unmount } = mountTour(gf)

    await api.start(makeFlow())
    expect(api.currentStepId.value).toBe('one')

    unmount()

    // The engine keeps running; the composable must no longer be listening.
    await gf.next()

    expect(gf.currentStepId).toBe('two')
    expect(gf.currentStepIndex).toBe(1)
    expect(api.currentStepId.value).toBe('one')
    expect(api.currentStepIndex.value).toBe(0)
  })

  it('leaves other subscribers untouched after unmount', async () => {
    const first = mountTour(gf)
    const second = mountTour(gf)

    await gf.start(makeFlow())
    expect(first.api.currentStepId.value).toBe('one')
    expect(second.api.currentStepId.value).toBe('one')

    first.unmount()
    await gf.next()

    expect(first.api.currentStepId.value).toBe('one')
    expect(second.api.currentStepId.value).toBe('two')
  })

  // Regression: teardown used to be registered with `onUnmounted`, which only
  // fires for a component instance. Called from a bare `effectScope()` — the
  // normal shape for a Pinia store or a shared composable — the teardown never
  // registered and all five core listeners leaked for the lifetime of the page.
  // Fixed by switching to `onScopeDispose`, which also covers the component
  // case because setup() runs inside its own effect scope.
  it('releases core listeners when a standalone effect scope is disposed', async () => {
    const app = createApp({ render: () => h('div') })
    app.provide(GUIDEFLOW_KEY, gf)
    app.mount(document.createElement('div'))

    const scope = effectScope()
    const captured: { api: UseTourReturn | null } = { api: null }
    scope.run(() => {
      captured.api = app.runWithContext(() => useTour())
    })

    const api = captured.api
    if (!api) throw new Error('useTour() did not run inside the effect scope')

    await gf.start(makeFlow())
    expect(api.currentStepId.value).toBe('one')

    scope.stop()
    await gf.next()

    expect(gf.currentStepId).toBe('two')
    expect(api.currentStepId.value).toBe('one')
  })
})
