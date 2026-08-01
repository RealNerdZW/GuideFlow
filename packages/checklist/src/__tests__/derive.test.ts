// ---------------------------------------------------------------------------
// `deriveChecklist` is pure, so this is where most of the value lives: no
// driver, no browser, no GuideFlow instance. happy-dom proves nothing about
// the widget, and putting the logic that matters somewhere a plain unit test
// can reach is the mitigation.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import { deriveChecklist } from '../derive.js'
import type { ChecklistDefinition, DeriveInput } from '../types.js'

const list: ChecklistDefinition = {
  id: 'getting-started',
  title: 'Getting started',
  items: [
    { id: 'profile', title: 'Set up your profile', flowId: 'profile-tour' },
    { id: 'data', title: 'Connect your data' },
    { id: 'billing', title: 'Connect billing', requires: ['data'] },
  ],
}

function input(partial: Partial<DeriveInput> = {}): DeriveInput {
  return { completedFlows: [], manual: {}, ...partial }
}

describe('deriveChecklist', () => {
  it('ticks a flow-backed item from completedFlows', () => {
    const { items, doneCount } = deriveChecklist(list, input({ completedFlows: ['profile-tour'] }))
    expect(items[0]?.done).toBe(true)
    expect(items[0]?.source).toBe('flow')
    expect(doneCount).toBe(1)
  })

  it('ticks a manual item from the done map', () => {
    const { items } = deriveChecklist(list, input({ manual: { data: 1_700_000_000_000 } }))
    expect(items[1]?.done).toBe(true)
    expect(items[1]?.source).toBe('manual')
  })

  it('unions the two sources, and the flow source wins the label', () => {
    const { items, doneCount } = deriveChecklist(
      list,
      input({ completedFlows: ['profile-tour'], manual: { profile: 1, data: 2 } }),
    )
    expect(items[0]?.source).toBe('flow')
    expect(items[1]?.source).toBe('manual')
    expect(doneCount).toBe(2)
  })

  it('ignores a completedFlows entry the definition does not declare', () => {
    // The `:completed` array is shared. @guideflow/ai writes 'step:<id>' into
    // it, and a foreign entry must never tick an item.
    const { doneCount } = deriveChecklist(
      list,
      input({ completedFlows: ['step:some-ai-step', 'unrelated-tour'] }),
    )
    expect(doneCount).toBe(0)
  })

  it('falls back to an empty list when completedFlows is not an array', () => {
    // getCompletedFlows trusts entry.value to be an array; a corrupted record
    // must not throw inside a render.
    const bad = { completedFlows: null, manual: {} } as unknown as DeriveInput
    expect(() => deriveChecklist(list, bad)).not.toThrow()
    expect(deriveChecklist(list, bad).doneCount).toBe(0)
  })

  it('marks an item with an unmet requirement unavailable and names it', () => {
    const { items } = deriveChecklist(list, input())
    expect(items[2]?.available).toBe(false)
    expect(items[2]?.blockedBy).toEqual(['data'])
  })

  it('frees the item once its requirement is met', () => {
    const { items } = deriveChecklist(list, input({ manual: { data: 1 } }))
    expect(items[2]?.available).toBe(true)
    expect(items[2]?.blockedBy).toEqual([])
  })

  it('follows a requirement chain transitively', () => {
    const chained: ChecklistDefinition = {
      id: 'chain',
      title: 'Chain',
      items: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', requires: ['a'] },
        { id: 'c', title: 'C', requires: ['b'] },
      ],
    }
    const { items } = deriveChecklist(chained, input())
    // "Do B first" is useless when B is itself unreachable, so A is named too.
    expect(items[2]?.blockedBy).toEqual(['b', 'a'])
  })

  it('reports a requirement naming an item that does not exist', () => {
    const dangling: ChecklistDefinition = {
      id: 'dangling',
      title: 'Dangling',
      items: [{ id: 'a', title: 'A', requires: ['ghost'] }],
    }
    expect(deriveChecklist(dangling, input()).items[0]?.blockedBy).toEqual(['ghost'])
  })

  it('does not hang on a self-reference or a cycle', () => {
    const cyclic: ChecklistDefinition = {
      id: 'cyclic',
      title: 'Cyclic',
      items: [
        { id: 'self', title: 'Self', requires: ['self'] },
        { id: 'a', title: 'A', requires: ['b'] },
        { id: 'b', title: 'B', requires: ['a'] },
      ],
    }
    const { items } = deriveChecklist(cyclic, input())
    // 'self' is excluded from its own blockers — an item cannot block itself.
    expect(items[0]?.blockedBy).toEqual([])
    expect(items[1]?.blockedBy).toEqual(['b'])
  })

  it('counts and completes', () => {
    const all = deriveChecklist(
      list,
      input({ completedFlows: ['profile-tour'], manual: { data: 1, billing: 2 } }),
    )
    expect(all.totalCount).toBe(3)
    expect(all.doneCount).toBe(3)
    expect(all.complete).toBe(true)
  })

  it('is not complete when there are no items at all', () => {
    const empty = deriveChecklist({ id: 'e', title: 'E', items: [] }, input())
    expect(empty.complete).toBe(false)
    expect(empty.totalCount).toBe(0)
  })

  it('reuses one frozen array for every unblocked item', () => {
    // Referential stability matters: the snapshot comparator compares
    // blockedBy element-wise, and a fresh [] per item per derive would defeat
    // the reuse it is there to enable.
    const { items } = deriveChecklist(list, input())
    expect(items[0]?.blockedBy).toBe(items[1]?.blockedBy)
  })
})
