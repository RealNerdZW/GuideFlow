import { describe, it, expect, vi, afterEach } from 'vitest'
import { ProgressStore } from '../persistence/progress-store.js'
import type { PersistenceDriver, FlowSnapshot } from '../types/index.js'

/** In-memory driver for testing */
function createMemoryDriver(): PersistenceDriver & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    get<T>(key: string): T | null {
      const val = store.get(key)
      return val !== undefined ? (val as T) : null
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

describe('ProgressStore', () => {
  it('saves and loads a flow snapshot', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    const snapshot: FlowSnapshot = {
      flowId: 'tour-1',
      currentState: 'step-2',
      stepIndex: 1,
      completed: false,
      timestamp: Date.now(),
    }

    await store.saveSnapshot('user-1', snapshot)
    const loaded = await store.loadSnapshot('user-1', 'tour-1')
    expect(loaded).not.toBeNull()
    expect(loaded?.flowId).toBe('tour-1')
    expect(loaded?.currentState).toBe('step-2')
  })

  it('returns null for non-existent snapshot', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })
    const result = await store.loadSnapshot('user-x', 'no-tour')
    expect(result).toBeNull()
  })

  it('clears a snapshot', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    const snapshot: FlowSnapshot = {
      flowId: 'tour-1',
      currentState: 'a',
      stepIndex: 0,
      completed: false,
      timestamp: Date.now(),
    }

    await store.saveSnapshot('user-1', snapshot)
    await store.clearSnapshot('user-1', 'tour-1')
    const result = await store.loadSnapshot('user-1', 'tour-1')
    expect(result).toBeNull()
  })

  it('marks and checks dismissed state', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markDismissed('user-1', 'tour-1')
    expect(await store.isDismissed('user-1', 'tour-1')).toBe(true)
    expect(await store.isDismissed('user-1', 'tour-2')).toBe(false)
  })

  it('clears dismissed state', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markDismissed('user-1', 'tour-1')
    await store.clearDismissed('user-1', 'tour-1')
    expect(await store.isDismissed('user-1', 'tour-1')).toBe(false)
  })

  it('marks and checks completed flows', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1')
    await store.markCompleted('user-1', 'tour-2')
    expect(await store.isCompleted('user-1', 'tour-1')).toBe(true)
    expect(await store.isCompleted('user-1', 'tour-2')).toBe(true)
    expect(await store.isCompleted('user-1', 'tour-3')).toBe(false)
  })

  it('getCompletedFlows returns all completed flow ids', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-a')
    await store.markCompleted('user-1', 'tour-b')
    const completed = await store.getCompletedFlows('user-1')
    expect(completed).toContain('tour-a')
    expect(completed).toContain('tour-b')
  })

  it('does not duplicate completed flow ids', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1')
    await store.markCompleted('user-1', 'tour-1')
    const completed = await store.getCompletedFlows('user-1')
    expect(completed.filter((id) => id === 'tour-1').length).toBe(1)
  })

  it('resets a user with a driver that has keys()', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1')
    await store.markDismissed('user-1', 'tour-1')
    expect(driver.store.size).toBeGreaterThan(0)

    await store.resetUser('user-1')
    // All keys for user-1 should be removed
    const remaining = [...driver.store.keys()].filter((k) => k.includes('user-1'))
    expect(remaining.length).toBe(0)
  })

  it('expired snapshots are evicted on load', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver, ttl: 1 }) // 1ms TTL

    const snapshot: FlowSnapshot = {
      flowId: 'tour-1',
      currentState: 'a',
      stepIndex: 0,
      completed: false,
      timestamp: Date.now(),
    }

    await store.saveSnapshot('user-1', snapshot)
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10))
    const result = await store.loadSnapshot('user-1', 'tour-1')
    expect(result).toBeNull()
  })
})
