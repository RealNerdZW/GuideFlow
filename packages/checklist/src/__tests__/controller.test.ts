import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChecklist } from '../controller.js'
import type { ChecklistDefinition, ChecklistEvent } from '../types.js'

import { createMemoryDriver, flush, makeFlow } from './helpers.js'

const definition: ChecklistDefinition = {
  id: 'getting-started',
  title: 'Getting started',
  items: [
    { id: 'profile', title: 'Set up your profile', flowId: 'profile-tour' },
    { id: 'data', title: 'Connect your data' },
    { id: 'billing', title: 'Connect billing', requires: ['data'] },
  ],
}

function make(overrides: { userId?: string | null } = {}) {
  const driver = createMemoryDriver()
  const gf = createGuideFlow({
    injectStyles: false,
    persistence: { driver },
    ...(overrides.userId !== null && { context: { userId: overrides.userId ?? 'u1' } }),
  })
  return { gf, driver }
}

describe('createChecklist', () => {
  let gf: GuideFlowInstance

  afterEach(() => {
    gf?.destroy()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('hydrates from storage and reports it', async () => {
    const made = make()
    gf = made.gf
    await gf.progress.markCompleted('u1', 'profile-tour')

    const controller = createChecklist(gf, definition)
    expect(controller.getSnapshot().hydrated).toBe(false)

    await flush()

    const state = controller.getSnapshot()
    expect(state.hydrated).toBe(true)
    expect(state.persisted).toBe(true)
    expect(state.items[0]?.done).toBe(true)
    expect(state.doneCount).toBe(1)
    controller.destroy()
  })

  it('NEVER records a flow completion when an item is ticked by hand', async () => {
    // The load-bearing test of the whole design. `gf.start()` gates on
    // `isCompleted` and returns silently, so writing to the completed-flows
    // array from complete() would permanently suppress the tour this item
    // launches — with no error and no return value to inspect.
    const made = make()
    gf = made.gf
    const markCompleted = vi.spyOn(gf.progress, 'markCompleted')

    const controller = createChecklist(gf, definition)
    await flush()
    await controller.complete('profile')

    expect(markCompleted).not.toHaveBeenCalled()
    expect(await gf.progress.getCompletedFlows('u1')).toEqual([])
    expect(controller.getSnapshot().items[0]?.source).toBe('manual')
    controller.destroy()
  })

  it('is idempotent and emits one item-complete', async () => {
    const made = make()
    gf = made.gf
    const events: ChecklistEvent[] = []
    const controller = createChecklist(gf, definition, { onEvent: (e) => events.push(e) })
    await flush()

    await controller.complete('data')
    await controller.complete('data')

    expect(events.filter((e) => e.type === 'item-complete')).toHaveLength(1)
    controller.destroy()
  })

  it('uncomplete removes a manual tick but cannot touch a flow-derived one', async () => {
    const made = make()
    gf = made.gf
    await gf.progress.markCompleted('u1', 'profile-tour')
    const controller = createChecklist(gf, definition)
    await flush()

    await controller.complete('data')
    await controller.uncomplete('data')
    expect(controller.getSnapshot().items[1]?.done).toBe(false)

    await controller.uncomplete('profile')
    // Core has no clearCompleted, and reaching into the completed-flows array
    // to fake one is deliberately rejected.
    expect(controller.getSnapshot().items[0]?.done).toBe(true)
    controller.destroy()
  })

  it('emits complete once every item is done', async () => {
    const made = make()
    gf = made.gf
    const events: ChecklistEvent[] = []
    const controller = createChecklist(gf, definition, { onEvent: (e) => events.push(e) })
    await flush()

    await controller.complete('profile')
    await controller.complete('data')
    expect(events.some((e) => e.type === 'complete')).toBe(false)
    await controller.complete('billing')

    expect(events.filter((e) => e.type === 'complete')).toHaveLength(1)
    expect(controller.getSnapshot().hidden).toBe(true)
    controller.destroy()
  })

  it('ticks from the tour:complete payload without re-reading isCompleted', async () => {
    // Core defers its own markCompleted into a floating async IIFE, so a
    // re-read from this handler races the write. The payload is the only
    // synchronous truth available at that instant.
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    await flush()

    await gf.start('profile-tour')
    // Armed only for the completion, because gf.start() legitimately queries
    // isCompleted itself before it decides to run.
    const isCompleted = vi.spyOn(gf.progress, 'isCompleted').mockImplementation(() => {
      throw new Error('the handler must not query the store')
    })

    await gf.next()
    await flush()

    expect(controller.getSnapshot().items[0]?.done).toBe(true)
    expect(controller.getSnapshot().items[0]?.source).toBe('flow')
    isCompleted.mockRestore()
    controller.destroy()
  })

  it('activate() starts the item flow, and no-ops while a tour is running', async () => {
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    await flush()

    await controller.activate('profile')
    expect(gf.flowId).toBe('profile-tour')

    // TourEngine.start() ends a running tour first and emits tour:abandon,
    // which analytics logs as the user giving up.
    const abandoned = vi.fn()
    gf.on('tour:abandon', abandoned)
    await controller.activate('profile')
    expect(abandoned).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('activate() no-ops on a blocked item and on a done item', async () => {
    const made = make()
    gf = made.gf
    const events: ChecklistEvent[] = []
    const controller = createChecklist(gf, definition, { onEvent: (e) => events.push(e) })
    await flush()

    await controller.activate('billing')
    expect(events.some((e) => e.type === 'item-activate')).toBe(false)

    await controller.complete('data')
    await controller.activate('data')
    expect(events.some((e) => e.type === 'item-activate')).toBe(false)
    controller.destroy()
  })

  it('prefers onActivate over the flow', async () => {
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    const onActivate = vi.fn()
    const controller = createChecklist(gf, {
      ...definition,
      items: [{ id: 'profile', title: 'P', flowId: 'profile-tour', onActivate }],
    })
    await flush()

    await controller.activate('profile')

    expect(onActivate).toHaveBeenCalledOnce()
    expect(gf.isActive).toBe(false)
    controller.destroy()
  })

  it('a throwing onEvent and a throwing subscriber never reach the tour', async () => {
    // core's EventEmitter.emit is a bare forEach with no error isolation: a
    // throwing listener stops every later one AND propagates to the caller.
    // step:enter is emitted inside the try whose catch blanks the popover and
    // ends the tour, so one unguarded checklist bug would kill it.
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const controller = createChecklist(gf, definition, {
      onEvent: () => {
        throw new Error('boom')
      },
    })
    controller.subscribe(() => {
      throw new Error('also boom')
    })
    await flush()

    const completed = vi.fn()
    gf.on('tour:complete', completed)
    await gf.start('profile-tour')
    await gf.next()
    await flush()

    expect(completed).toHaveBeenCalledOnce()
    expect(gf.isActive).toBe(false)
    controller.destroy()
  })

  it('tracks tourActive off gf.isActive, not off listener order', async () => {
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    await flush()

    await gf.start('profile-tour')
    expect(controller.getSnapshot().tourActive).toBe(true)

    await gf.next()
    expect(controller.getSnapshot().tourActive).toBe(false)
    controller.destroy()
  })

  it('with no identity: persisted false, zero driver calls, still derives', async () => {
    const driver = createMemoryDriver()
    const get = vi.spyOn(driver, 'get')
    const set = vi.spyOn(driver, 'set')
    gf = createGuideFlow({ injectStyles: false, persistence: { driver } })

    const controller = createChecklist(gf, definition)
    await flush()
    await controller.complete('data')

    expect(controller.getSnapshot().persisted).toBe(false)
    // The tick is held in memory for the session so the UI stays honest.
    expect(controller.getSnapshot().items[1]?.done).toBe(true)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('mints an anonymous id only when asked', async () => {
    localStorage.clear()
    const driver = createMemoryDriver()
    gf = createGuideFlow({ injectStyles: false, persistence: { driver } })

    const controller = createChecklist(gf, definition, { anonymousId: true })
    await flush()
    await controller.complete('data')

    expect(controller.getSnapshot().persisted).toBe(true)
    expect(localStorage.getItem('gf:checklist-anon-id')).toBeTruthy()
    // Distinct from targeting's key: sharing it would resurrect a
    // frequency-cap identity the host never opted into.
    expect(localStorage.getItem('gf:anon-id')).toBeNull()
    controller.destroy()
    localStorage.clear()
  })

  it('dismiss persists and hides; reset clears only this list', async () => {
    const made = make()
    gf = made.gf
    await gf.progress.markCompleted('u1', 'profile-tour')
    const controller = createChecklist(gf, definition)
    await flush()

    await controller.complete('data')
    await controller.dismiss()
    expect(controller.getSnapshot().hidden).toBe(true)

    await controller.reset()
    await controller.refresh()

    expect(controller.getSnapshot().dismissed).toBe(false)
    expect(controller.getSnapshot().items[1]?.done).toBe(false)
    // The flow-derived tick is untouched: it was never ours.
    expect(controller.getSnapshot().items[0]?.done).toBe(true)
    controller.destroy()
  })

  it('refresh() picks up a userId the app changed', async () => {
    const driver = createMemoryDriver()
    gf = createGuideFlow({ injectStyles: false, persistence: { driver }, context: { userId: 'u1' } })
    await gf.progress.markCompleted('u2', 'profile-tour')

    const controller = createChecklist(gf, definition)
    await flush()
    expect(controller.getSnapshot().items[0]?.done).toBe(false)

    gf.configure({ context: { userId: 'u2' } })
    await controller.refresh()

    expect(controller.getSnapshot().items[0]?.done).toBe(true)
    controller.destroy()
  })

  it('destroy() releases every tour listener', async () => {
    const made = make()
    gf = made.gf
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    await flush()

    const listener = vi.fn()
    controller.subscribe(listener)
    controller.destroy()

    await gf.start('profile-tour')
    await gf.next()
    await flush()

    expect(listener).not.toHaveBeenCalled()
    expect(controller.getSnapshot().items[0]?.done).toBe(false)
  })
})
