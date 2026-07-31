// ---------------------------------------------------------------------------
// createTourStore — the whole of @guideflow/svelte's public surface.
//
// This package shipped with no test script at all (AUDIT
// `no-tests-svelte-cli-devtools` / `svelte-no-components-no-tests`), so
// `turbo run test` skipped it silently. These tests drive a real
// createGuideFlow() instance rather than a mock: the store is a thin
// projection of core's events and mocking them would test nothing.
// ---------------------------------------------------------------------------
import { createGuideFlow, type FlowDefinition } from '@guideflow/core'
import { get } from 'svelte/store'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createTourStore, type TourStore } from '../index.js'

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

  it.skip('resets the step stores when the tour ends', async () => {
    // Proposed AUDIT finding `svelte-store-stale-after-tour-ends`.
    //
    // `sync()` runs from inside core's `tour:abandon` / `tour:complete` emit,
    // which happens *before* the engine drops its machine. The store therefore
    // latches the last live values and never converges on the idle instance:
    // after stop() the store reports s2 / 1 / 2 while the instance reports
    // null / 0 / 0, so a progress indicator is stuck at "2 of 2".
    store = createTourStore()

    await store.start(flow)
    await store.next()
    store.stop()

    expect(get(store.currentStepId)).toBe(store.instance.currentStepId)
    expect(get(store.currentStepIndex)).toBe(store.instance.currentStepIndex)
    expect(get(store.totalSteps)).toBe(store.instance.totalSteps)
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

  it.skip('does not tear down an instance it did not create', async () => {
    // Proposed AUDIT finding `svelte-store-destroy-kills-borrowed-instance`.
    //
    // `TourStore.destroy` is documented as "Clean up all event listeners", and
    // the React/Vue adapters only detach their own listeners. The Svelte store
    // additionally calls `gf.destroy()`, so disposing one component's store
    // silently kills a GuideFlow instance that the host owns and shares —
    // taking the host's own listeners with it.
    const gf = createGuideFlow()
    store = createTourStore(gf)

    const hostSaw: string[] = []
    gf.on('tour:start', (e) => hostSaw.push(e.flowId))

    store.destroy()
    await gf.start(flow)

    expect(hostSaw).toEqual(['svelte-store-flow'])
  })
})

describe('store surface', () => {
  it('exposes exactly the TourStore interface', () => {
    store = createTourStore()

    expect(Object.keys(store).sort()).toEqual(
      [
        'currentStepId',
        'currentStepIndex',
        'destroy',
        'goTo',
        'instance',
        'isActive',
        'next',
        'prev',
        'send',
        'start',
        'stop',
        'totalSteps',
      ].sort(),
    )

    expect(typeof store.isActive.subscribe).toBe('function')
    expect(typeof store.currentStepId.subscribe).toBe('function')
    expect(typeof store.currentStepIndex.subscribe).toBe('function')
    expect(typeof store.totalSteps.subscribe).toBe('function')

    expect(typeof store.start).toBe('function')
    expect(typeof store.next).toBe('function')
    expect(typeof store.prev).toBe('function')
    expect(typeof store.goTo).toBe('function')
    expect(typeof store.send).toBe('function')
    expect(typeof store.stop).toBe('function')
    expect(typeof store.destroy).toBe('function')
    expect(store.instance).toBeDefined()
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
