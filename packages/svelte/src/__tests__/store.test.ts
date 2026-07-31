// ---------------------------------------------------------------------------
// createTourStore — the whole of @guideflow/svelte's public surface.
//
// This package shipped with no test script at all (AUDIT
// `no-tests-svelte-cli-devtools` / `svelte-no-components-no-tests`), so
// `turbo run test` skipped it silently. These tests drive a real
// createGuideFlow() instance rather than a mock: the store is a thin
// projection of core's events and mocking them would test nothing.
// ---------------------------------------------------------------------------
import { createGuideFlow, type FlowDefinition, type HintStep } from '@guideflow/core'
import { get } from 'svelte/store'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createTourStore, hotspotAction, type TourStore } from '../index.js'

const flow: FlowDefinition = {
  id: 'svelte-store-flow',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 's1', content: { title: 'One' } },
        { id: 's2', content: { title: 'Two' } },
      ],
      final: true,
    },
  },
}

let store: TourStore | null = null

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  store?.destroy()
  store = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('readable contract', () => {
  it('emits the current value synchronously on subscribe and returns an unsubscriber', () => {
    store = createTourStore()

    const active: boolean[] = []
    const ids: Array<string | null> = []
    const indexes: number[] = []
    const totals: number[] = []

    const unsubscribers = [
      store.isActive.subscribe((v) => active.push(v)),
      store.currentStepId.subscribe((v) => ids.push(v)),
      store.currentStepIndex.subscribe((v) => indexes.push(v)),
      store.totalSteps.subscribe((v) => totals.push(v)),
    ]

    // Synchronous, before any await or event: this is what `$tour.isActive`
    // relies on when a component first renders.
    expect(active).toEqual([false])
    expect(ids).toEqual([null])
    expect(indexes).toEqual([0])
    expect(totals).toEqual([0])

    unsubscribers.forEach((unsubscribe) => expect(typeof unsubscribe).toBe('function'))
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  })

  it('works with svelte/store helpers that assume the contract', () => {
    store = createTourStore()
    expect(get(store.isActive)).toBe(false)
    expect(get(store.currentStepId)).toBeNull()
    expect(get(store.currentStepIndex)).toBe(0)
    expect(get(store.totalSteps)).toBe(0)
  })
})

describe('store updates while a tour runs', () => {
  it('reflects start, next and completion', async () => {
    store = createTourStore()

    await store.start(flow)
    expect(get(store.isActive)).toBe(true)
    expect(get(store.currentStepId)).toBe('s1')
    expect(get(store.currentStepIndex)).toBe(0)
    expect(get(store.totalSteps)).toBe(2)

    await store.next()
    expect(get(store.currentStepId)).toBe('s2')
    expect(get(store.currentStepIndex)).toBe(1)
    expect(get(store.isActive)).toBe(true)

    await store.next() // past the last step of the final state — tour completes
    expect(get(store.isActive)).toBe(false)
  })

  it('reflects prev() and goTo()', async () => {
    store = createTourStore()

    await store.start(flow)
    await store.next()
    expect(get(store.currentStepId)).toBe('s2')

    await store.prev()
    expect(get(store.currentStepId)).toBe('s1')
    expect(get(store.currentStepIndex)).toBe(0)

    await store.goTo('s2')
    expect(get(store.currentStepId)).toBe('s2')
    expect(get(store.currentStepIndex)).toBe(1)
  })

  it('clears isActive when the tour is stopped', async () => {
    store = createTourStore()

    await store.start(flow)
    expect(get(store.isActive)).toBe(true)

    store.stop()
    expect(get(store.isActive)).toBe(false)
  })

  it('resets the step stores when the tour ends', async () => {
    // Regression: AUDIT `svelte-store-stale-after-tour-ends`.
    //
    // `sync()` runs from inside core's `tour:abandon` / `tour:complete` emit,
    // which happens *before* the engine drops its machine. The store therefore
    // latched the last live values and never converged on the idle instance:
    // after stop() the store reported s2 / 1 / 2 while the instance reported
    // null / 0 / 0, so a progress indicator was stuck at "2 of 2".
    store = createTourStore()

    await store.start(flow)
    await store.next()
    store.stop()

    expect(get(store.currentStepId)).toBe(store.instance.currentStepId)
    expect(get(store.currentStepIndex)).toBe(store.instance.currentStepIndex)
    expect(get(store.totalSteps)).toBe(store.instance.totalSteps)
    expect(get(store.currentStep)).toBe(store.instance.currentStep)
    expect(get(store.currentContent)).toBe(store.instance.currentContent)

    expect(get(store.currentStepId)).toBeNull()
    expect(get(store.currentStepIndex)).toBe(0)
    expect(get(store.totalSteps)).toBe(0)
  })

  it('resets the step stores when the tour completes', async () => {
    store = createTourStore()

    await store.start(flow)
    await store.next()
    await store.next() // past the last step of the final state

    expect(get(store.isActive)).toBe(false)
    expect(get(store.currentStepId)).toBeNull()
    expect(get(store.currentStepIndex)).toBe(0)
    expect(get(store.totalSteps)).toBe(0)
    expect(get(store.currentStep)).toBeNull()
    expect(get(store.currentContent)).toBeNull()
  })

  it('updates when the underlying instance is driven directly', async () => {
    // The store adopts an instance it was handed, and must stay in sync with
    // it even when the host bypasses the store's own methods.
    const gf = createGuideFlow()
    store = createTourStore(gf)
    expect(store.instance).toBe(gf)

    await gf.start(flow)
    expect(get(store.isActive)).toBe(true)
    expect(get(store.currentStepId)).toBe('s1')

    await gf.next()
    expect(get(store.currentStepIndex)).toBe(1)
  })
})

describe('unsubscribe', () => {
  it('stops delivering updates to an unsubscribed subscriber', async () => {
    store = createTourStore()

    const seen: Array<string | null> = []
    const unsubscribe = store.currentStepId.subscribe((v) => seen.push(v))

    await store.start(flow)
    expect(seen).toEqual([null, 's1'])

    unsubscribe()
    await store.next()

    expect(seen).toEqual([null, 's1'])
    expect(get(store.currentStepId)).toBe('s2') // the store itself kept moving
  })
})

describe('destroy()', () => {
  it('removes every core event subscription', async () => {
    store = createTourStore()

    const seen: Array<string | null> = []
    store.currentStepId.subscribe((v) => seen.push(v))

    await store.start(flow)
    expect(seen).toEqual([null, 's1'])

    store.destroy()

    // Re-emitting core's events must not reach the store any more. If any
    // `gf.on(...)` handler survived, `seen` would gain a third entry.
    store.instance.emit('step:enter', { stepId: 'ghost', stepIndex: 9, target: null })
    store.instance.emit('tour:start', { flowId: 'ghost-flow' })
    store.instance.emit('tour:complete', { flowId: 'ghost-flow' })
    store.instance.emit('tour:abandon', { flowId: 'ghost-flow', stepId: 'ghost', stepIndex: 9 })
    store.instance.emit('step:exit', { stepId: 'ghost', stepIndex: 9 })

    expect(seen).toEqual([null, 's1'])
    expect(get(store.currentStepId)).toBe('s1')
  })

  it('is safe to call twice', () => {
    store = createTourStore()
    store.destroy()
    expect(() => store?.destroy()).not.toThrow()
  })

  it('does not tear down an instance it did not create', async () => {
    // Regression: AUDIT `svelte-store-destroy-kills-borrowed-instance`.
    //
    // `TourStore.destroy` detaches the store's own listeners. It used to also
    // call `gf.destroy()` unconditionally, so disposing one component's store
    // silently killed a GuideFlow instance the host owned and shared — taking
    // the host's own listeners with it.
    const gf = createGuideFlow()
    store = createTourStore(gf)
    expect(store.ownsInstance).toBe(false)

    const hostSaw: string[] = []
    gf.on('tour:start', (e) => hostSaw.push(e.flowId))

    store.destroy()
    await gf.start(flow)

    expect(hostSaw).toEqual(['svelte-store-flow'])

    gf.destroy()
  })

  it('destroys an instance it created itself', () => {
    store = createTourStore()
    expect(store.ownsInstance).toBe(true)

    const destroySpy = vi.spyOn(store.instance, 'destroy')
    store.destroy()

    expect(destroySpy).toHaveBeenCalledTimes(1)
  })

  it('reports ownership correctly for a config argument', () => {
    store = createTourStore({ debug: false })
    expect(store.ownsInstance).toBe(true)
  })
})

describe('store surface', () => {
  it('exposes exactly the TourStore interface', () => {
    store = createTourStore()

    expect(Object.keys(store).sort()).toEqual(
      [
        'configure',
        'createFlow',
        'currentContent',
        'currentStep',
        'currentStepId',
        'currentStepIndex',
        'destroy',
        'goTo',
        'hideHints',
        'hints',
        'hotspot',
        'i18n',
        'instance',
        'isActive',
        'isPaused',
        'listFlows',
        'locale',
        'next',
        'ownsInstance',
        'pause',
        'prev',
        'progress',
        'removeHotspot',
        'resume',
        'send',
        'setLocale',
        'showHints',
        'skip',
        'start',
        'stop',
        'totalSteps',
      ].sort(),
    )

    const readables = [
      store.isActive,
      store.isPaused,
      store.currentStepId,
      store.currentStepIndex,
      store.totalSteps,
      store.currentStep,
      store.currentContent,
      store.locale,
    ]
    readables.forEach((readable) => expect(typeof readable.subscribe).toBe('function'))

    const methods = [
      store.start,
      store.next,
      store.prev,
      store.goTo,
      store.send,
      store.stop,
      store.pause,
      store.resume,
      store.skip,
      store.createFlow,
      store.listFlows,
      store.configure,
      store.hotspot,
      store.removeHotspot,
      store.hints,
      store.showHints,
      store.hideHints,
      store.setLocale,
      store.destroy,
    ]
    methods.forEach((method) => expect(typeof method).toBe('function'))

    expect(store.instance).toBeDefined()
    expect(store.i18n).toBe(store.instance.i18n)
    expect(store.progress).toBe(store.instance.progress)
  })

  it('does not expose set/update on the readable stores', () => {
    store = createTourStore()
    // Read-only projections: a component must not be able to lie to the engine.
    expect('set' in store.isActive).toBe(false)
    expect('update' in store.currentStepId).toBe(false)
  })

  it('drives the state machine through send()', async () => {
    const twoStateFlow: FlowDefinition = {
      id: 'svelte-two-state-flow',
      initial: 'a',
      states: {
        a: { steps: [{ id: 'a1', content: { title: 'A1' } }], on: { GO: 'b' } },
        b: { steps: [{ id: 'b1', content: { title: 'B1' } }], final: true },
      },
    }

    store = createTourStore()
    await store.start(twoStateFlow)
    expect(get(store.currentStepId)).toBe('a1')

    await store.send('GO')
    expect(get(store.currentStepId)).toBe('b1')
  })
})

// ── currentStep / currentContent ────────────────────────────────────────────

describe('currentStep and currentContent', () => {
  it('project the live step object and its resolved content', async () => {
    store = createTourStore()

    expect(get(store.currentStep)).toBeNull()
    expect(get(store.currentContent)).toBeNull()

    await store.start(flow)

    expect(get(store.currentStep)).toBe(store.instance.currentStep)
    expect(get(store.currentStep)?.id).toBe('s1')
    expect(get(store.currentContent)).toEqual({ title: 'One' })

    await store.next()

    expect(get(store.currentStep)?.id).toBe('s2')
    expect(get(store.currentContent)).toEqual({ title: 'Two' })
  })

  it('exposes content that core resolved asynchronously', async () => {
    store = createTourStore()

    await store.start({
      id: 'svelte-async-content',
      initial: 'main',
      states: {
        main: {
          steps: [{ id: 'lazy', content: () => Promise.resolve({ title: 'Resolved' }) }],
          final: true,
        },
      },
    })

    expect(get(store.currentContent)).toEqual({ title: 'Resolved' })
  })
})

// ── pause / resume / skip ───────────────────────────────────────────────────

describe('pause, resume and skip', () => {
  it('pauses and resumes without abandoning the flow', async () => {
    store = createTourStore()

    await store.start(flow)
    expect(get(store.isPaused)).toBe(false)

    store.pause()
    expect(get(store.isPaused)).toBe(true)
    expect(get(store.isActive)).toBe(true)
    expect(get(store.currentStepId)).toBe('s1')

    store.resume()
    expect(get(store.isPaused)).toBe(false)
    expect(get(store.isActive)).toBe(true)
  })

  it('tracks pause/resume driven straight off the instance', async () => {
    store = createTourStore()

    await store.start(flow)
    store.instance.pause()
    expect(get(store.isPaused)).toBe(true)

    store.instance.resume()
    expect(get(store.isPaused)).toBe(false)
  })

  it('subscribes to an already-paused tour and reports isPaused true immediately', async () => {
    // The store is created *after* pause(), so there is no `tour:pause` event
    // left for it to observe. Seeding from `gf.isPaused` is the only way it can
    // know — it used to hard-code `false` and report a paused tour as running.
    const gf = createGuideFlow()
    await gf.start(flow)
    gf.pause()

    store = createTourStore(gf)

    expect(get(store.isPaused)).toBe(true)
    expect(get(store.isActive)).toBe(true)
    expect(get(store.currentStepId)).toBe('s1')

    gf.destroy()
  })

  it('clears isPaused when the tour ends', async () => {
    store = createTourStore()

    await store.start(flow)
    store.pause()
    expect(get(store.isPaused)).toBe(true)

    store.stop()
    expect(get(store.isPaused)).toBe(false)
  })

  it('skip() emits the user-dismissal sequence and resets the stores', async () => {
    store = createTourStore()

    const skipped: string[] = []
    const dismissed: string[] = []
    const abandoned: string[] = []
    store.instance.on('step:skip', (e) => skipped.push(e.stepId))
    store.instance.on('tour:dismiss', (e) => dismissed.push(e.flowId))
    store.instance.on('tour:abandon', (e) => abandoned.push(e.flowId))

    await store.start(flow)
    store.skip()

    expect(skipped).toEqual(['s1'])
    expect(dismissed).toEqual(['svelte-store-flow'])
    expect(abandoned).toEqual(['svelte-store-flow'])
    expect(get(store.isActive)).toBe(false)
    expect(get(store.currentStepId)).toBeNull()
  })
})

// ── Flows, configuration and subsystems ─────────────────────────────────────

describe('flow registry and configuration', () => {
  it('registers and lists flows', () => {
    store = createTourStore()

    expect(store.listFlows()).toEqual([])

    const registered = store.createFlow(flow)

    expect(registered).toBe(flow)
    expect(store.listFlows()).toEqual([flow])
    expect(store.instance.listFlows()).toEqual([flow])
  })

  it('starts a flow registered through the store by id', async () => {
    store = createTourStore()
    store.createFlow(flow)

    await store.start('svelte-store-flow')

    expect(get(store.isActive)).toBe(true)
    expect(get(store.currentStepId)).toBe('s1')
  })

  it('forwards configure() to the instance', () => {
    store = createTourStore()
    const configureSpy = vi.spyOn(store.instance, 'configure')

    store.configure({ debug: true })

    expect(configureSpy).toHaveBeenCalledWith({ debug: true })
  })
})

describe('standalone UI surface', () => {
  it('creates and removes hotspots', () => {
    const target = document.createElement('button')
    document.body.appendChild(target)

    store = createTourStore()
    const id = store.hotspot(target, { title: 'New' })

    expect(id).not.toBe('')
    expect(document.querySelector(`[data-gf-hotspot-id="${id}"]`)).not.toBeNull()

    store.removeHotspot(id)

    expect(document.querySelector(`[data-gf-hotspot-id="${id}"]`)).toBeNull()
  })

  it('registers hints and toggles their visibility', () => {
    const target = document.createElement('div')
    target.id = 'svelte-hint-target'
    document.body.appendChild(target)

    store = createTourStore()
    const steps: HintStep[] = [{ id: 'h1', target: '#svelte-hint-target', hint: 'Try me' }]

    store.hints(steps)
    const badge = document.querySelector<HTMLElement>('.gf-hint-badge')
    expect(badge).not.toBeNull()

    store.showHints()
    expect(badge?.style.display).toBe('flex')

    store.hideHints()
    expect(badge?.style.display).toBe('none')
  })
})

describe('i18n', () => {
  it('setLocale() switches the registry and updates the locale store', () => {
    store = createTourStore()

    expect(get(store.locale)).toBe('en')

    store.i18n.register('fr', { next: 'Suivant' })
    store.setLocale('fr')

    expect(get(store.locale)).toBe('fr')
    expect(store.instance.i18n.activeLocale).toBe('fr')
    expect(store.i18n.t('next')).toBe('Suivant')
  })
})

// ── hotspotAction ───────────────────────────────────────────────────────────

describe('hotspotAction', () => {
  function beacons(): NodeListOf<Element> {
    return document.querySelectorAll('[data-gf-hotspot-id]')
  }

  it('creates a beacon for the node it is applied to and removes it on destroy', () => {
    store = createTourStore()
    const node = document.createElement('button')
    document.body.appendChild(node)

    const action = hotspotAction(store.instance)
    const handle = action(node, { title: 'New' })

    expect(beacons()).toHaveLength(1)

    handle.destroy()

    expect(beacons()).toHaveLength(0)
  })

  it('replaces the beacon when the options change', () => {
    store = createTourStore()
    const node = document.createElement('button')
    document.body.appendChild(node)

    const handle = hotspotAction(store.instance)(node, { title: 'First' })
    const firstId = document.querySelector('[data-gf-hotspot-id]')?.getAttribute('data-gf-hotspot-id')

    handle.update({ title: 'Second' })

    expect(beacons()).toHaveLength(1)
    const secondId = document.querySelector('[data-gf-hotspot-id]')?.getAttribute('data-gf-hotspot-id')
    expect(secondId).not.toBe(firstId)
    expect(document.querySelector('[data-gf-hotspot-id]')?.getAttribute('aria-label')).toBe('Second')

    handle.destroy()
    expect(beacons()).toHaveLength(0)
  })

  it('works without options and is safe to destroy twice', () => {
    store = createTourStore()
    const node = document.createElement('button')
    document.body.appendChild(node)

    const handle = hotspotAction(store.instance)(node)
    expect(beacons()).toHaveLength(1)

    handle.destroy()
    expect(() => handle.destroy()).not.toThrow()
    expect(beacons()).toHaveLength(0)
  })

  it('update() with no options rebuilds a default beacon', () => {
    store = createTourStore()
    const node = document.createElement('button')
    document.body.appendChild(node)

    const handle = hotspotAction(store.instance)(node, { title: 'First' })
    handle.update()

    expect(beacons()).toHaveLength(1)
    expect(document.querySelector('[data-gf-hotspot-id]')?.getAttribute('aria-label')).toBe(
      'Guidance hint',
    )

    handle.destroy()
  })
})
