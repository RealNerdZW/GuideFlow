import { ProgressStore } from '@guideflow/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUFFIX, clearList, loadRecord, mergeList, readList, type ChecklistRecord } from '../store.js'

import { createMemoryDriver } from './helpers.js'

function setup(): { store: ProgressStore; driver: ReturnType<typeof createMemoryDriver> } {
  const driver = createMemoryDriver()
  return { store: new ProgressStore({ driver }), driver }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('storage suffix', () => {
  it('is neither of the two reserved single-segment suffixes', () => {
    // A literal assertion on purpose. `setRecord(userId, 'completed', …)`
    // overwrites ProgressStore's completed-flows array byte-for-byte — the two
    // read the identical { value, expiresAt } wrapper — and @guideflow/ai reads
    // that key too. 'caps' belongs to @guideflow/core/targeting.
    expect(SUFFIX).toBe('checklist')
    expect(SUFFIX).not.toBe('completed')
    expect(SUFFIX).not.toBe('caps')
  })

  it('is a single segment, so it cannot collide with a flow-scoped key', () => {
    expect(SUFFIX).not.toContain(':')
  })
})

describe('loadRecord / mergeList', () => {
  it('round-trips a list', async () => {
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', 1, { done: { alpha: 100 } })

    const record = await loadRecord(store, 'u1')
    expect(readList(record, 'list-a', 1).done).toEqual({ alpha: 100 })
  })

  it('lands under the prefix resetUser() sweeps', async () => {
    const { store, driver } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 1 } })
    expect([...driver.store.keys()]).toContain('gf:u1:progress:checklist')

    await store.resetUser('u1')
    expect(await store.getRecord(('u1'), SUFFIX)).toBeNull()
  })

  it('discards an unknown wire format and warns', async () => {
    const { store } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await store.setRecord('u1', SUFFIX, { v: 99, lists: {} })

    const record = await loadRecord(store, 'u1')

    expect(record).toEqual({ v: 1, lists: {} })
    // Deliberately louder than the frequency caps, which discard in silence: a
    // lost cap costs one extra impression, a lost tick is a filed ticket.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unrecognised format'))
  })

  it('discards only the list whose version moved', async () => {
    const { store } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await mergeList(store, 'u1', 'list-a', 1, { done: { alpha: 1 } })
    await mergeList(store, 'u1', 'list-b', 1, { done: { beta: 1 } })

    const record = await loadRecord(store, 'u1')
    expect(readList(record, 'list-a', 2).done).toEqual({})
    expect(readList(record, 'list-b', 1).done).toEqual({ beta: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changed version'))
  })

  it('merges rather than overwrites — two concurrent ticks both survive', async () => {
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 10 } })

    await Promise.all([
      mergeList(store, 'u1', 'list-a', undefined, { done: { beta: 20 } }),
      mergeList(store, 'u1', 'list-a', undefined, { done: { gamma: 30 } }),
    ])

    const record = await loadRecord(store, 'u1')
    expect(Object.keys(readList(record, 'list-a', undefined).done).sort()).toEqual([
      'alpha',
      'beta',
      'gamma',
    ])
  })

  it('keeps the earlier timestamp when both sides tick the same item', async () => {
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 500 } })
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 100 } })

    const record = await loadRecord(store, 'u1')
    expect(readList(record, 'list-a', undefined).done['alpha']).toBe(100)
  })

  it('removes only what `undone` names', async () => {
    // Removal is explicit rather than "whatever the patch omits", because a
    // merge whose absences are meaningful would read a concurrent tick in
    // another tab as a deletion.
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 1, beta: 2 } })
    await mergeList(store, 'u1', 'list-a', undefined, { undone: ['alpha'] })

    const record = await loadRecord(store, 'u1')
    expect(readList(record, 'list-a', undefined).done).toEqual({ beta: 2 })
  })

  it('carries dismissed and collapsed through a later unrelated write', async () => {
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { dismissed: true, collapsed: true })
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 1 } })

    const list = readList(await loadRecord(store, 'u1'), 'list-a', undefined)
    expect(list.dismissed).toBe(true)
    expect(list.collapsed).toBe(true)
  })

  it('prunes to the 20 most recently touched lists', async () => {
    // localStorage has a hard quota, and a store that throws on write silently
    // stops persisting anything at all.
    const { store } = setup()
    for (let i = 0; i < 25; i++) {
      await mergeList(store, 'u1', `list-${i}`, undefined, { done: { a: i } })
    }
    const record = await store.getRecord<ChecklistRecord>('u1', SUFFIX)
    expect(Object.keys(record?.lists ?? {}).length).toBe(20)
    // The list being written always survives. `t` is millisecond-resolution,
    // so twenty-odd writes in the same tick all tie and the sort is free to
    // evict the one that was just written — a write that silently did nothing.
    expect(record?.lists['list-24']).toBeDefined()
  })

  it('clearList drops one list and leaves the others alone', async () => {
    const { store } = setup()
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 1 } })
    await mergeList(store, 'u1', 'list-b', undefined, { done: { beta: 1 } })

    await clearList(store, 'u1', 'list-a')

    const record = await loadRecord(store, 'u1')
    expect(record.lists['list-a']).toBeUndefined()
    expect(record.lists['list-b']).toBeDefined()
  })

  it('never touches the completed-flows array', async () => {
    const { store } = setup()
    await store.markCompleted('u1', 'profile-tour')
    await mergeList(store, 'u1', 'list-a', undefined, { done: { alpha: 1 } })
    expect(await store.getCompletedFlows('u1')).toEqual(['profile-tour'])
  })
})
