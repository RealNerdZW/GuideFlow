// ---------------------------------------------------------------------------
// @guideflow/vue — plugin + useTour composable
//
// These exercise the adapter against a real `createGuideFlow()` instance from
// @guideflow/core, not a mock: the point is to prove the Vue refs track the
// engine's actual lifecycle. happy-dom has no layout engine, so nothing here
// asserts geometry — only state, delegation and cleanup.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance, type HintStep } from '@guideflow/core'
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
  document.body.innerHTML = ''
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

  // Regression: `$guideflow` used to be assigned through a
  // `Record<string, unknown>` cast, so `this.$guideflow` was `unknown` and the
  // documented Options API usage did not compile. This test is as much a
  // type-check assertion as a runtime one — `tsc --noEmit` covers src/__tests__,
  // so if the ComponentCustomProperties augmentation is dropped, type-check
  // fails here before the test ever runs.
  it('types this.$guideflow for Options API components', () => {
    const seen: { instance: GuideFlowInstance | null; flowId: string | null } = {
      instance: null,
      flowId: null,
    }

    mount(
      defineComponent({
        mounted() {
          // No cast, no `as GuideFlowInstance`: the module augmentation supplies
          // the type, and with it `currentStepId` and every other member.
          seen.instance = this.$guideflow
          seen.flowId = this.$guideflow.currentStepId
        },
        render: () => h('div'),
      }),
      { global: { plugins: [[GuideFlowPlugin, { instance: gf }]] } },
    )

    expect(seen.instance).toBe(gf)
    expect(seen.flowId).toBeNull()
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

  it('releases the pause/resume listeners too', async () => {
    const { api, unmount } = mountTour(gf)

    await api.start(makeFlow())
    unmount()

    gf.pause()

    expect(api.isPaused.value).toBe(false)
  })
})

// ── Step state resets when a tour ends ──────────────────────────────────────

describe('useTour idle reset', () => {
  // Regression: `tour:complete` / `tour:abandon` are emitted from inside core's
  // `_doEnd()` *before* it nulls the machine, so syncing off the instance
  // latched the last live step. A progress indicator stayed on "2 of 2" for the
  // rest of the page's life.
  it('returns to the idle values after stop()', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    await api.next()
    api.stop()

    expect(api.currentStepId.value).toBe(gf.currentStepId)
    expect(api.currentStepIndex.value).toBe(gf.currentStepIndex)
    expect(api.totalSteps.value).toBe(gf.totalSteps)
    expect(api.currentStep.value).toBe(gf.currentStep)
    expect(api.currentContent.value).toBe(gf.currentContent)

    expect(api.currentStepId.value).toBeNull()
    expect(api.currentStepIndex.value).toBe(0)
    expect(api.totalSteps.value).toBe(0)
  })

  it('returns to the idle values after the tour completes', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    await api.next()
    await api.next()

    expect(api.isActive.value).toBe(false)
    expect(api.currentStepId.value).toBeNull()
    expect(api.currentStepIndex.value).toBe(0)
    expect(api.totalSteps.value).toBe(0)
    expect(api.currentStep.value).toBeNull()
    expect(api.currentContent.value).toBeNull()
  })

  it('returns to the idle values after skip()', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    api.skip()

    expect(api.isActive.value).toBe(false)
    expect(api.currentStepId.value).toBeNull()
    expect(api.totalSteps.value).toBe(0)
  })
})

// ── currentStep / currentContent ────────────────────────────────────────────

describe('useTour currentStep and currentContent', () => {
  it('tracks the live step object, not a copy', async () => {
    const { api } = mountTour(gf)

    expect(api.currentStep.value).toBeNull()
    expect(api.currentContent.value).toBeNull()

    await api.start(makeFlow())

    // Identity, not deep equality: `readonly()` would hand back a proxy here.
    expect(api.currentStep.value).toBe(gf.currentStep)
    expect(api.currentStep.value?.id).toBe('one')
    expect(api.currentContent.value).toEqual({ title: 'Step one', body: 'First' })

    await api.next()

    expect(api.currentStep.value?.id).toBe('two')
    expect(api.currentContent.value?.title).toBe('Step two')
  })

  it('resolves async content before exposing it', async () => {
    const { api } = mountTour(gf)

    await api.start({
      id: 'async-content-flow',
      initial: 'main',
      states: {
        main: {
          steps: [{ id: 'lazy', content: () => Promise.resolve({ title: 'Resolved' }) }],
          final: true,
        },
      },
    })

    expect(api.currentContent.value).toEqual({ title: 'Resolved' })
  })
})

// ── pause / resume / skip ───────────────────────────────────────────────────

describe('useTour pause, resume and skip', () => {
  it('pauses and resumes without abandoning the flow', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    expect(api.isPaused.value).toBe(false)

    api.pause()
    expect(api.isPaused.value).toBe(true)
    // Paused is not stopped — the flow and its position survive.
    expect(api.isActive.value).toBe(true)
    expect(api.currentStepId.value).toBe('one')

    api.resume()
    expect(api.isPaused.value).toBe(false)
    expect(api.isActive.value).toBe(true)
  })

  it('tracks pause/resume driven straight off the instance', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    gf.pause()
    expect(api.isPaused.value).toBe(true)

    gf.resume()
    expect(api.isPaused.value).toBe(false)
  })

  it('subscribes to an already-paused tour and reports isPaused true immediately', async () => {
    // The component mounts *after* pause(), so there is no `tour:pause` event
    // left for it to observe. Seeding the ref from `gf.isPaused` is the only
    // way it can know — it used to hard-code `false` and render a paused tour
    // as running.
    await gf.start(makeFlow())
    gf.pause()

    const { api } = mountTour(gf)

    expect(api.isPaused.value).toBe(true)
    expect(api.isActive.value).toBe(true)
    expect(api.currentStepId.value).toBe('one')
  })

  it('clears isPaused when a paused tour is stopped and a new one starts', async () => {
    const { api } = mountTour(gf)

    await api.start(makeFlow())
    api.pause()
    expect(api.isPaused.value).toBe(true)

    api.stop()
    expect(api.isPaused.value).toBe(false)

    await api.start(makeFlow('second-flow'))
    expect(api.isPaused.value).toBe(false)
  })

  it('skip() dismisses the tour the way a user would', async () => {
    const { api } = mountTour(gf)
    const skipped = vi.fn()
    const dismissed = vi.fn()
    const abandoned = vi.fn()
    gf.on('step:skip', skipped)
    gf.on('tour:dismiss', dismissed)
    gf.on('tour:abandon', abandoned)

    await api.start(makeFlow())
    api.skip()

    expect(skipped).toHaveBeenCalledWith({ stepId: 'one' })
    expect(dismissed).toHaveBeenCalledTimes(1)
    expect(abandoned).toHaveBeenCalledTimes(1)
    expect(api.isActive.value).toBe(false)
  })
})

// ── Flows, configuration and subsystems ─────────────────────────────────────

describe('useTour flow registry and configuration', () => {
  it('registers and lists flows', () => {
    const { api } = mountTour(gf)

    expect(api.listFlows()).toEqual([])

    const flow = api.createFlow(makeFlow('registered'))

    expect(flow.id).toBe('registered')
    expect(api.listFlows()).toEqual([flow])
    expect(gf.listFlows()).toEqual([flow])
  })

  it('starts a flow registered through the composable by id', async () => {
    const { api } = mountTour(gf)
    api.createFlow(makeFlow('by-id'))

    await api.start('by-id')

    expect(api.isActive.value).toBe(true)
    expect(api.currentStepId.value).toBe('one')
  })

  it('forwards configure() to the instance', () => {
    const { api } = mountTour(gf)
    const configureSpy = vi.spyOn(gf, 'configure')

    api.configure({ debug: true })

    expect(configureSpy).toHaveBeenCalledWith({ debug: true })
  })
})

describe('useTour standalone UI surface', () => {
  it('creates and removes hotspots', () => {
    const target = document.createElement('button')
    document.body.appendChild(target)

    const { api } = mountTour(gf)
    const id = api.hotspot(target, { title: 'New' })

    expect(id).not.toBe('')
    expect(document.querySelector(`[data-gf-hotspot-id="${id}"]`)).not.toBeNull()

    api.removeHotspot(id)

    expect(document.querySelector(`[data-gf-hotspot-id="${id}"]`)).toBeNull()
  })

  it('registers hints and toggles their visibility', () => {
    const target = document.createElement('div')
    target.id = 'hint-target'
    document.body.appendChild(target)

    const { api } = mountTour(gf)
    const steps: HintStep[] = [{ id: 'h1', target: '#hint-target', hint: 'Try me' }]

    api.hints(steps)
    const badge = document.querySelector<HTMLElement>('.gf-hint-badge')
    expect(badge).not.toBeNull()

    api.showHints()
    expect(badge?.style.display).toBe('flex')

    api.hideHints()
    expect(badge?.style.display).toBe('none')
  })
})

describe('useTour subsystems', () => {
  it('exposes the instance i18n registry and progress store', () => {
    const { api } = mountTour(gf)

    expect(api.i18n).toBe(gf.i18n)
    expect(api.progress).toBe(gf.progress)
    expect(api.instance).toBe(gf)
  })

  it('setLocale() switches the registry and updates the reactive locale', () => {
    const { api } = mountTour(gf)

    expect(api.locale.value).toBe('en')

    api.i18n.register('fr', { next: 'Suivant' })
    api.setLocale('fr')

    expect(api.locale.value).toBe('fr')
    expect(gf.i18n.activeLocale).toBe('fr')
    expect(api.i18n.t('next')).toBe('Suivant')
  })
})
