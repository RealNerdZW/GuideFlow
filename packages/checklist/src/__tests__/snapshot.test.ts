import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { afterEach, describe, expect, it } from 'vitest'

import { createChecklist } from '../controller.js'
import { ITEM_KEYS, STATE_KEYS, serverSnapshot } from '../snapshot.js'
import type { ChecklistDefinition } from '../types.js'

import { createMemoryDriver, flush } from './helpers.js'

const definition: ChecklistDefinition = {
  id: 'getting-started',
  title: 'Getting started',
  items: [
    { id: 'profile', title: 'Set up your profile', flowId: 'profile-tour' },
    { id: 'data', title: 'Connect your data' },
  ],
}

function make(): GuideFlowInstance {
  return createGuideFlow({
    injectStyles: false,
    persistence: { driver: createMemoryDriver() },
    context: { userId: 'u1' },
  })
}

describe('snapshot identity', () => {
  let gf: GuideFlowInstance

  afterEach(() => {
    gf?.destroy()
  })

  it('the comparator covers every key of a populated state', async () => {
    // The bug this exists to prevent is live in the repo: React's tour-store
    // comparator omits `isWaiting`, so no React consumer re-renders on
    // step:waiting. A hand-written comparator rots silently; this fails loudly.
    gf = make()
    const controller = createChecklist(gf, definition)
    await flush()

    expect([...STATE_KEYS].sort()).toEqual(Object.keys(controller.getSnapshot()).sort())
    const item = controller.getSnapshot().items[0]
    expect([...ITEM_KEYS].sort()).toEqual(Object.keys(item ?? {}).sort())
    controller.destroy()
  })

  it('getSnapshot() is referentially stable across a no-op refresh', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    await flush()

    const first = controller.getSnapshot()
    await controller.refresh()

    // A fresh object on every call is an infinite render loop under
    // useSyncExternalStore.
    expect(controller.getSnapshot()).toBe(first)
    controller.destroy()
  })

  it('a changed item changes only its own reference and the array', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    await flush()

    const before = controller.getSnapshot()
    await controller.complete('data')
    const after = controller.getSnapshot()

    expect(after).not.toBe(before)
    expect(after.items).not.toBe(before.items)
    expect(after.items[1]).not.toBe(before.items[1])
    expect(after.items[0]).toBe(before.items[0])
    controller.destroy()
  })

  it('notifies subscribers only on a real change', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    await flush()

    let calls = 0
    controller.subscribe(() => {
      calls += 1
    })

    await controller.refresh()
    expect(calls).toBe(0)

    await controller.complete('data')
    expect(calls).toBe(1)
    controller.destroy()
  })

  it('getServerSnapshot() is stable and not hydrated', () => {
    gf = make()
    const controller = createChecklist(gf, definition)

    const a = controller.getServerSnapshot()
    expect(controller.getServerSnapshot()).toBe(a)
    expect(a.hydrated).toBe(false)
    expect(a.items).toEqual([])
    expect(a.totalCount).toBe(2)
    controller.destroy()
  })

  it('caches the server snapshot per definition', () => {
    const other: ChecklistDefinition = { id: 'other', title: 'Other', items: [] }
    expect(serverSnapshot(definition)).toBe(serverSnapshot(definition))
    expect(serverSnapshot(other)).not.toBe(serverSnapshot(definition))
  })
})
