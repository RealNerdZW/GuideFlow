import { ProgressStore, type PersistenceDriver } from '@guideflow/core'
import { describe, it, expect, vi } from 'vitest'

import { SUFFIX, clearRecord, isDismissed, loadRecord, recordDismissal } from '../store.js'
import type { BannerRecord } from '../store.js'

function memoryDriver(): PersistenceDriver & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    get<T>(key: string): T | null {
      const v = store.get(key)
      return v !== undefined ? (v as T) : null
    },
    set<T>(key: string, value: T): void {
      store.set(key, value)
    },
    remove(key: string): void {
      store.delete(key)
    },
    keys(): string[] {
      return [...store.keys()]
    },
  }
}

describe('loadRecord', () => {
  it('returns an empty record when nothing is stored', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, dismissed: {} })
  })

  it('discards an unrecognised wire format, loudly', async () => {
    // Discard, do not migrate — but say so. A lost dismissal is visible (a
    // banner someone closed comes back) and silence makes it unattributable.
    const driver = memoryDriver()
    const store = new ProgressStore({ driver })
    await store.setRecord('u1', SUFFIX, { v: 99, dismissed: {} })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, dismissed: {} })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('discards a record whose dismissed map is not an object', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.setRecord('u1', SUFFIX, { v: 1, dismissed: null })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, dismissed: {} })
    warn.mockRestore()
  })
})

describe('isDismissed', () => {
  const record = (dismissed: BannerRecord['dismissed']): BannerRecord => ({ v: 1, dismissed })

  it('is false for a banner with no entry', () => {
    expect(isDismissed(record({}), 'a', undefined)).toBe(false)
  })

  it('an entry with no version suppresses every version', () => {
    const r = record({ a: { at: 1 } })
    expect(isDismissed(r, 'a', undefined)).toBe(true)
    expect(isDismissed(r, 'a', 'v9')).toBe(true)
  })

  it('an entry with a version suppresses only that one', () => {
    const r = record({ a: { ver: 'v1', at: 1 } })
    expect(isDismissed(r, 'a', 'v1')).toBe(true)
    expect(isDismissed(r, 'a', 'v2')).toBe(false)
    expect(isDismissed(r, 'a', undefined)).toBe(false)
  })
})

describe('recordDismissal', () => {
  it('writes under the banner suffix and nothing else', async () => {
    const driver = memoryDriver()
    const store = new ProgressStore({ driver })
    await store.markCompleted('u1', 'a-flow')
    await store.markDismissed('u1', 'a-flow')

    await recordDismissal(store, 'u1', 'b1', undefined)

    expect(await store.getCompletedFlows('u1')).toEqual(['a-flow'])
    expect(await store.isDismissed('u1', 'a-flow')).toBe(true)
    expect(await store.getRecord<BannerRecord>('u1', SUFFIX)).toMatchObject({
      v: 1,
      dismissed: { b1: { at: expect.any(Number) as number } },
    })
  })

  it('stores the version when the author declared one, and omits it otherwise', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await recordDismissal(store, 'u1', 'plain', undefined)
    const withVer = await recordDismissal(store, 'u1', 'versioned', 3)

    expect(withVer.dismissed['plain']).not.toHaveProperty('ver')
    expect(withVer.dismissed['versioned']?.ver).toBe(3)
  })

  it('never evicts the entry it is writing, even when every timestamp ties', async () => {
    // `at` is millisecond-resolution, so fifty-odd dismissals in one tick all
    // tie and the sort is free to order them any way it likes. Without the
    // exemption the entry just written can be the one dropped — a write that
    // silently does nothing. Found by the equivalent test in the checklist.
    const store = new ProgressStore({ driver: memoryDriver() })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      for (let i = 0; i < 60; i += 1) await recordDismissal(store, 'u1', `b${i}`, undefined)
      const record = await loadRecord(store, 'u1')
      expect(Object.keys(record.dismissed)).toHaveLength(50)
      // The most recent write survives.
      expect(record.dismissed['b59']).toBeDefined()
    } finally {
      now.mockRestore()
    }
  })

  it('keeps the most recently dismissed when the cap is exceeded', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    const now = vi.spyOn(Date, 'now')
    try {
      for (let i = 0; i < 60; i += 1) {
        now.mockReturnValue(1_000 + i)
        await recordDismissal(store, 'u1', `b${i}`, undefined)
      }
      const record = await loadRecord(store, 'u1')
      expect(record.dismissed['b59']).toBeDefined()
      expect(record.dismissed['b0']).toBeUndefined()
    } finally {
      now.mockRestore()
    }
  })
})

describe('clearRecord', () => {
  it('empties this suffix and leaves the rest of the namespace alone', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u1', 'a-flow')
    await recordDismissal(store, 'u1', 'b1', undefined)

    await clearRecord(store, 'u1')

    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, dismissed: {} })
    expect(await store.getCompletedFlows('u1')).toEqual(['a-flow'])
  })
})
