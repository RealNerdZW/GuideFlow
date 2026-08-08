// ---------------------------------------------------------------------------
// Translation catalogues — pulling the strings out, and checking a filled one.
//
// A `ContentCatalogue` (core's `i18n/index.ts`) sits BESIDE the flow rather
// than inside `StepContent`. Translators want a flat file of strings, not a
// state machine; the shape is diffable and reviewable in a pull request; and an
// untranslated key falls through to the flow's own copy, so a partial
// translation degrades one string at a time instead of failing.
//
// Nothing here translates anything, and nothing here calls a model. ADR-019:
// **the client is the model.** This file is the mechanical half a model should
// not have to do by eye — which strings exist, which key belongs to which id,
// and whether what came back will still run.
//
// The check that pays for the whole file is `token-lost`. The content pipeline
// is
//
//     the step's own content → locale catalogue → {{token}} → renderer
//
// (`TourEngine._resolveContent`), catalogue first *so that* a translated string
// containing `{{firstName}}` still resolves. The corollary is the failure: a
// translation that dropped the token renders a sentence with the
// personalisation quietly missing. Nothing throws, nothing logs, no host test
// sees it, and it is only ever noticed in the locale nobody on the team reads.
//
// `steps` and `states` are separate maps because step ids and state ids are
// separate namespaces — a state called `welcome` can coexist with a step called
// `welcome`, and one flat map would silently collide.
// ---------------------------------------------------------------------------

import type { FlowDefinition, StepContent } from '@guideflow/core'
import type { Severity } from '@guideflow/core/authoring'

// ── Types ─────────────────────────────────────────────────────────────────

export type CatalogueIssueCode =
  // Errors — the entry reaches nothing, or breaks what it does reach.
  | 'not-an-object'
  | 'not-a-string'
  | 'unknown-step'
  | 'unknown-state'
  | 'token-lost'
  // Warnings — it applies; it is probably not what you meant.
  | 'empty-override'
  | 'field-not-in-original'
  | 'unknown-field'
  | 'token-invented'
  | 'token-in-html'
  | 'translation-unchanged'
  | 'state-label-not-in-original'
  | 'incomplete-translation'

/** Deliberately the same shape as `FlowIssue`, so a client renders both alike. */
export interface CatalogueIssue {
  /** Stable and machine-readable. Assert on this; `message` may be reworded. */
  code: CatalogueIssueCode
  severity: Severity
  /** Dotted path into the CATALOGUE, e.g. `steps.welcome.title`. */
  path: string
  message: string
  /** One imperative sentence naming the fix. */
  hint: string
}

/** The three translatable fields of `StepContent`, in `ContentCatalogue` order. */
export type ContentField = 'title' | 'body' | 'html'

export interface CatalogueSkeleton {
  steps: Record<string, { title?: string; body?: string; html?: string }>
  states: Record<string, string>
}

export interface ExtractResult {
  catalogue: CatalogueSkeleton
  /** Translatable strings found: step fields plus state labels. */
  stringCount: number
  /**
   * Catalogue path → the token names that must survive translation.
   *
   * Only paths that carry a token appear. Names, not raw text: `{{plan|your
   * plan}}` has a *translatable* fallback, so comparing the written form would
   * flag a correct translation.
   */
  tokens: Record<string, string[]>
  issues: CatalogueIssue[]
}

export interface CheckResult {
  /** True when there are no errors. Warnings never set it and never clear it. */
  valid: boolean
  issues: CatalogueIssue[]
  errors: CatalogueIssue[]
  warnings: CatalogueIssue[]
  coverage: {
    /** Translatable strings in the flow. */
    total: number
    /** Of those, how many the catalogue supplies. */
    translated: number
    /** Step ids in the flow with no catalogue entry, capped for readability. */
    missingSteps: string[]
    /** Labelled states with no catalogue entry. */
    missingStates: string[]
  }
}

// ── Tokens ────────────────────────────────────────────────────────────────

/**
 * A copy of `packages/core/src/utils/interpolate.ts`'s `TOKEN`.
 *
 * `interpolate` is internal to core and not exported from any subpath, and this
 * package must not grow a reason to export it — the check has to agree with
 * what the ENGINE substitutes, not with a looser guess, or `token-lost` reports
 * a loss the runtime would not have suffered (or worse, misses a real one).
 * `catalogue-drift.test.ts` compares the two literals so the copy cannot rot.
 */
const TOKEN = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g

/** The token NAMES in a string, deduplicated and sorted. */
export function tokensIn(str: string): string[] {
  const names = new Set<string>()
  for (const match of str.matchAll(TOKEN)) {
    const name = match[1]
    if (name !== undefined) names.add(name)
  }
  return [...names].sort()
}

// ── Reading the flow ──────────────────────────────────────────────────────

interface StepEntry {
  stateId: string
  content: StepContent
}

/**
 * Every step in the flow, keyed by id — from EVERY state, not just the ones on
 * the NEXT path.
 *
 * Deliberately unlike `countSteps` in `flows.ts`. That answers "how many steps
 * does the user see", which is a walk; this answers "what strings are in this
 * file", and a state reachable only by a custom transition still has copy in it
 * that a translator has to be given.
 *
 * A duplicate step id keeps the FIRST occurrence and says nothing, because
 * nothing here can reach a flow that has one: `resolveFlowSource` refuses any
 * flow `validateFlow` rejected, and `duplicate-step-id` is an ERROR there
 * (`packages/core/src/authoring.ts:370`). A second, weaker warning in this file
 * would only ever be read as a guarantee these tools do not offer.
 *
 * A `Map` rather than an object, deliberately: `steps.get('toString')` is a
 * miss, `object['toString']` is a hit on `Object.prototype` — and every key on
 * the lookup side of this map is user-supplied catalogue text.
 */
function indexSteps(flow: FlowDefinition): Map<string, StepEntry> {
  const steps = new Map<string, StepEntry>()
  for (const [stateId, state] of Object.entries(flow.states)) {
    for (const step of state?.steps ?? []) {
      // A function content form cannot arrive here: every path into these tools
      // is JSON, over MCP or off disk. Guarded rather than cast, because the
      // alternative is a crash on a hand-written object.
      const content = typeof step.content === 'object' && step.content !== null ? step.content : null
      if (content === null) continue
      if (!steps.has(step.id)) steps.set(step.id, { stateId, content })
    }
  }
  return steps
}

/**
 * Does this object carry the key ITSELF, rather than inheriting it?
 *
 * `Object.prototype.hasOwnProperty.call` and not `Object.hasOwn`, which is
 * ES2022 while `tsconfig.base.json` targets ES2020 — a lib bump for one package
 * is a bigger change than this line is worth. Not `record.hasOwnProperty(key)`
 * either: the input is user data, so its own `hasOwnProperty` may be anything.
 */
function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/**
 * An OWN property, or `undefined`.
 *
 * Every key that reaches this function came from a catalogue or a flow file, so
 * a plain `record[key]` reads through `Object.prototype`: a catalogue keyed
 * `toString`, `valueOf`, `constructor`, `hasOwnProperty` or `isPrototypeOf`
 * resolves to a function instead of missing, and the entry that reaches nothing
 * at runtime is reported as reaching something.
 */
function own(record: object, key: string): unknown {
  return hasOwn(record, key) ? (record as Record<string, unknown>)[key] : undefined
}

function issue(
  code: CatalogueIssueCode,
  severity: Severity,
  path: string,
  message: string,
  hint: string,
): CatalogueIssue {
  return { code, severity, path, message, hint }
}

// ── Public API ────────────────────────────────────────────────────────────

const FIELDS: readonly ContentField[] = ['title', 'body', 'html']

/**
 * Only `title` and `body` are interpolated.
 *
 * `_resolveContent` runs `interpolate` over those two and NOT over `html` —
 * untrusted token values must not shape an attribute context before the
 * sanitiser parses it (ADR-022). So a `{{token}}` written into `html` is not a
 * translation risk, it is inert copy, and it is reported as such.
 */
const INTERPOLATED: readonly ContentField[] = ['title', 'body']

/**
 * The catalogue skeleton for a flow: every translatable string, keyed by id.
 *
 * Values are the **original** copy rather than empty strings, so the result is
 * translated in place and a reviewer can diff source against translation in one
 * file. An untouched entry is therefore indistinguishable from an intentional
 * one — which is why `checkCatalogue` reports `translation-unchanged` rather
 * than assuming either way.
 */
export function extractStrings(flow: FlowDefinition): ExtractResult {
  const steps = indexSteps(flow)
  const catalogue: CatalogueSkeleton = { steps: {}, states: {} }
  const tokens: Record<string, string[]> = {}
  const issues: CatalogueIssue[] = []
  let stringCount = 0

  for (const [stepId, entry] of steps) {
    const fields: { title?: string; body?: string; html?: string } = {}
    for (const field of FIELDS) {
      const value = entry.content[field]
      if (typeof value !== 'string' || value === '') continue
      fields[field] = value
      stringCount += 1
      const found = tokensIn(value)
      if (found.length === 0) continue
      tokens[`steps.${stepId}.${field}`] = found
      if (field === 'html') {
        issues.push(
          issue(
            'token-in-html',
            'warning',
            `steps.${stepId}.html`,
            `\`content.html\` on step "${stepId}" contains ${found.map((t) => `{{${t}}}`).join(', ')}, which the engine never substitutes — only \`title\` and \`body\` are interpolated.`,
            'Move the personalised sentence into `body`, or drop the token: it renders to the user literally as written.',
          ),
        )
      }
    }
    if (Object.keys(fields).length > 0) catalogue.steps[stepId] = fields
  }

  for (const [stateId, state] of Object.entries(flow.states)) {
    const label = state?.label
    if (typeof label !== 'string' || label === '') continue
    catalogue.states[stateId] = label
    stringCount += 1
  }

  return { catalogue, stringCount, tokens, issues }
}

/**
 * Check a filled catalogue against the flow it is for.
 *
 * Everything reported here is silent at runtime. A key that resolves to no step
 * simply never matches; a lost token renders a gap; an empty string blanks the
 * copy it was meant to translate — `registerContent` merges whatever it is
 * given, and the engine has no way to know a translation is wrong.
 */
export function checkCatalogue(flow: FlowDefinition, input: unknown): CheckResult {
  const issues: CatalogueIssue[] = []

  // Filled in at the end. A catalogue that fails its shape check never gets
  // there, and reports zero coverage rather than a number computed from a
  // structure we have already said we do not understand.
  let coverage: CheckResult['coverage'] = {
    total: 0,
    translated: 0,
    missingSteps: [],
    missingStates: [],
  }

  const done = (): CheckResult => {
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')
    return { valid: errors.length === 0, issues, errors, warnings, coverage }
  }

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    issues.push(
      issue(
        'not-an-object',
        'error',
        '',
        'The catalogue is not an object.',
        'Pass `{ steps: { <stepId>: { title, body, html } }, states: { <stateId>: label } }` — run guideflow_extract_strings for the exact keys.',
      ),
    )
    return done()
  }

  const record = input as Record<string, unknown>
  const rawSteps = record['steps']
  const rawStates = record['states']
  const flowSteps = indexSteps(flow)

  const catalogueSteps = asRecord(rawSteps, 'steps', issues)
  const catalogueStates = asRecord(rawStates, 'states', issues)

  for (const [stepId, raw] of Object.entries(catalogueSteps)) {
    const original = flowSteps.get(stepId)
    if (original === undefined) {
      issues.push(
        issue(
          'unknown-step',
          'error',
          `steps.${stepId}`,
          `No step in flow "${flow.id}" has the id "${stepId}", so this entry is never read.`,
          'Correct the key to a step id that exists, or delete it — run guideflow_extract_strings to get the exact ids.',
        ),
      )
      continue
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      issues.push(
        issue(
          'not-an-object',
          'error',
          `steps.${stepId}`,
          `The entry for step "${stepId}" is not an object.`,
          'Use `{ title?: string, body?: string, html?: string }`; a bare string is not a step override.',
        ),
      )
      continue
    }
    checkStep(stepId, raw as Record<string, unknown>, original.content, issues)
  }

  for (const [stateId, raw] of Object.entries(catalogueStates)) {
    // `own`, not `flow.states[stateId]`: a catalogue keyed `toString` would
    // otherwise resolve to `Object.prototype.toString` and be graded as naming
    // a real state — the one grading that matters here, since a key reaching
    // nothing is exactly what `unknown-state` exists to report.
    const state = hasOwn(flow.states, stateId) ? flow.states[stateId] : undefined
    if (state === undefined) {
      issues.push(
        issue(
          'unknown-state',
          'error',
          `states.${stateId}`,
          `Flow "${flow.id}" has no state "${stateId}", so this chapter label is never shown.`,
          'Correct the key to a state id. Step ids and state ids are separate namespaces — a step called "welcome" is not the state "welcome".',
        ),
      )
      continue
    }
    if (typeof raw !== 'string') {
      issues.push(
        issue(
          'not-a-string',
          'error',
          `states.${stateId}`,
          `The chapter label for state "${stateId}" is not a string.`,
          'A state entry is the label itself, not an object: `states: { setup: "Configuración" }`.',
        ),
      )
      continue
    }
    if (raw.trim() === '') {
      issues.push(
        issue(
          'empty-override',
          'warning',
          `states.${stateId}`,
          `The chapter label for state "${stateId}" is empty.`,
          'Delete the key. An empty value blanks the chapter; an absent one falls through to the state’s own label.',
        ),
      )
    } else if (typeof state.label !== 'string' || state.label === '') {
      // Measured at `tour.ts:533`: the label is `i18n.stateLabel(state) ??
      // node.label`, so this entry DOES apply — and only in this locale. The
      // flow's own readers get no chapter at all.
      issues.push(
        issue(
          'state-label-not-in-original',
          'warning',
          `states.${stateId}`,
          `State "${stateId}" has no \`label\`, so this chapter name appears in this locale only.`,
          'Add `label` to the state in the flow file, so every locale has a chapter name to fall back to.',
        ),
      )
    }
  }

  // Coverage. Reported as numbers plus one issue, not one issue per missing
  // string: a half-finished translation is a normal state to be in, and a wall
  // of warnings would bury the errors that are not.
  const extracted = extractStrings(flow)
  const missingSteps: string[] = []
  for (const [stepId, fields] of Object.entries(extracted.catalogue.steps)) {
    const filled = own(catalogueSteps, stepId)
    if (filled === null || typeof filled !== 'object') {
      missingSteps.push(stepId)
      continue
    }
    const partial = Object.keys(fields).some((f) => typeof own(filled, f) !== 'string')
    if (partial) missingSteps.push(stepId)
  }
  const missingStates = Object.keys(extracted.catalogue.states).filter(
    (stateId) => typeof own(catalogueStates, stateId) !== 'string',
  )
  const translated = countTranslated(extracted.catalogue, catalogueSteps, catalogueStates)
  coverage = {
    total: extracted.stringCount,
    translated,
    missingSteps: missingSteps.slice(0, 20),
    missingStates: missingStates.slice(0, 20),
  }

  if (missingSteps.length > 0 || missingStates.length > 0) {
    const names = [...missingSteps, ...missingStates].slice(0, 10).join(', ')
    issues.push(
      issue(
        'incomplete-translation',
        'warning',
        '',
        `${missingSteps.length + missingStates.length} id(s) in the flow have no complete catalogue entry: ${names}${missingSteps.length + missingStates.length > 10 ? ', …' : ''}.`,
        'Translate the remaining ids, or ship as is — an untranslated key falls through to the flow’s own copy rather than failing.',
      ),
    )
  }

  return done()
}

// ── Internals ─────────────────────────────────────────────────────────────

function asRecord(
  value: unknown,
  key: 'steps' | 'states',
  issues: CatalogueIssue[],
): Record<string, unknown> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(
      issue(
        'not-an-object',
        'error',
        key,
        `\`${key}\` is not an object.`,
        `Use a map keyed by ${key === 'steps' ? 'step' : 'state'} id, or omit \`${key}\` entirely.`,
      ),
    )
    return {}
  }
  return value as Record<string, unknown>
}

/**
 * How many of the FLOW's translatable strings the catalogue supplies.
 *
 * Driven by the skeleton, never by the supplied maps. Counting what was handed
 * in counts an `unknown-step` key, a `field-not-in-original` addition and a
 * `states` entry for a state with no label — all three of which translate
 * nothing at runtime — so `translated` could exceed `total` and a coverage
 * number reported as "4 of 3" is worse than no number at all.
 *
 * An empty string still counts, matching `missingSteps` above: it IS supplied,
 * and `empty-override` is the issue that says it should not have been.
 */
function countTranslated(
  skeleton: CatalogueSkeleton,
  steps: Record<string, unknown>,
  states: Record<string, unknown>,
): number {
  let count = 0
  for (const [stepId, fields] of Object.entries(skeleton.steps)) {
    const entry = own(steps, stepId)
    if (entry === null || typeof entry !== 'object') continue
    for (const field of FIELDS) {
      if (fields[field] === undefined) continue
      if (typeof own(entry, field) === 'string') count += 1
    }
  }
  for (const stateId of Object.keys(skeleton.states)) {
    if (typeof own(states, stateId) === 'string') count += 1
  }
  return count
}

function checkStep(
  stepId: string,
  entry: Record<string, unknown>,
  original: StepContent,
  issues: CatalogueIssue[],
): void {
  for (const key of Object.keys(entry)) {
    if ((FIELDS as readonly string[]).includes(key)) continue
    issues.push(
      issue(
        'unknown-field',
        'warning',
        `steps.${stepId}.${key}`,
        `\`${key}\` is not a ContentCatalogue field, so it is dropped on merge and translates nothing.`,
        'Use `title`, `body` or `html`. Anything else is ignored in silence.',
      ),
    )
  }

  for (const field of FIELDS) {
    // `own` so this agrees with the `unknown-field` loop above, which walks
    // `Object.keys`. An inherited `title` would otherwise be graded as a
    // translation while being invisible to the loop that names stray keys.
    const value = own(entry, field)
    if (value === undefined) continue
    const path = `steps.${stepId}.${field}`

    if (typeof value !== 'string') {
      issues.push(
        issue(
          'not-a-string',
          'error',
          path,
          `\`${field}\` on step "${stepId}" is not a string.`,
          'Give the translated text as a string, or omit the field to keep the original.',
        ),
      )
      continue
    }

    if (value.trim() === '') {
      // `{ ...content, ...override }` — an empty string is a value, so this
      // does not fall through, it blanks the copy.
      issues.push(
        issue(
          'empty-override',
          'warning',
          path,
          `\`${field}\` on step "${stepId}" is empty, which blanks the ${field} rather than falling through to the original.`,
          'Delete the key. An absent key keeps the flow’s own copy; an empty one replaces it with nothing.',
        ),
      )
      continue
    }

    const source = original[field]
    if (typeof source !== 'string' || source === '') {
      issues.push(
        issue(
          'field-not-in-original',
          'warning',
          path,
          `Step "${stepId}" has no \`${field}\` of its own, so this ADDS one in this locale only.`,
          field === 'html'
            ? 'Add the field to the flow file too, or move the copy to `body`: `html` needs the opt-in sanitiser and is escaped to text without it.'
            : 'Add the field to the flow file too, so the untranslated locale is not missing a line.',
        ),
      )
      continue
    }

    if (value === source) {
      issues.push(
        issue(
          'translation-unchanged',
          'warning',
          path,
          `\`${field}\` on step "${stepId}" is identical to the original.`,
          'Translate it, or delete the key — an absent key falls through to the same string with no catalogue to maintain.',
        ),
      )
    }

    if (!(INTERPOLATED as readonly string[]).includes(field)) {
      const invented = tokensIn(value)
      if (invented.length > 0) {
        issues.push(
          issue(
            'token-in-html',
            'warning',
            path,
            `\`html\` on step "${stepId}" contains ${invented.map((t) => `{{${t}}}`).join(', ')}, which the engine never substitutes.`,
            'Move the personalised sentence into `body`: only `title` and `body` are interpolated, deliberately (ADR-022).',
          ),
        )
      }
      continue
    }

    const before = tokensIn(source)
    const after = tokensIn(value)
    const lost = before.filter((t) => !after.includes(t))
    const added = after.filter((t) => !before.includes(t))

    if (lost.length > 0) {
      issues.push(
        issue(
          'token-lost',
          'error',
          path,
          `The translation of \`${field}\` on step "${stepId}" dropped ${lost.map((t) => `{{${t}}}`).join(', ')}, so the personalisation silently disappears in this locale.`,
          `Put ${lost.map((t) => `{{${t}}}`).join(', ')} back into the translated sentence — the catalogue is applied before interpolation, so a token survives translation wherever you place it.`,
        ),
      )
    }
    if (added.length > 0) {
      issues.push(
        issue(
          'token-invented',
          'warning',
          path,
          `The translation of \`${field}\` on step "${stepId}" introduced ${added.map((t) => `{{${t}}}`).join(', ')}, which the original does not use.`,
          'Remove it, or add the value to the flow context — an unresolved token is left on screen exactly as written.',
        ),
      )
    }
  }
}
