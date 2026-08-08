// ---------------------------------------------------------------------------
// The catalogue engine, unit level.
//
// `server.test.ts` drives the two tools through a real MCP client; this covers
// the shapes a client is unlikely to produce but a hand-edited catalogue
// routinely does — a bare string where an object belongs, a key that is not a
// ContentCatalogue field, a state id used where a step id was meant.
//
// Every one of these is silent at runtime. `registerContent` merges whatever it
// is handed and the engine has no way to know a translation is wrong, so an
// unreported case here is a defect that only ever shows up to a user reading
// the one locale nobody on the team reads.
// ---------------------------------------------------------------------------

import type { FlowDefinition } from '@guideflow/core'
import { describe, it, expect } from 'vitest'

import { checkCatalogue, extractStrings, type CatalogueIssueCode } from '../catalogue.js'

const FLOW = {
  id: 'onboarding',
  initial: 'welcome',
  states: {
    welcome: {
      label: 'Getting started',
      steps: [
        {
          id: 'hello',
          content: { title: 'Welcome back, {{firstName}}', body: 'You are on {{plan|the free plan}}.' },
        },
      ],
      on: { NEXT: 'done' },
    },
    // Reachable only by a custom event, so it is OFF the NEXT path — and its
    // copy still has to be translated.
    aside: { steps: [{ id: 'tip', content: { title: 'A tip' } }] },
    done: { steps: [{ id: 'bye', content: { title: 'All set' } }], final: true },
  },
} as unknown as FlowDefinition

/** `content.html` is translatable and is NOT interpolated. Both matter. */
const HTML_FLOW = {
  id: 'rich',
  initial: 'a',
  states: {
    a: {
      steps: [{ id: 'rich', content: { title: 'Rich', html: '<p>Hi {{firstName}}</p>' } }],
      final: true,
    },
  },
} as unknown as FlowDefinition

/** Codes only — the messages are prose and may be reworded. */
function codes(issues: Array<{ code: CatalogueIssueCode }>): CatalogueIssueCode[] {
  return issues.map((i) => i.code).sort()
}

describe('extractStrings', () => {
  it('extracts every state’s steps, not only those on the NEXT path', () => {
    const { catalogue } = extractStrings(FLOW)
    // `aside` is unreachable by NEXT, so `countSteps` would not see it. A
    // translator still has to be given its copy.
    expect(Object.keys(catalogue.steps).sort()).toEqual(['bye', 'hello', 'tip'])
  })

  it('carries the original copy as the value, so the file diffs', () => {
    const { catalogue, stringCount } = extractStrings(FLOW)
    expect(catalogue.steps['hello']).toEqual({
      title: 'Welcome back, {{firstName}}',
      body: 'You are on {{plan|the free plan}}.',
    })
    expect(catalogue.states).toEqual({ welcome: 'Getting started' })
    // 2 (hello) + 1 (tip) + 1 (bye) + 1 state label
    expect(stringCount).toBe(5)
  })

  it('names the tokens that have to survive translation', () => {
    const { tokens } = extractStrings(FLOW)
    expect(tokens).toEqual({
      'steps.hello.title': ['firstName'],
      'steps.hello.body': ['plan'],
    })
  })

  it('keeps the first of two steps sharing an id, and does NOT warn about it', () => {
    // There used to be a `duplicate-step-id` warning here. It was unreachable
    // through either tool: `resolveFlowSource` refuses any flow `validateFlow`
    // rejected, and `duplicate-step-id` is an ERROR in the core validator
    // (authoring.ts:370) — so the tool answer is a refusal naming
    // guideflow_validate_flow, never a catalogue plus a warning. A dead branch
    // that reads as a live guarantee is worse than no branch;
    // `server.test.ts` pins the refusal that actually happens.
    const dupes = {
      id: 'x',
      initial: 'a',
      states: {
        a: { steps: [{ id: 'same', content: { title: 'First' } }], on: { NEXT: 'b' } },
        b: { steps: [{ id: 'same', content: { title: 'Second' } }], final: true },
      },
    } as unknown as FlowDefinition
    const { catalogue, issues } = extractStrings(dupes)
    expect(issues).toEqual([])
    expect(catalogue.steps['same']).toEqual({ title: 'First' })
  })

  it('extracts html, and flags a token inside it as never substituted', () => {
    const { catalogue, issues } = extractStrings(HTML_FLOW)
    expect(catalogue.steps['rich']).toEqual({ title: 'Rich', html: '<p>Hi {{firstName}}</p>' })
    // `_resolveContent` interpolates `title` and `body` and deliberately not
    // `html` (ADR-022: an untrusted value must not shape an attribute context
    // before the sanitiser parses it). So this token reaches the user as
    // written, and the author almost certainly did not mean that.
    const html = issues.find((i) => i.code === 'token-in-html')
    expect(html?.path).toBe('steps.rich.html')
    expect(html?.severity).toBe('warning')
  })

  it('does not call a token dropped from html "lost", because it never resolved', () => {
    const result = checkCatalogue(HTML_FLOW, { steps: { rich: { html: '<p>Hola</p>' } } })
    expect(codes(result.errors)).toEqual([])
  })

  it('warns when a translation puts a token INTO html, where it stays literal', () => {
    const result = checkCatalogue(HTML_FLOW, { steps: { rich: { html: '<p>Hola {{firstName}}</p>' } } })
    expect(result.warnings.some((i) => i.code === 'token-in-html')).toBe(true)
    expect(result.valid).toBe(true)
  })

  it('warns when a translation adds html the step does not have', () => {
    // The merge adds it — and `html` needs the opt-in sanitiser, so a locale
    // that has it and a flow file that does not is two problems.
    const result = checkCatalogue(FLOW, { steps: { tip: { html: '<p>Un consejo</p>' } } })
    const added = result.warnings.find((i) => i.code === 'field-not-in-original')
    expect(added?.path).toBe('steps.tip.html')
    expect(added?.hint).toContain('sanitiser')
  })

  it('skips a step whose content is not a serialisable object', () => {
    // Unreachable through the tools — every path in is JSON — but a hand-built
    // FlowDefinition can carry the function form, and it must not throw.
    const fn = {
      id: 'x',
      initial: 'a',
      states: { a: { steps: [{ id: 's', content: () => ({ title: 'later' }) }], final: true } },
    } as unknown as FlowDefinition
    expect(extractStrings(fn).catalogue.steps).toEqual({})
  })
})

describe('checkCatalogue', () => {
  it('accepts a complete, faithful translation', () => {
    const result = checkCatalogue(FLOW, {
      steps: {
        hello: { title: 'Hola de nuevo, {{firstName}}', body: 'Estás en {{plan|el plan gratuito}}.' },
        tip: { title: 'Un consejo' },
        bye: { title: 'Listo' },
      },
      states: { welcome: 'Primeros pasos' },
    })
    expect(result.issues).toEqual([])
    expect(result.valid).toBe(true)
    expect(result.coverage).toEqual({
      total: 5,
      translated: 5,
      missingSteps: [],
      missingStates: [],
    })
  })

  it('compares token NAMES, so translating a fallback is correct', () => {
    // `{{plan|the free plan}}` → `{{plan|el plan gratuito}}`: the fallback is
    // copy, and a check on the written form would flag a correct translation.
    const result = checkCatalogue(FLOW, {
      steps: { hello: { body: 'Estás en {{plan|el plan gratuito}}.' } },
    })
    expect(result.errors).toEqual([])
  })

  it('rejects a catalogue that is not an object', () => {
    for (const bad of [null, 42, 'steps', ['hello']]) {
      const result = checkCatalogue(FLOW, bad)
      expect(codes(result.errors)).toContain('not-an-object')
      expect(result.coverage.total).toBe(0)
    }
  })

  it('rejects a `steps` map that is not a map', () => {
    const result = checkCatalogue(FLOW, { steps: ['hello'], states: 'nope' })
    expect(codes(result.errors)).toEqual(['not-an-object', 'not-an-object'])
  })

  it('rejects a bare string where a step entry belongs', () => {
    const result = checkCatalogue(FLOW, { steps: { hello: 'Hola' } })
    expect(result.errors[0]?.code).toBe('not-an-object')
    expect(result.errors[0]?.path).toBe('steps.hello')
  })

  it('rejects a non-string field and a non-string label', () => {
    const result = checkCatalogue(FLOW, {
      steps: { hello: { title: 12 } },
      states: { welcome: { label: 'no' } },
    })
    expect(codes(result.errors)).toEqual(['not-a-string', 'not-a-string'])
  })

  it('warns about a field that is not a ContentCatalogue field', () => {
    // Dropped on merge, so it translates nothing and says nothing.
    const result = checkCatalogue(FLOW, { steps: { hello: { text: 'Hola' } } })
    expect(result.warnings.some((i) => i.code === 'unknown-field')).toBe(true)
    expect(result.warnings.find((i) => i.code === 'unknown-field')?.path).toBe('steps.hello.text')
  })

  it('warns when a translation is identical to the original', () => {
    const result = checkCatalogue(FLOW, { steps: { tip: { title: 'A tip' } } })
    expect(result.warnings.some((i) => i.code === 'translation-unchanged')).toBe(true)
  })

  it('warns about a token the original does not use', () => {
    const result = checkCatalogue(FLOW, { steps: { tip: { title: 'Un consejo, {{firstName}}' } } })
    // Unresolved tokens are left on screen exactly as written, which is the
    // point of `interpolate`'s no-value behaviour — visible, not an empty gap.
    expect(result.warnings.some((i) => i.code === 'token-invented')).toBe(true)
    expect(result.valid).toBe(true)
  })

  it('warns that a chapter label the flow does not have appears in one locale only', () => {
    // Measured at tour.ts:533 — `i18n.stateLabel(state) ?? node.label` — so
    // this DOES apply. `done` simply has no label to fall back to.
    const result = checkCatalogue(FLOW, { states: { done: 'Terminado' } })
    expect(result.warnings.some((i) => i.code === 'state-label-not-in-original')).toBe(true)
    expect(result.valid).toBe(true)
  })

  it('warns about an empty chapter label rather than treating it as absent', () => {
    const result = checkCatalogue(FLOW, { states: { welcome: '   ' } })
    expect(result.warnings.some((i) => i.code === 'empty-override')).toBe(true)
  })

  it('caps the ids it lists, so a fresh catalogue is not a wall of text', () => {
    const wide = {
      id: 'wide',
      initial: 'a',
      states: {
        a: {
          steps: Array.from({ length: 30 }, (_, i) => ({
            id: `s${i}`,
            content: { title: `Step ${i}` },
          })),
          final: true,
        },
      },
    } as unknown as FlowDefinition
    const result = checkCatalogue(wide, { steps: {} })
    expect(result.coverage.total).toBe(30)
    expect(result.coverage.missingSteps).toHaveLength(20)
    const incomplete = result.warnings.find((i) => i.code === 'incomplete-translation')
    expect(incomplete?.message).toContain('30 id(s)')
    expect(incomplete?.message).toMatch(/…$|…\.$/)
  })

  it('counts a partially translated step as missing', () => {
    // `hello` has a title and a body; a catalogue with only the title leaves
    // the body in English, which is exactly what coverage is asked about.
    const result = checkCatalogue(FLOW, { steps: { hello: { title: 'Hola' } } })
    expect(result.coverage.translated).toBe(1)
    expect(result.coverage.missingSteps).toContain('hello')
  })
})

// ── Keys that are not keys ────────────────────────────────────────────────

describe('a catalogue key that names something on Object.prototype', () => {
  // Every one of these resolves to a function through the prototype chain, so
  // an `x in obj` or `obj[key] !== undefined` test grades them as naming a real
  // state. The entry reaches nothing at runtime — which is precisely what
  // `unknown-state` exists to say — so the tool must not call it valid.
  const INHERITED = ['toString', 'valueOf', 'constructor', 'hasOwnProperty', 'isPrototypeOf']

  it('is an unknown-state, not a state', () => {
    for (const key of INHERITED) {
      const result = checkCatalogue(FLOW, { states: { [key]: 'Etiqueta' } })
      expect(codes(result.errors), key).toEqual(['unknown-state'])
      expect(result.valid, key).toBe(false)
    }
  })

  it('is an unknown-step, not a step', () => {
    // Already true because `indexSteps` returns a Map — `get('toString')` is a
    // miss where `object['toString']` is a hit. Pinned so that swapping the Map
    // for a plain object cannot reintroduce the state-side bug on this side.
    for (const key of INHERITED) {
      const result = checkCatalogue(FLOW, { steps: { [key]: { title: 'Hola' } } })
      expect(codes(result.errors), key).toEqual(['unknown-step'])
    }
  })

  it('does not count towards coverage', () => {
    const result = checkCatalogue(FLOW, {
      steps: { toString: { title: 'Hola' } },
      states: { valueOf: 'Etiqueta' },
    })
    expect(result.coverage.translated).toBe(0)
  })

  it('is not read off the prototype of a step entry either', () => {
    // A hand-built object, not JSON: `JSON.parse` defines `__proto__` as an own
    // key, but an in-process caller can hand over a real inherited `title`.
    // `unknown-field` walks `Object.keys`, so an inherited field would be
    // graded as a translation while being invisible to the loop that reports
    // stray keys — two answers from one object.
    const inherited = Object.create({ title: 'Hola' }) as Record<string, unknown>
    const result = checkCatalogue(FLOW, { steps: { tip: inherited } })
    expect(result.errors).toEqual([])
    expect(result.coverage.translated).toBe(0)
    expect(result.coverage.missingSteps).toContain('tip')
  })
})

describe('coverage.translated', () => {
  it('never exceeds coverage.total, whatever the catalogue supplies', () => {
    // FLOW has five translatable strings. This supplies nine values: three
    // fields on a step that has two, a second field on a step that has one, a
    // label for a state that has none, and a key that is no step at all.
    // Counting what was HANDED IN reported 9 — a coverage number of "9 of 5"
    // is worse than none, because its only use is deciding whether to ship.
    const result = checkCatalogue(FLOW, {
      steps: {
        hello: { title: 'Hola', body: 'Cuerpo', html: '<p>Extra</p>' },
        tip: { title: 'Consejo', body: 'Extra' },
        bye: { title: 'Adiós' },
        ghost: { title: 'Nada' },
      },
      states: { welcome: 'Primeros pasos', done: 'Terminado' },
    })
    expect(result.coverage.total).toBe(5)
    // hello.title, hello.body, tip.title, bye.title, states.welcome. The `html`
    // and the two `body` additions are `field-not-in-original` — they add a
    // line in this locale rather than translating one — `ghost` is an
    // unknown-step, and `done` has no label of its own to translate.
    expect(result.coverage.translated).toBe(5)
    expect(result.coverage.translated).toBeLessThanOrEqual(result.coverage.total)
  })

  it('does not count a field the flow does not have', () => {
    const result = checkCatalogue(FLOW, { steps: { bye: { title: 'Adiós', body: 'Extra' } } })
    expect(result.coverage.translated).toBe(1)
    expect(result.warnings.some((i) => i.code === 'field-not-in-original')).toBe(true)
  })

  it('does not count a label for a state that has none', () => {
    // `done` carries no `label`, so it is not one of the flow's translatable
    // strings — `state-label-not-in-original` is the warning that says so.
    const result = checkCatalogue(FLOW, { states: { done: 'Terminado' } })
    expect(result.coverage.translated).toBe(0)
  })

  it('counts an empty override, matching missingSteps', () => {
    // It IS supplied — `empty-override` is the issue that says it should not
    // have been. The two numbers must agree or "3 of 5, none missing" happens.
    const result = checkCatalogue(FLOW, { steps: { tip: { title: '' } } })
    expect(result.coverage.translated).toBe(1)
    expect(result.coverage.missingSteps).not.toContain('tip')
  })
})
