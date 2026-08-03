import { ProgressStore, type PersistenceDriver } from '@guideflow/core'
import { describe, it, expect, vi } from 'vitest'

import { SUFFIX, clearRecord, isSuppressed, loadRecord, recordAsk } from '../store.js'
import type { SurveyRecord } from '../store.js'

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

const NOW = Date.parse('2026-08-03T12:00:00Z')
const DAY = 24 * 3600_000

describe('loadRecord', () => {
  it('returns an empty record when nothing is stored', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, asked: {} })
  })

  it('discards an unrecognised wire format, loudly', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.setRecord('u1', SUFFIX, { v: 99, asked: {} })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, asked: {} })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('discards a record whose asked map is not an object', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.setRecord('u1', SUFFIX, { v: 1, asked: null })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, asked: {} })
    warn.mockRestore()
  })
})

describe('isSuppressed', () => {
  const record = (asked: SurveyRecord['asked']): SurveyRecord => ({ v: 1, asked })

  it('is false when never asked', () => {
    expect(isSuppressed(record({}), 's', undefined, undefined, NOW)).toBe(false)
  })

  it('an ask with no cooldown is final', () => {
    expect(isSuppressed(record({ s: { at: NOW } }), 's', undefined, undefined, NOW + 999 * DAY))
      .toBe(true)
  })

  it('a cooldown expires', () => {
    const r = record({ s: { at: NOW } })
    expect(isSuppressed(r, 's', undefined, 30 * DAY, NOW + 10 * DAY)).toBe(true)
    expect(isSuppressed(r, 's', undefined, 30 * DAY, NOW + 31 * DAY)).toBe(false)
  })

  it('a different version is never suppressed, cooldown or not', () => {
    const r = record({ s: { at: NOW, ver: 1 } })
    expect(isSuppressed(r, 's', 1, 90 * DAY, NOW)).toBe(true)
    expect(isSuppressed(r, 's', 2, 90 * DAY, NOW)).toBe(false)
  })
})

describe('recordAsk', () => {
  it('writes under the survey suffix and nothing else', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u1', 'a-flow')
    await store.markDismissed('u1', 'a-flow')

    await recordAsk(store, 'u1', 's1', undefined, false, NOW)

    expect(await store.getCompletedFlows('u1')).toEqual(['a-flow'])
    expect(await store.isDismissed('u1', 'a-flow')).toBe(true)
    expect(await store.getRecord<SurveyRecord>('u1', SUFFIX)).toMatchObject({
      v: 1,
      asked: { s1: { at: NOW } },
    })
  })

  it('records answeredAt only when the survey was answered', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await recordAsk(store, 'u1', 'declined', undefined, false, NOW)
    const after = await recordAsk(store, 'u1', 'answered', undefined, true, NOW)

    expect(after.asked['declined']).not.toHaveProperty('answeredAt')
    expect(after.asked['answered']?.answeredAt).toBe(NOW)
  })

  it('stores the version when the author declared one', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    const r = await recordAsk(store, 'u1', 's', 3, true, NOW)
    expect(r.asked['s']?.ver).toBe(3)
  })

  it('never evicts the entry it is writing, even when every timestamp ties', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    for (let i = 0; i < 60; i += 1) await recordAsk(store, 'u1', `s${i}`, undefined, false, 1_000)
    const record = await loadRecord(store, 'u1')

    expect(Object.keys(record.asked)).toHaveLength(50)
    expect(record.asked['s59']).toBeDefined()
  })

  it('keeps the most recent when the cap is exceeded', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    for (let i = 0; i < 60; i += 1) {
      await recordAsk(store, 'u1', `s${i}`, undefined, false, 1_000 + i)
    }
    const record = await loadRecord(store, 'u1')
    expect(record.asked['s59']).toBeDefined()
    expect(record.asked['s0']).toBeUndefined()
  })
})

describe('clearRecord', () => {
  it('empties this suffix and leaves the rest of the namespace alone', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u1', 'a-flow')
    await recordAsk(store, 'u1', 's', undefined, true, NOW)

    await clearRecord(store, 'u1')

    expect(await loadRecord(store, 'u1')).toEqual({ v: 1, asked: {} })
    expect(await store.getCompletedFlows('u1')).toEqual(['a-flow'])
  })
})
