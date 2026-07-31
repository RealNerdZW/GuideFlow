/**
 * @vitest-environment node
 *
 * Deliberately node, not happy-dom: `@guideflow/core/versioning` is purely
 * computational and must not reach for a browser global. If it ever does, this
 * file fails rather than passing quietly in a DOM-shaped environment.
 */
import { describe, it, expect } from 'vitest'

import type { FlowDefinition } from '../types/index.js'
import { flowFingerprint, withFingerprint } from '../versioning.js'

const base: FlowDefinition = {
  id: 'onboarding',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        { id: 's1', target: '#a', content: { title: 'One' } },
        { id: 's2', target: '#b', content: { title: 'Two' } },
      ],
      on: { NEXT: 'outro' },
    },
    outro: {
      steps: [{ id: 's3', content: { title: 'Three' } }],
      final: true,
    },
  },
}

/** Deep-ish clone that keeps functions, which JSON round-tripping would drop. */
function clone(flow: FlowDefinition): FlowDefinition {
  return {
    ...flow,
    states: Object.fromEntries(
      Object.entries(flow.states).map(([k, v]) => [
        k,
        { ...v, steps: v.steps?.map((s) => ({ ...s, content: { ...s.content } })) },
      ]),
    ),
  } as FlowDefinition
}

describe('flowFingerprint ignores cosmetic edits', () => {
  const original = flowFingerprint(base)

  it('is stable across repeated calls', () => {
    expect(flowFingerprint(base)).toBe(original)
  })

  it('ignores a rewritten title', () => {
    // Fixing a typo must not restart every returning user's tour. This is the
    // entire reason the fingerprint hashes structure rather than the object.
    const f = clone(base)
    f.states['intro']!.steps![0]!.content = { title: 'Completely different copy' }
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores a changed target and placement', () => {
    const f = clone(base)
    f.states['intro']!.steps![0]!.target = '#somewhere-else'
    f.states['intro']!.steps![0]!.placement = 'left'
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores padding, clickThrough and scrollIntoView', () => {
    const f = clone(base)
    Object.assign(f.states['intro']!.steps![0]!, {
      padding: 40,
      clickThrough: true,
      scrollIntoView: false,
    })
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores added meta and showIf', () => {
    const f = clone(base)
    f.states['intro']!.steps![0]!.meta = { experiment: 'b' }
    f.states['intro']!.steps![0]!.showIf = () => true
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores onEntry / onExit hooks', () => {
    const f = clone(base)
    f.states['intro']!.onEntry = () => undefined
    f.states['intro']!.onExit = () => undefined
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores the flow id and context', () => {
    const f = clone(base)
    f.id = 'renamed-entirely'
    f.context = { userId: 'u1' }
    expect(flowFingerprint(f)).toBe(original)
  })

  it('ignores the key order of the states literal', () => {
    // States are sorted before hashing, so moving a state up in the source is
    // not a structural change.
    const reordered: FlowDefinition = {
      id: base.id,
      initial: base.initial,
      states: { outro: base.states['outro']!, intro: base.states['intro']! },
    }
    expect(flowFingerprint(reordered)).toBe(original)
  })

  it('ignores targeting, which is policy rather than structure', () => {
    const f = clone(base)
    f.targeting = { priority: 5, urlPattern: '/x' }
    expect(flowFingerprint(f)).toBe(original)
  })
})

describe('flowFingerprint changes on structural edits', () => {
  const original = flowFingerprint(base)

  it('changes when a state is renamed', () => {
    const f: FlowDefinition = {
      ...base,
      initial: 'start',
      states: { start: base.states['intro']!, outro: base.states['outro']! },
    }
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when a step is added', () => {
    const f = clone(base)
    f.states['intro']!.steps!.push({ id: 's1b', content: { title: 'New' } })
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when a step is removed', () => {
    const f = clone(base)
    f.states['intro']!.steps!.pop()
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when two steps swap places', () => {
    // The case a step-count hash would miss entirely, and the exact edit that
    // makes a stored index point at the wrong step.
    const f = clone(base)
    const steps = f.states['intro']!.steps!
    ;[steps[0], steps[1]] = [steps[1]!, steps[0]!]
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when a step id is renamed', () => {
    const f = clone(base)
    f.states['intro']!.steps![0]!.id = 's1-renamed'
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when a transition is retargeted', () => {
    const f = clone(base)
    f.states['intro']!.on = { NEXT: 'intro' }
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when a transition is added', () => {
    const f = clone(base)
    f.states['intro']!.on = { NEXT: 'outro', HELP: 'outro' }
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when final is toggled', () => {
    const f = clone(base)
    f.states['intro']!.final = true
    expect(flowFingerprint(f)).not.toBe(original)
  })

  it('changes when initial changes', () => {
    expect(flowFingerprint({ ...base, initial: 'outro' })).not.toBe(original)
  })
})

describe('withFingerprint', () => {
  it('adds a version derived from the structure', () => {
    const out = withFingerprint(base)
    expect(out.version).toBe(flowFingerprint(base))
  })

  it('is idempotent', () => {
    const once = withFingerprint(base)
    expect(withFingerprint(once)).toBe(once)
  })

  it('never overwrites an explicit version', () => {
    // A hand-set marker is a deliberate statement about compatibility; a
    // derived one cannot know better.
    const pinned: FlowDefinition = { ...base, version: 'v2' }
    expect(withFingerprint(pinned).version).toBe('v2')
  })

  it('does not mutate its input', () => {
    const input = clone(base)
    withFingerprint(input)
    expect(input.version).toBeUndefined()
  })
})
