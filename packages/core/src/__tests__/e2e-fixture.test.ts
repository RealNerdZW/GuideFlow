// ---------------------------------------------------------------------------
// Guards the Playwright fixture against drifting away from the engine contract.
//
// The e2e suite had never executed, and one of the three reasons was that
// apps/e2e/fixtures/index.html defined tours as a flat `{ id, steps: [...] }`
// object with top-level `title`/`body` — a shape the engine rejects. Nothing
// caught it, because nothing ran the fixture.
//
// This imports the *same module the browser loads* and drives it through the
// real engine, so an invalid fixture now fails the unit suite in seconds rather
// than silently disabling e2e coverage.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

// The fixture's own flow definitions — one source of truth for browser and unit.
import { flows } from '../../../../apps/e2e/fixtures/flows.js'
import { createGuideFlow } from '../index.js'
import type { StateNode } from '../types/index.js'

const FIXTURE_HTML = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/e2e/fixtures/index.html',
)

const states = (flowName: string): Record<string, StateNode> => {
  const flow = flows[flowName]
  if (!flow) throw new Error(`fixture flow "${flowName}" is missing`)
  return flow.states as Record<string, StateNode>
}

describe('e2e fixture flows', () => {
  it('defines the flows the specs reference', () => {
    expect(Object.keys(flows).sort()).toEqual(
      ['basic', 'final', 'multistate', 'persisted', 'scroll'],
    )
  })

  it('every flow is a valid FlowDefinition, not the old flat shape', () => {
    for (const [name, flow] of Object.entries(flows)) {
      expect(typeof flow.id, `${name}.id`).toBe('string')
      expect(typeof flow.initial, `${name}.initial`).toBe('string')
      expect(flow.states, `${name}.states`).toBeTypeOf('object')
      expect(
        Object.keys(flow.states),
        `${name}.initial "${flow.initial}" must name a real state`,
      ).toContain(flow.initial)
      // A flat { id, steps } object would carry no `states` at all.
      expect(flow, `${name} must not use the flat shape`).not.toHaveProperty('steps')
    }
  })

  it('every step carries content as an object', () => {
    for (const name of Object.keys(flows)) {
      for (const [stateId, state] of Object.entries(states(name))) {
        for (const step of state.steps ?? []) {
          expect(step.content, `${name}.${stateId}.${step.id}.content`).toBeTypeOf('object')
          // Top-level title/body was the mistake the old fixture made.
          expect(step, `${name}.${stateId}.${step.id}`).not.toHaveProperty('title')
          expect(step, `${name}.${stateId}.${step.id}`).not.toHaveProperty('body')
        }
      }
    }
  })

  it('every flow can reach a final state', () => {
    for (const name of Object.keys(flows)) {
      const hasFinal = Object.values(states(name)).some((s) => s.final === true)
      expect(hasFinal, `${name} has no final state, so it can never complete`).toBe(true)
    }
  })

  it('every transition target names a real state', () => {
    for (const name of Object.keys(flows)) {
      const all = states(name)
      for (const [stateId, state] of Object.entries(all)) {
        for (const [event, transition] of Object.entries(state.on ?? {})) {
          const target = typeof transition === 'string' ? transition : transition.target
          expect(Object.keys(all), `${name}.${stateId} on.${event} -> "${target}"`).toContain(target)
        }
      }
    }
  })

  it('every step id is unique within its flow', () => {
    for (const name of Object.keys(flows)) {
      const ids = Object.values(states(name)).flatMap((s) => (s.steps ?? []).map((st) => st.id))
      expect(new Set(ids).size, `${name} has duplicate step ids`).toBe(ids.length)
    }
  })

  it('the basic flow renders all three steps through the engine', async () => {
    const gf = createGuideFlow()
    const entered: string[] = []
    gf.on('step:enter', ({ stepId }) => entered.push(stepId))

    await gf.start(flows['basic']!)
    await gf.next()
    await gf.next()

    expect(entered).toEqual(['s1', 's2', 's3'])
    gf.destroy()
  })

  it('the final-state flow renders both steps', async () => {
    // The exact case the specs assert on, and the exact case that used to
    // truncate: a single `final: true` state holding two steps.
    const gf = createGuideFlow()
    const entered: string[] = []
    gf.on('step:enter', ({ stepId }) => entered.push(stepId))

    await gf.start(flows['final']!)
    await gf.next()

    expect(entered).toEqual(['f1', 'f2'])
    gf.destroy()
  })

  it('the multistate flow crosses a state boundary and back', async () => {
    const gf = createGuideFlow()
    const entered: string[] = []
    gf.on('step:enter', ({ stepId }) => entered.push(stepId))

    await gf.start(flows['multistate']!)
    await gf.next()
    await gf.prev()

    expect(entered).toEqual(['m1', 'm2', 'm1'])
    gf.destroy()
  })
})

describe('e2e fixture page', () => {
  const html = readFileSync(FIXTURE_HTML, 'utf8')

  it('exposes window.__guideflow, which the library never sets itself', () => {
    expect(html).toContain('window.__guideflow = gf')
  })

  it('loads the built artefacts rather than a bundler-resolved specifier', () => {
    expect(html).toContain('/packages/core/dist/index.js')
    expect(html).toContain('/packages/core/dist/styles/index.css')
  })

  it('imports its flows from the shared module rather than inlining them', () => {
    expect(html).toContain("import { flows } from './flows.js'")
    // A second definition would let the fixture drift from what this file checks.
    expect(html).not.toContain('var flows = {')
  })

  it('provides a start button for every flow', () => {
    for (const id of [
      'start-btn',
      'start-final-btn',
      'start-scroll-btn',
      'start-persisted-btn',
      'start-multistate-btn',
    ]) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`)
    }
  })
})
