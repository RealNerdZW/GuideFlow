import { describe, it, expect } from 'vitest'

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

  // ── clearCompleted (7.10b) ──────────────────────────────────────────────
  //
  // The surgical alternative to `resetUser()`. Every case below is a way the
  // completion record can be spelled, because `clearCompleted` is useless if it
  // clears only the spelling the caller happened to write.

  it('clearCompleted(userId, flowId) removes every version of that flow', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1', 'v1')
    await store.markCompleted('user-1', 'tour-1', 'v2')
    await store.markCompleted('user-1', 'tour-1') // the unversioned spelling too
    await store.markCompleted('user-1', 'tour-2', 'v1')

    await store.clearCompleted('user-1', 'tour-1')

    expect(await store.isCompleted('user-1', 'tour-1')).toBe(false)
    expect(await store.isCompleted('user-1', 'tour-1', 'v1')).toBe(false)
    expect(await store.isCompleted('user-1', 'tour-1', 'v2')).toBe(false)
    // The other flow is untouched — this is the whole point of not using resetUser.
    expect(await store.isCompleted('user-1', 'tour-2', 'v1')).toBe(true)
  })

  it('clearCompleted handles a flow id with an interior separator', async () => {
    // `my@flow` is stored as `my@flow@` so its own tail is not mistaken for a
    // version. clearCompleted must strip the same way markCompleted spelled it.
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'my@flow')
    await store.markCompleted('user-1', 'my@flow', '3')
    expect(await store.isCompleted('user-1', 'my@flow')).toBe(true)

    await store.clearCompleted('user-1', 'my@flow')
    expect(await store.isCompleted('user-1', 'my@flow')).toBe(false)
    expect(await store.isCompleted('user-1', 'my@flow', '3')).toBe(false)
    expect(await store.getCompletedFlows('user-1')).toEqual([])
  })

  it('clearCompleted with no flowId clears them all', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1', 'v1')
    await store.markCompleted('user-1', 'tour-2')

    await store.clearCompleted('user-1')
    expect(await store.getCompletedFlows('user-1')).toEqual([])
  })

  it('clearCompleted leaves dismissals, snapshots and records alone', async () => {
    // The reason this method exists at all: resetUser() takes everything with
    // it, including targeting caps and @guideflow/checklist state.
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1')
    await store.markDismissed('user-1', 'tour-1')
    await store.setRecord('user-1', 'caps', { shows: 3 })
    await store.saveSnapshot('user-1', {
      flowId: 'tour-2',
      currentState: 'a',
      stepIndex: 1,
      completed: false,
      timestamp: Date.now(),
    })

    await store.clearCompleted('user-1')

    expect(await store.isDismissed('user-1', 'tour-1')).toBe(true)
    expect(await store.getRecord('user-1', 'caps')).toEqual({ shows: 3 })
    expect(await store.loadSnapshot('user-1', 'tour-2')).not.toBeNull()
  })

  it('clearCompleted removes the key rather than storing an empty array', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1')
    expect([...driver.store.keys()]).toContain('gf:user-1:progress:completed')

    await store.clearCompleted('user-1', 'tour-1')
    expect([...driver.store.keys()]).not.toContain('gf:user-1:progress:completed')
  })

  it('clearCompleted on a user with nothing stored is a no-op, not a throw', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await expect(store.clearCompleted('nobody')).resolves.toBeUndefined()
    await expect(store.clearCompleted('nobody', 'tour-1')).resolves.toBeUndefined()
  })

  // ── Dismissal stays flow-scoped, deliberately (7.10c / ADR-015) ─────────
  //
  // Completion is `flowId@version`; dismissal is not, and that asymmetry is a
  // decision rather than an oversight. These two pin it in BOTH directions so
  // that "fixing" the inconsistency has to be an argued change, not a tidy-up.

  it('a dismissal survives a version change — it is about interruption, not content', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markDismissed('user-1', 'tour-1')
    // There is deliberately no version parameter to pass here. If a future
    // signature adds one, this line stops compiling and the decision gets
    // re-argued, which is exactly what should happen.
    expect(await store.isDismissed('user-1', 'tour-1')).toBe(true)
  })

  it('a completion does NOT survive a version change — it is about content', async () => {
    const driver = createMemoryDriver()
    const store = new ProgressStore({ driver })

    await store.markCompleted('user-1', 'tour-1', 'v1')
    expect(await store.isCompleted('user-1', 'tour-1', 'v1')).toBe(true)
    expect(await store.isCompleted('user-1', 'tour-1', 'v2')).toBe(false)
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
