// ---------------------------------------------------------------------------
// The validator and the serialiser.
//
// Assertions are on `code`, never on `message` — messages get reworded, codes
// are the contract. Severity assertions are load-bearing: every one of them is
// grounded in behaviour measured against the real engine, and the pinning tests
// live in authoring-engine.test.ts.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import {
  draftToFlow,
  explainNotLinear,
  flowToDraft,
  parseFlowFile,
  stringifyFlowFile,
  validateFlow,
  type FlowDraft,
  type FlowIssueCode,
} from '../authoring.js'
import type { FlowDefinition } from '../types/index.js'

const codes = (input: unknown, root?: ParentNode): FlowIssueCode[] =>
  validateFlow(input, root ? { root } : {}).issues.map((i) => i.code)

/** A flow with nothing wrong with it. */
const clean: FlowDefinition = {
  id: 'welcome',
  initial: 'a',
  states: {
    a: { steps: [{ id: 's1', target: '#one', content: { title: 'One' } }], on: { NEXT: 'b' } },
    b: { steps: [{ id: 's2', target: '#two', content: { title: 'Two' } }], final: true },
  },
}

describe('a clean flow', () => {
  it('validates with no issues at all', () => {
    const r = validateFlow(clean)
    expect(r.issues).toEqual([])
    expect(r.valid).toBe(true)
    expect(r.flow).toBe(clean)
  })
})

describe('errors', () => {
  it('not-an-object', () => {
    for (const bad of [null, 'x', 42, [], undefined]) {
      expect(validateFlow(bad).errors[0]?.code).toBe('not-an-object')
    }
  })

  it('unsupported-envelope', () => {
    expect(codes({ gfFlowFile: 2, flow: clean })).toContain('unsupported-envelope')
  })

  it('flat-steps-shape — the shape the old DevTools export wrote', () => {
    const r = validateFlow({ id: 'x', name: 'x', steps: [{ id: 's1', title: 'a' }] })
    expect(r.errors[0]?.code).toBe('flat-steps-shape')
    expect(r.errors[0]?.hint).toContain('draftToFlow')
  })

  it('missing-id, missing-initial, no-states', () => {
    expect(codes({ initial: 'a', states: { a: {} } })).toContain('missing-id')
    expect(codes({ id: 'x', states: { a: {} } })).toContain('missing-initial')
    expect(codes({ id: 'x', initial: 'a' })).toContain('no-states')
    expect(codes({ id: 'x', initial: 'a', states: {} })).toContain('no-states')
  })

  it('initial-not-found — the one check the engine already makes', () => {
    expect(codes({ id: 'x', initial: 'nope', states: { a: { steps: [] } } })).toContain(
      'initial-not-found',
    )
  })

  it('unknown-transition-target', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: { title: 't' } }], on: { NEXT: 'ghost' } } },
    })
    const issue = r.errors.find((i) => i.code === 'unknown-transition-target')
    expect(issue).toBeDefined()
    // The severity argument, stated in the message: it is not merely truncated.
    expect(issue?.message).toContain('recorded as completed')
  })

  it('initial-state-has-no-steps', () => {
    expect(codes({ id: 'x', initial: 'a', states: { a: {} } })).toContain(
      'initial-state-has-no-steps',
    )
  })

  it('duplicate-step-id, across states', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 'dup', content: { title: 'a' } }], on: { NEXT: 'b' } },
        b: { steps: [{ id: 'dup', content: { title: 'b' } }], final: true },
      },
    })
    expect(r.errors.map((i) => i.code)).toContain('duplicate-step-id')
  })

  it('step-missing-id and step-missing-content', () => {
    const c = codes({
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ content: { title: 't' } }, { id: 's2', content: {} }], final: true } },
    })
    expect(c).toContain('step-missing-id')
    expect(c).toContain('step-missing-content')
  })

  it('unreachable-state', () => {
    expect(
      codes({
        id: 'x',
        initial: 'a',
        states: {
          a: { steps: [{ id: 's1', content: { title: 'a' } }], final: true },
          orphan: { steps: [{ id: 's2', content: { title: 'b' } }] },
        },
      }),
    ).toContain('unreachable-state')
  })

  it('route-on-step — route belongs on a state', () => {
    expect(
      codes({
        id: 'x',
        initial: 'a',
        states: { a: { steps: [{ id: 's', content: { title: 't' }, route: '/x' }], final: true } },
      }),
    ).toContain('route-on-step')
  })

  it('invalid-target-type', () => {
    expect(
      codes({
        id: 'x',
        initial: 'a',
        states: { a: { steps: [{ id: 's', content: { title: 't' }, target: 42 }], final: true } },
      }),
    ).toContain('invalid-target-type')
  })
})

describe('warnings', () => {
  it('no-final-state is a WARNING — measured: such a flow completes normally', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: { title: 't' }, target: '#a' }] } },
    })
    const issue = r.issues.find((i) => i.code === 'no-final-state')
    expect(issue?.severity).toBe('warning')
    expect(r.valid).toBe(true)
  })

  it('forward-event-not-next', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'a' }, target: '#a' }], on: { CONTINUE: 'b' } },
        b: { steps: [{ id: 's2', content: { title: 'b' }, target: '#b' }], final: true },
      },
    })
    expect(r.warnings.map((i) => i.code)).toContain('forward-event-not-next')
    expect(r.valid).toBe(true)
  })

  it('does NOT report a cycle for a dangling transition', () => {
    // The dangling target used to be added to the visited set and then broken
    // out of, which read as a revisit — so one typo produced two contradictory
    // diagnoses: "the tour completes and is marked complete" (correct) and
    // "the tour restarts and never completes" (wrong).
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's', content: { title: 't' }, target: '#a' }], on: { NEXT: 'ghost' } },
      },
    })
    expect(r.errors.map((i) => i.code)).toContain('unknown-transition-target')
    expect(r.issues.map((i) => i.code)).not.toContain('next-cycle')
  })

  it('next-cycle', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'a' }, target: '#a' }], on: { NEXT: 'b' } },
        b: { steps: [{ id: 's2', content: { title: 'b' }, target: '#b' }], on: { NEXT: 'a' } },
      },
    })
    expect(r.warnings.map((i) => i.code)).toContain('next-cycle')
  })

  it('final-state-with-outgoing', () => {
    expect(
      codes({
        id: 'x',
        initial: 'a',
        states: { a: { steps: [{ id: 's', content: { title: 't' }, target: '#a' }], final: true, on: { NEXT: 'a' } } },
      }),
    ).toContain('final-state-with-outgoing')
  })

  it('invalid-placement and missing-target', () => {
    const c = codes({
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's', content: { title: 't' }, placement: 'diagonal' }], final: true },
      },
    })
    expect(c).toContain('invalid-placement')
    expect(c).toContain('missing-target')
  })

  it('placement: center suppresses missing-target — the announcement recipe', () => {
    expect(
      codes({
        id: 'x',
        initial: 'a',
        states: {
          a: { steps: [{ id: 's', content: { title: 't' }, placement: 'center' }], final: true },
        },
      }),
    ).not.toContain('missing-target')
  })

  it('fragile-selector catches a recorded React useId, with no DOM at all', () => {
    // The rule that makes `guideflow validate` worth running in CI: pure string
    // analysis, so it fires in Node long before a user sees a broken tour.
    const c = codes({
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: { title: 't' }, target: '#:r1:' }], final: true } },
    })
    expect(c).toContain('fragile-selector')
  })

  it('subpath-inert warnings core itself cannot afford to emit', () => {
    const c = codes({
      id: 'x',
      initial: 'a',
      targeting: { startTrigger: 'load' },
      states: {
        a: {
          route: '/x',
          steps: [{ id: 's', content: { html: '<b>hi</b>' }, target: '#a' }],
          final: true,
        },
      },
    })
    expect(c).toContain('targeting-without-subpath')
    expect(c).toContain('route-without-navigation')
    expect(c).toContain('html-content-without-sanitizer')
  })

  it('warnings never make a flow invalid', () => {
    const r = validateFlow({
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: { title: 't' } }] } },
    })
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.errors).toEqual([])
    expect(r.valid).toBe(true)
  })
})

describe('selector rules against a real DOM', () => {
  it('are skipped without a root, and run with one', () => {
    document.body.innerHTML = '<div class="dup"></div><div class="dup"></div>'
    const flow = {
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: { title: 't' }, target: '.dup' }], final: true } },
    }
    expect(codes(flow)).not.toContain('selector-not-unique')
    expect(codes(flow, document)).toContain('selector-not-unique')
  })

  it('reports a selector that matches nothing', () => {
    document.body.innerHTML = '<div></div>'
    expect(
      codes(
        {
          id: 'x',
          initial: 'a',
          states: { a: { steps: [{ id: 's', content: { title: 't' }, target: '#absent' }], final: true } },
        },
        document,
      ),
    ).toContain('selector-no-match')
  })

  it('reports an unparseable selector as an error', () => {
    document.body.innerHTML = '<div></div>'
    const r = validateFlow(
      {
        id: 'x',
        initial: 'a',
        states: { a: { steps: [{ id: 's', content: { title: 't' }, target: ':::' }], final: true } },
      },
      { root: document },
    )
    expect(r.errors.map((i) => i.code)).toContain('invalid-selector')
  })
})

describe('draftToFlow', () => {
  const draft: FlowDraft = {
    kind: 'guideflow-draft',
    draftVersion: 1,
    id: 'welcome',
    name: 'Welcome',
    steps: [
      { id: 'one', title: 'One', body: 'first', target: '#a', placement: 'bottom' },
      { id: 'two', title: 'Two', target: '#b' },
    ],
  }

  it('produces a flow that validates cleanly', () => {
    const flow = draftToFlow(draft)
    expect(validateFlow(flow).issues).toEqual([])
  })

  it('chains one state per step and marks the last final', () => {
    const flow = draftToFlow(draft)
    expect(Object.keys(flow.states)).toEqual(['s0', 's1'])
    expect(flow.initial).toBe('s0')
    expect(flow.states['s0']?.on).toEqual({ NEXT: 's1' })
    expect(flow.states['s1']?.final).toBe(true)
  })

  it('omits `on` entirely on the final state rather than writing `on: {}`', () => {
    // `on: {}` next to `final: true` reads as a contradiction, and the
    // validator flags it. The old inline converter emitted it.
    expect('on' in (draftToFlow(draft).states['s1'] as object)).toBe(false)
  })

  it('carries padding and clickThrough through', () => {
    const flow = draftToFlow({
      ...draft,
      steps: [{ id: 'one', title: 'One', target: '#a', padding: 12, clickThrough: true }],
    })
    const step = flow.states['s0']?.steps?.[0]
    expect(step?.padding).toBe(12)
    expect(step?.clickThrough).toBe(true)
  })

  it('throws on a duplicate step id rather than emitting a broken flow', () => {
    expect(() =>
      draftToFlow({ ...draft, steps: [
        { id: 'same', title: 'a' },
        { id: 'same', title: 'b' },
      ] }),
    ).toThrow(/duplicate step id/i)
  })

  it('throws on an empty draft', () => {
    expect(() => draftToFlow({ ...draft, steps: [] })).toThrow(RangeError)
  })
})

describe('flowToDraft', () => {
  it('round-trips its own output', () => {
    const draft: FlowDraft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: 'welcome',
      name: 'welcome',
      steps: [
        { id: 'one', title: 'One', body: 'first', target: '#a', placement: 'bottom' },
        { id: 'two', title: 'Two', target: '#b' },
      ],
    }
    const back = flowToDraft(draftToFlow(draft)).draft
    expect(back?.steps).toEqual(draft.steps)
    expect(back?.id).toBe('welcome')
  })

  it('flattens a hand-written multi-step state', () => {
    const flow: FlowDefinition = {
      id: 'x',
      initial: 'a',
      states: {
        a: {
          steps: [
            { id: 's1', content: { title: 'One' }, target: '#a' },
            { id: 's2', content: { title: 'Two' }, target: '#b' },
          ],
          final: true,
        },
      },
    }
    expect(flowToDraft(flow).draft?.steps).toHaveLength(2)
  })

  it('refuses a branching flow rather than silently dropping the branch', () => {
    const flow: FlowDefinition = {
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'a' } }], on: { NEXT: 'b', SKIP: 'c' } },
        b: { steps: [{ id: 's2', content: { title: 'b' } }], final: true },
        c: { steps: [{ id: 's3', content: { title: 'c' } }], final: true },
      },
    }
    const { draft, lossy } = flowToDraft(flow)
    expect(draft).toBeNull()
    expect(lossy[0]?.message).toContain('branches')
    expect(explainNotLinear(flow)).toContain('branches')
  })

  it('refuses a flow with a function showIf', () => {
    const flow: FlowDefinition = {
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 's1', content: { title: 'a' }, showIf: () => true }], final: true },
      },
    }
    expect(flowToDraft(flow).draft).toBeNull()
  })

  it('refuses a routed flow', () => {
    const flow: FlowDefinition = {
      id: 'x',
      initial: 'a',
      states: { a: { route: '/settings', steps: [{ id: 's1', content: { title: 'a' } }], final: true } },
    }
    expect(flowToDraft(flow).draft).toBeNull()
  })

  it('returns null explanation for a flow it CAN open', () => {
    expect(explainNotLinear(clean)).toBeNull()
  })
})

describe('stringifyFlowFile / parseFlowFile — one writer, one reader', () => {
  it('round-trips through the envelope', () => {
    const text = stringifyFlowFile(clean, { generator: 'test' })
    const parsed = parseFlowFile(text)
    expect(parsed.valid).toBe(true)
    expect(parsed.flow?.id).toBe('welcome')
    expect(parsed.meta?.generator).toBe('test')
  })

  it('stamps a structural version so a reshaped flow discards stale resume points', () => {
    const parsed = parseFlowFile(stringifyFlowFile(clean))
    expect(typeof parsed.flow?.version).toBe('string')
  })

  it('never overwrites a version the author set', () => {
    const parsed = parseFlowFile(stringifyFlowFile({ ...clean, version: 'v7' }))
    expect(parsed.flow?.version).toBe('v7')
  })

  it('refuses to write a flow carrying a function', () => {
    // The demo's old exporter replaced functions with the string "[Function]",
    // producing a file that looks fine and means something different.
    const withFn: FlowDefinition = {
      ...clean,
      states: {
        ...clean.states,
        a: { steps: [{ id: 's1', content: { title: 'One' }, showIf: () => true }], on: { NEXT: 'b' } },
      },
    }
    expect(() => stringifyFlowFile(withFn)).toThrow(/cannot be written to a file/i)
  })

  it('accepts a bare FlowDefinition, not only the envelope', () => {
    expect(parseFlowFile(JSON.stringify(clean)).valid).toBe(true)
  })

  it('converts a saved draft on the way in', () => {
    const draft: FlowDraft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: 'from-draft',
      name: 'From draft',
      steps: [{ id: 'one', title: 'One', target: '#a' }],
    }
    const parsed = parseFlowFile(JSON.stringify(draft))
    expect(parsed.valid).toBe(true)
    expect(parsed.flow?.initial).toBe('s0')
  })

  it('reports bad JSON instead of throwing', () => {
    const parsed = parseFlowFile('{ nope: }')
    expect(parsed.valid).toBe(false)
    expect(parsed.issues[0]?.code).toBe('not-an-object')
  })

  it('writes trailing-newline, 2-space JSON so a diff is readable', () => {
    const text = stringifyFlowFile(clean)
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "flow": {')
  })
})
