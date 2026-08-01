// ---------------------------------------------------------------------------
// Guards the Playwright fixture against drifting away from this package's
// contract, the way core's own e2e-fixture.test.ts guards flows.js.
//
// The browser loads apps/e2e/fixtures/checklists.js directly from the static
// server, so nothing type-checks it there. This imports the SAME module and
// drives it through the real controller, so a broken fixture fails the unit
// suite in seconds rather than silently disabling e2e coverage.
// ---------------------------------------------------------------------------

import { createGuideFlow } from '@guideflow/core'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error — plain JS with JSDoc types; TS resolves it as untyped.
import { checklists } from '../../../../apps/e2e/fixtures/checklists.js'
import { createChecklist } from '../controller.js'
import { deriveChecklist } from '../derive.js'
import type { ChecklistDefinition } from '../types.js'

import { createMemoryDriver, flush } from './helpers.js'

const lists = checklists as Record<string, ChecklistDefinition>

describe('e2e fixture checklists', () => {
  let destroy: (() => void) | null = null

  afterEach(() => {
    destroy?.()
    destroy = null
  })

  it('defines the lists the specs reference', () => {
    expect(Object.keys(lists).sort()).toEqual(['gettingStarted', 'shortList'])
  })

  it('satisfies ChecklistDefinition', () => {
    for (const [name, list] of Object.entries(lists)) {
      expect(typeof list.id, name).toBe('string')
      expect(typeof list.title, name).toBe('string')
      expect(Array.isArray(list.items), name).toBe(true)
      for (const item of list.items) {
        expect(typeof item.id, `${name}.${item.id}`).toBe('string')
        expect(typeof item.title, `${name}.${item.id}`).toBe('string')
      }
    }
  })

  it('names only ids the list itself declares in `requires`', () => {
    for (const [name, list] of Object.entries(lists)) {
      const ids = new Set(list.items.map((i) => i.id))
      for (const item of list.items) {
        for (const dep of item.requires ?? []) {
          expect(ids.has(dep), `${name}.${item.id} requires "${dep}"`).toBe(true)
        }
      }
    }
  })

  it('derives the row states the specs assert on', () => {
    const state = deriveChecklist(lists['gettingStarted'] as ChecklistDefinition, {
      completedFlows: [],
      manual: {},
    })
    expect(state.totalCount).toBe(3)
    // The spec tabs to a blocked row and asserts activating it starts nothing.
    expect(state.items.some((i) => !i.available)).toBe(true)
    // And to a flow-backed row, which it activates to start a real tour.
    expect(state.items.some((i) => i.flowId !== null)).toBe(true)
  })

  it('drives a real controller', async () => {
    const gf = createGuideFlow({
      injectStyles: false,
      persistence: { driver: createMemoryDriver() },
      context: { userId: 'e2e-user' },
    })
    const controller = createChecklist(gf, lists['gettingStarted'] as ChecklistDefinition)
    destroy = () => {
      controller.destroy()
      gf.destroy()
    }
    await flush()

    expect(controller.getSnapshot().hydrated).toBe(true)
    expect(controller.getSnapshot().totalCount).toBe(3)
  })
})
