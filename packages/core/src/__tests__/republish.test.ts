// ---------------------------------------------------------------------------
// Republishing a changed flow.
//
// The finding for Phase 7.10 says "a tour cannot be changed without a code
// deploy". Most of that sentence was about transport — and transport turned out
// not to be the blocker. THIS was:
//
//   `start()` checks `isCompleted` BEFORE the snapshot version gate, and
//   completion was keyed on the flow id alone. So a user who finished v1 of a
//   tour never saw v2, however much v2 changed. `start()` returned silently:
//   no render, no event, nothing to observe.
//
// Measured before the fix: `tour:start` fired 0 times, `isActive` was false,
// `currentStepId` was null, and no `progress:discard` fired either.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import { ProgressStore } from '../persistence/progress-store.js'
import type { FlowDefinition, PersistenceDriver } from '../types/index.js'
import { withFingerprint } from '../versioning.js'

function memoryDriver(): PersistenceDriver & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    get: <T,>(k: string): T | null => (store.has(k) ? (store.get(k) as T) : null),
    set: <T,>(k: string, v: T): void => void store.set(k, v),
    remove: (k: string): void => void store.delete(k),
    keys: (): string[] => [...store.keys()],
  }
}

const v1: FlowDefinition = withFingerprint({
  id: 'onboarding',
  initial: 'a',
  states: { a: { steps: [{ id: 's1', content: { title: 'Original' } }], final: true } },
})

/** Structurally different: a step added. */
const v2: FlowDefinition = withFingerprint({
  id: 'onboarding',
  initial: 'a',
  states: {
    a: { steps: [{ id: 's1', content: { title: 'Rewritten' } }], on: { NEXT: 'b' } },
    b: { steps: [{ id: 's2', content: { title: 'A brand new step' } }], final: true },
  },
})

/** Content-only edit: the fingerprint deliberately ignores it. */
const v1Typo: FlowDefinition = withFingerprint({
  id: 'onboarding',
  initial: 'a',
  states: { a: { steps: [{ id: 's1', content: { title: 'Original (typo fixed)' } }], final: true } },
})

const instances: GuideFlowInstance[] = []
function make(driver: PersistenceDriver, userId: string): GuideFlowInstance {
  const gf = createGuideFlow({ injectStyles: false, persistence: { driver }, context: { userId } })
  instances.push(gf)
  return gf
}

afterEach(() => {
  for (const gf of instances.splice(0)) gf.destroy()
  document.body.innerHTML = ''
})

describe('a user who completed v1', () => {
  it('SEES a structurally changed v2', async () => {
    const driver = memoryDriver()
    const first = make(driver, 'u1')
    await first.start(v1)
    await first.next()
    expect(first.isActive).toBe(false)

    const second = make(driver, 'u1')
    const started = vi.fn()
    second.on('tour:start', started)
    await second.start(v2)

    expect(started).toHaveBeenCalledTimes(1)
    expect(second.isActive).toBe(true)
    expect(second.currentStepId).toBe('s1')
    expect(second.totalSteps).toBe(2)
  })

  it('does NOT see it again after completing it', async () => {
    const driver = memoryDriver()
    const first = make(driver, 'u2')
    await first.start(v2)
    await first.next()
    await first.next()

    const second = make(driver, 'u2')
    const started = vi.fn()
    second.on('tour:start', started)
    await second.start(v2)
    expect(started).not.toHaveBeenCalled()
  })

  it('does NOT see a content-only edit — the fingerprint ignores copy', async () => {
    // The property that makes republishing safe: fixing a typo must not
    // re-show the tour to everyone who already finished it.
    expect(v1Typo.version).toBe(v1.version)

    const driver = memoryDriver()
    const first = make(driver, 'u3')
    await first.start(v1)
    await first.next()

    const second = make(driver, 'u3')
    const started = vi.fn()
    second.on('tour:start', started)
    await second.start(v1Typo)
    expect(started).not.toHaveBeenCalled()
  })
})

describe('the completed record', () => {
  it('stores the version the user actually finished', async () => {
    const driver = memoryDriver()
    const gf = make(driver, 'u4')
    await gf.start(v1)
    await gf.next()

    const record = driver.store.get('gf:u4:progress:completed') as { value: string[] }
    expect(record.value).toEqual([`onboarding@${String(v1.version)}`])
  })

  it('stores a bare id for a flow with no version', async () => {
    const unversioned: FlowDefinition = {
      id: 'plain',
      initial: 'a',
      states: { a: { steps: [{ id: 's1', content: { title: 'x' } }], final: true } },
    }
    const driver = memoryDriver()
    const gf = make(driver, 'u5')
    await gf.start(unversioned)
    await gf.next()

    const record = driver.store.get('gf:u5:progress:completed') as { value: string[] }
    expect(record.value).toEqual(['plain'])
  })
})

describe('ProgressStore completion, directly', () => {
  it('a legacy unversioned record suppresses every version', async () => {
    // The conservative direction. There is no way to know which version an
    // unversioned record referred to, and resurrecting a tour someone already
    // finished is worse than not re-showing an edit.
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u', 'flow')
    expect(await store.isCompleted('u', 'flow')).toBe(true)
    expect(await store.isCompleted('u', 'flow', 'v1')).toBe(true)
    expect(await store.isCompleted('u', 'flow', 'v2')).toBe(true)
  })

  it('a versioned record suppresses only that version', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u', 'flow', 'v1')
    expect(await store.isCompleted('u', 'flow', 'v1')).toBe(true)
    expect(await store.isCompleted('u', 'flow', 'v2')).toBe(false)
    // Asked without a version: any completion of this flow counts.
    expect(await store.isCompleted('u', 'flow')).toBe(true)
  })

  it('getCompletedFlows returns bare ids, deduplicated', async () => {
    // Load-bearing for @guideflow/checklist, which projects this array by
    // matching an item's `flowId` against it, and for @guideflow/ai, which
    // reads the same key. Raw `id@version` entries leaking out would silently
    // stop both from matching.
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u', 'alpha', 'v1')
    await store.markCompleted('u', 'alpha', 'v2')
    await store.markCompleted('u', 'beta')
    expect((await store.getCompletedFlows('u')).sort()).toEqual(['alpha', 'beta'])
  })

  it('does not mangle a flow id that itself contains @', async () => {
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u', '@acme/onboarding', 'v1')
    expect(await store.getCompletedFlows('u')).toEqual(['@acme/onboarding'])
    expect(await store.isCompleted('u', '@acme/onboarding', 'v1')).toBe(true)
    expect(await store.isCompleted('u', '@acme/onboarding', 'v2')).toBe(false)
  })

  it('does not mangle a flow id with an interior @', async () => {
    // `my@flow` used to be stored bare and read back as `my`, so a checklist
    // item pointing at it silently never ticked.
    const store = new ProgressStore({ driver: memoryDriver() })
    await store.markCompleted('u', 'my@flow')
    expect(await store.getCompletedFlows('u')).toEqual(['my@flow'])
    expect(await store.isCompleted('u', 'my@flow')).toBe(true)
    expect(await store.isCompleted('u', 'my@flow', 'v1')).toBe(true)

    const versioned = new ProgressStore({ driver: memoryDriver() })
    await versioned.markCompleted('u', 'my@flow', 'v1')
    expect(await versioned.getCompletedFlows('u')).toEqual(['my@flow'])
    expect(await versioned.isCompleted('u', 'my@flow', 'v1')).toBe(true)
    expect(await versioned.isCompleted('u', 'my@flow', 'v2')).toBe(false)
  })

  it('resetUser still sweeps it', async () => {
    const driver = memoryDriver()
    const store = new ProgressStore({ driver })
    await store.markCompleted('u', 'flow', 'v1')
    await store.resetUser('u')
    expect(await store.getCompletedFlows('u')).toEqual([])
  })
})
