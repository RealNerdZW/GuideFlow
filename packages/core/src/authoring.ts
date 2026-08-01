/**
 * `@guideflow/core/authoring` — the flow validator, and the one converter
 * between the linear draft an editor produces and a real `FlowDefinition`.
 *
 * ```ts
 * import { validateFlow, parseFlowFile, stringifyFlowFile } from '@guideflow/core/authoring'
 *
 * const { valid, errors } = validateFlow(JSON.parse(text))
 * ```
 *
 * **Why this exists.** Runtime validation of a flow was, before this module,
 * exactly one check in the entire library: `flow.initial in flow.states`, in
 * `FlowMachine`'s constructor. Every other way of getting a flow wrong failed
 * silently, and the worst of them failed *as success* — a transition naming a
 * state that does not exist emits one `console.warn`, then `tour:complete`,
 * which marks the flow completed so it never shows the user again. Every rule
 * below is grounded in behaviour measured against the real engine, not read.
 *
 * A separate entry point because a running app never validates a flow — the
 * author does, once, at authoring time or in CI. Nothing here is imported by
 * `src/index.ts`, so `dist/index.js` is unchanged: still 14.96 kB / 15 kB.
 *
 * **On this bundle's own size** (5.29 kB gzip, gated at 5.5 kB). That is large
 * next to `./targeting`'s 2.18 kB, and the difference is rules, not prose —
 * stripping every `message` and `hint` in the file saves 880 B. The hints are
 * the deliverable: they are what turns "this flow is invalid" into something a
 * non-engineer can act on. The gate is therefore set from a measurement rather
 * than from an estimate, and the trade is explicit: authoring-time-only weight,
 * opt-in, never in an app bundle, in exchange for the ~30 rules below.
 *
 * Purely computational except for the three selector rules, which need a
 * `root` and are **skipped**, not failed, without one — so the same function
 * runs in Node for `guideflow validate` and in a browser for a recorder.
 */
import type {
  FlowDefinition,
  GuidanceContext,
  PopoverPlacement,
  StateNode,
  Step,
} from './types/index.js'
import { withFingerprint } from './versioning.js'

// ── Issues ─────────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning'

export type FlowIssueCode =
  // Errors — the engine crashes, refuses to run, or reports success it did not have.
  | 'not-an-object'
  | 'unsupported-envelope'
  | 'missing-id'
  | 'missing-initial'
  | 'no-states'
  | 'initial-not-found'
  | 'flat-steps-shape'
  | 'unknown-transition-target'
  | 'initial-state-has-no-steps'
  | 'duplicate-step-id'
  | 'step-missing-id'
  | 'step-missing-content'
  | 'unreachable-state'
  | 'route-on-step'
  | 'invalid-target-type'
  | 'invalid-selector'
  | 'non-serialisable'
  // Warnings — it runs; it is probably not what you meant.
  | 'no-final-state'
  | 'forward-event-not-next'
  | 'off-default-path'
  | 'next-cycle'
  | 'state-has-no-steps'
  | 'final-state-with-outgoing'
  | 'invalid-placement'
  | 'missing-target'
  | 'fragile-selector'
  | 'selector-not-unique'
  | 'selector-no-match'
  | 'targeting-without-subpath'
  | 'route-without-navigation'
  | 'html-content-without-sanitizer'
  | 'too-many-steps'

export interface FlowIssue {
  /** Stable and machine-readable. Assert on this; `message` may be reworded. */
  code: FlowIssueCode
  severity: Severity
  /** Dotted path, e.g. `states.welcome.steps[1].target`. Empty for flow-level. */
  path: string
  message: string
  /** One imperative sentence naming the fix. Rendered verbatim by the CLI. */
  hint: string
  stateId?: string
  stepId?: string
}

export interface FlowValidation {
  /** True when `errors` is empty. Warnings never set it and never clear it. */
  valid: boolean
  /** Every issue, in document order. */
  issues: FlowIssue[]
  errors: FlowIssue[]
  warnings: FlowIssue[]
  /** The flow, narrowed, when valid. Never a partially repaired flow. */
  flow: FlowDefinition | null
}

export interface ValidateOptions {
  /**
   * Supply a `Document` to enable the three selector rules. Omitted — which is
   * the normal case in Node — they are skipped, never failed.
   */
  root?: ParentNode
}

// ── Draft and file shapes ──────────────────────────────────────────────────

/** The linear shape a step-list editor produces. Deliberately not `Step`. */
export interface LinearStep {
  id: string
  title: string
  body?: string
  /** `null` means a centred modal announcement, which is a supported shape. */
  target?: string | null
  placement?: PopoverPlacement
  padding?: number
  clickThrough?: boolean
}

export interface FlowDraft {
  kind: 'guideflow-draft'
  draftVersion: 1
  id: string
  name: string
  steps: LinearStep[]
  sourceUrl?: string
}

export interface FlowFileMeta {
  generator?: string
  createdAt?: string
  sourceUrl?: string
}

export interface FlowFile {
  /**
   * Envelope version, not a library version.
   *
   * There is deliberately no `$schema` key: we host no schema, and a URL that
   * 404s in every editor that follows it would be a lie inside the artifact
   * this format exists to make honest. `validateFlow` is the schema.
   */
  gfFlowFile: 1
  flow: FlowDefinition
  meta?: FlowFileMeta
}

// ── Validation ─────────────────────────────────────────────────────────────

const PLACEMENTS: readonly string[] = [
  'top',
  'bottom',
  'left',
  'right',
  'top-start',
  'top-end',
  'bottom-start',
  'bottom-end',
  'left-start',
  'left-end',
  'right-start',
  'right-end',
  'center',
]

const MAX_STEPS = 25

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Validate anything that claims to be a flow.
 *
 * Takes `unknown` on purpose: this is the boundary between untrusted JSON and
 * the engine. It never throws, and it **never repairs** — silently fixing a
 * flow is how you ship a tour that is not the one the author drew.
 */
export function validateFlow(input: unknown, options: ValidateOptions = {}): FlowValidation {
  const issues: FlowIssue[] = []
  const add = (
    code: FlowIssueCode,
    severity: Severity,
    path: string,
    message: string,
    hint: string,
    ids?: { stateId?: string; stepId?: string },
  ): void => {
    issues.push({
      code,
      severity,
      path,
      message,
      hint,
      ...(ids?.stateId !== undefined && { stateId: ids.stateId }),
      ...(ids?.stepId !== undefined && { stepId: ids.stepId }),
    })
  }
  const result = (): FlowValidation => {
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')
    return {
      valid: errors.length === 0,
      issues,
      errors,
      warnings,
      flow: errors.length === 0 ? (input as FlowDefinition) : null,
    }
  }

  if (!isPlainObject(input)) {
    add(
      'not-an-object',
      'error',
      '',
      'A flow must be a plain object.',
      'Check the file parsed as JSON and holds an object, not an array or a string.',
    )
    return result()
  }

  if ('gfFlowFile' in input && input['gfFlowFile'] !== 1) {
    add(
      'unsupported-envelope',
      'error',
      'gfFlowFile',
      `Unrecognised flow-file version ${String(input['gfFlowFile'])}.`,
      'Upgrade @guideflow/core, or pass the inner `flow` object directly.',
    )
    return result()
  }

  // The shape the old DevTools export wrote, and the shape the engine rejects.
  if (!('states' in input) && Array.isArray(input['steps'])) {
    add(
      'flat-steps-shape',
      'error',
      'steps',
      'This is a step list, not a flow: it has `steps` at the top level and no `states`.',
      'Convert it with `draftToFlow()` from @guideflow/core/authoring.',
    )
    return result()
  }

  const id = input['id']
  if (typeof id !== 'string' || id.length === 0) {
    add(
      'missing-id',
      'error',
      'id',
      'A flow needs a non-empty string `id`.',
      'Add `id: "my-tour"`. Progress and completion are stored under it.',
    )
  }

  const initial = input['initial']
  if (typeof initial !== 'string' || initial.length === 0) {
    add(
      'missing-initial',
      'error',
      'initial',
      'A flow needs a non-empty string `initial` naming its first state.',
      'Add `initial: "<one of the keys in states>"`.',
    )
  }

  const states = input['states']
  if (!isPlainObject(states) || Object.keys(states).length === 0) {
    add(
      'no-states',
      'error',
      'states',
      'A flow needs a non-empty `states` object.',
      'A flow is a state machine: `{ id, initial, states: { … } }`.',
    )
    return result()
  }

  const stateIds = Object.keys(states)
  if (typeof initial === 'string' && !(initial in states)) {
    add(
      'initial-not-found',
      'error',
      'initial',
      `\`initial\` names "${initial}", which is not a state.`,
      `Use one of: ${stateIds.join(', ')}. FlowMachine throws on this.`,
    )
  }

  // ── Per-state and per-step ───────────────────────────────────────────────

  const seenStepIds = new Map<string, string>()
  let totalSteps = 0
  let anyFinal = false

  for (const stateId of stateIds) {
    const node = states[stateId]
    if (!isPlainObject(node)) continue
    const steps = Array.isArray(node['steps']) ? (node['steps'] as unknown[]) : []
    const on = isPlainObject(node['on']) ? node['on'] : null
    const isFinal = node['final'] === true
    if (isFinal) anyFinal = true
    totalSteps += steps.length

    if (isFinal && on && Object.keys(on).length > 0) {
      add(
        'final-state-with-outgoing',
        'warning',
        `states.${stateId}.on`,
        `State "${stateId}" is marked final but declares transitions.`,
        'Drop `final: true`, or drop the `on` table — they contradict each other.',
        { stateId },
      )
    }

    if (steps.length === 0) {
      if (stateId === initial) {
        add(
          'initial-state-has-no-steps',
          'error',
          `states.${stateId}.steps`,
          `The initial state "${stateId}" has no steps, so the tour starts active and paints nothing.`,
          'Give the initial state at least one step.',
          { stateId },
        )
      } else if (!isFinal) {
        add(
          'state-has-no-steps',
          'warning',
          `states.${stateId}.steps`,
          `State "${stateId}" has no steps.`,
          'Fine as a routing-only or terminal marker state; otherwise add one.',
          { stateId },
        )
      }
    }

    for (const [index, raw] of steps.entries()) {
      const path = `states.${stateId}.steps[${index}]`
      if (!isPlainObject(raw)) {
        add('step-missing-id', 'error', path, 'A step must be an object.', 'Replace it with `{ id, content }`.', {
          stateId,
        })
        continue
      }
      const stepId = raw['id']
      if (typeof stepId !== 'string' || stepId.length === 0) {
        add(
          'step-missing-id',
          'error',
          `${path}.id`,
          'Every step needs a non-empty string `id`.',
          'Navigation, resume and analytics all key on it.',
          { stateId },
        )
      } else {
        const previous = seenStepIds.get(stepId)
        if (previous !== undefined) {
          add(
            'duplicate-step-id',
            'error',
            `${path}.id`,
            `Step id "${stepId}" is already used in state "${previous}".`,
            'Make every step id unique: goTo(), resume and the skip loop all resolve the first match.',
            { stateId, stepId },
          )
        } else {
          seenStepIds.set(stepId, stateId)
        }
      }

      const content = raw['content']
      const hasContent =
        isPlainObject(content) &&
        (typeof content['title'] === 'string' ||
          typeof content['body'] === 'string' ||
          typeof content['html'] === 'string')
      if (!hasContent) {
        add(
          'step-missing-content',
          'error',
          `${path}.content`,
          'A step needs `content` with a title, body or html.',
          'Add `content: { title: "…" }` — the renderer has nothing to paint otherwise.',
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }
      if (isPlainObject(content) && typeof content['html'] === 'string') {
        add(
          'html-content-without-sanitizer',
          'warning',
          `${path}.content.html`,
          '`content.html` is escaped and rendered as text unless a sanitiser is supplied.',
          'Pass `createGuideFlow({ sanitizeHTML })` from @guideflow/core/html.',
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }

      if ('route' in raw) {
        add(
          'route-on-step',
          'error',
          `${path}.route`,
          '`route` belongs on a state, not a step. Nothing reads it here.',
          'Move `route` up to the state that owns this step.',
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }

      const target = raw['target']
      if (target !== undefined && target !== null && typeof target !== 'string') {
        add(
          'invalid-target-type',
          'error',
          `${path}.target`,
          '`target` must be a CSS selector string, or null for a centred modal.',
          'A function or an Element cannot survive being written to a file.',
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }

      const placement = raw['placement']
      if (placement !== undefined && !PLACEMENTS.includes(String(placement))) {
        add(
          'invalid-placement',
          'warning',
          `${path}.placement`,
          `"${String(placement)}" is not a placement; the popover falls back silently.`,
          `Use one of: ${PLACEMENTS.join(', ')}.`,
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }

      if ((target === undefined || target === null) && placement !== 'center') {
        add(
          'missing-target',
          'warning',
          `${path}.target`,
          'No `target`, so this step renders as a centred modal.',
          'Add a target, or set `placement: "center"` to say you meant it.',
          { stateId, ...(typeof stepId === 'string' && { stepId }) },
        )
      }

      if (typeof target === 'string' && target.length > 0) {
        validateSelector(target, `${path}.target`, stateId, typeof stepId === 'string' ? stepId : undefined, options, add)
      }
    }
  }

  // ── Reachability and the NEXT path ───────────────────────────────────────

  const reachable = new Set<string>()
  if (typeof initial === 'string' && initial in states) {
    const queue = [initial]
    while (queue.length > 0) {
      const id2 = queue.shift() as string
      if (reachable.has(id2)) continue
      reachable.add(id2)
      const node = states[id2]
      if (!isPlainObject(node)) continue
      const on = isPlainObject(node['on']) ? node['on'] : null
      if (!on) continue
      for (const event of Object.keys(on)) {
        const targetState = transitionTarget(on[event])
        if (targetState === null) continue
        if (!(targetState in states)) {
          add(
            'unknown-transition-target',
            'error',
            `states.${id2}.on.${event}`,
            `Transition "${event}" points at "${targetState}", which is not a state. ` +
              'The tour stops there AND is recorded as completed, so it never shows again.',
            `Point it at one of: ${stateIds.join(', ')}.`,
            { stateId: id2 },
          )
          continue
        }
        queue.push(targetState)
      }
    }
  }

  for (const stateId of stateIds) {
    if (!reachable.has(stateId)) {
      add(
        'unreachable-state',
        'error',
        `states.${stateId}`,
        `State "${stateId}" cannot be reached from "${String(initial)}".`,
        'Add a transition into it, or delete it — its steps ship but never run.',
        { stateId },
      )
    }
  }

  if (!anyFinal) {
    add(
      'no-final-state',
      'warning',
      'states',
      'No state is marked `final: true`.',
      'The tour still completes when it runs out of steps, but marking the last ' +
        'state final says so explicitly and fixes the step counter.',
    )
  }

  // The NEXT walk, which is what the step counter and the Done button follow.
  if (typeof initial === 'string' && initial in states) {
    const seen = new Set<string>()
    let cursor: string | undefined = initial
    /**
     * Did the walk stop because it revisited a state, or for some other reason?
     *
     * Testing `seen.has(cursor)` after the loop is not enough: a dangling
     * transition adds its unresolvable target to `seen` and then breaks, which
     * read as a cycle and emitted a `next-cycle` warning saying "the tour
     * restarts and never completes" directly underneath the
     * `unknown-transition-target` error saying it completes. Two contradictory
     * diagnoses of one typo.
     */
    let revisited = false
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        revisited = true
        break
      }
      seen.add(cursor)
      const node: unknown = states[cursor]
      if (!isPlainObject(node)) break
      const on = isPlainObject(node['on']) ? node['on'] : null
      const events = on ? Object.keys(on) : []
      const next = on ? transitionTarget(on['NEXT']) : null

      if (next === null && events.length === 1 && node['final'] !== true) {
        add(
          'forward-event-not-next',
          'warning',
          `states.${cursor}.on.${events[0] as string}`,
          `State "${cursor}" moves forward on "${events[0] as string}", not "NEXT", so the ` +
            'step counter stops here and the button reads "Done" early.',
          'Rename the event to NEXT, or accept the counter — send() still works.',
          { stateId: cursor },
        )
      }
      cursor = next ?? undefined
    }
    if (revisited && cursor !== undefined) {
      add(
        'next-cycle',
        'warning',
        `states.${cursor}`,
        `The NEXT path loops back to "${cursor}", so the tour restarts and never completes.`,
        'Break the loop, or give the last state `final: true`.',
        { stateId: cursor },
      )
    }
    for (const stateId of reachable) {
      if (!seen.has(stateId)) {
        const node = states[stateId]
        const stepCount = isPlainObject(node) && Array.isArray(node['steps']) ? node['steps'].length : 0
        if (stepCount > 0) {
          add(
            'off-default-path',
            'warning',
            `states.${stateId}`,
            `State "${stateId}" is reachable only by a non-NEXT event, so its steps are ` +
              'left out of the step count.',
            'Expect the progress indicator to under-report while this branch is showing.',
            { stateId },
          )
        }
      }
    }
  }

  if (totalSteps > MAX_STEPS) {
    add(
      'too-many-steps',
      'warning',
      'states',
      `${totalSteps} steps is a lot for one tour.`,
      'Consider splitting it, or using a checklist for the long tail.',
    )
  }

  if ('targeting' in input && input['targeting'] !== undefined) {
    add(
      'targeting-without-subpath',
      'warning',
      'targeting',
      '`targeting` does nothing on its own — core reads none of it.',
      'Call `createTargeting(gf).install()` from @guideflow/core/targeting.',
    )
  }
  for (const stateId of stateIds) {
    const node = states[stateId]
    if (isPlainObject(node) && node['route'] !== undefined) {
      add(
        'route-without-navigation',
        'warning',
        `states.${stateId}.route`,
        '`route` does nothing without a navigation adapter.',
        'Pass `navigation: createNavigation()` from @guideflow/core/navigation.',
        { stateId },
      )
      break
    }
  }

  return result()
}

/** `on: { NEXT: 'b' }` and `on: { NEXT: { target: 'b' } }` are both legal. */
function transitionTarget(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (isPlainObject(value) && typeof value['target'] === 'string') return value['target']
  return null
}

function validateSelector(
  target: string,
  path: string,
  stateId: string,
  stepId: string | undefined,
  options: ValidateOptions,
  add: (
    code: FlowIssueCode,
    severity: Severity,
    path: string,
    message: string,
    hint: string,
    ids?: { stateId?: string; stepId?: string },
  ) => void,
): void {
  const ids = { stateId, ...(stepId !== undefined && { stepId }) }

  // Pure string analysis, so this rule runs in Node — which is what catches a
  // recorded React `useId` selector in CI, before it reaches a user.
  //
  // The id capture deliberately allows `:` and `\`: React 18's useId produces
  // `:r1:`, which is exactly the case worth catching, and a selector written by
  // hand may escape those colons or may not.
  const idMatch = /^#([^\s>+~,[\]]+)$/.exec(target)
  if (idMatch && !looksStable((idMatch[1] as string).replace(/\\/g, ''))) {
    add(
      'fragile-selector',
      'warning',
      path,
      `"${target}" looks like a framework-generated id, which changes on the next render.`,
      'Add a `data-testid` to the element and target that instead.',
      ids,
    )
  }

  const root = options.root
  if (!root) return
  let matches: ArrayLike<Element>
  try {
    matches = root.querySelectorAll(target)
  } catch {
    add(
      'invalid-selector',
      'error',
      path,
      `"${target}" is not a valid CSS selector.`,
      'Fix the selector; the step can never resolve.',
      ids,
    )
    return
  }
  if (matches.length === 0) {
    add(
      'selector-no-match',
      'warning',
      path,
      `"${target}" matches nothing on this page.`,
      'Check the selector, or the page — the step will wait, then render unanchored.',
      ids,
    )
  } else if (matches.length > 1) {
    add(
      'selector-not-unique',
      'warning',
      path,
      `"${target}" matches ${matches.length} elements; the tour highlights the first.`,
      'Make it specific enough to match exactly one element.',
      ids,
    )
  }
}

/**
 * The string half of `isStableId`, duplicated deliberately.
 *
 * Importing `@guideflow/core/selector` as a *value* would inline that whole
 * bundle into this one — `splitting: false` — and the two subpaths must stay
 * independently size-gated.
 */
function looksStable(id: string): boolean {
  if (!id || id.length > 64) return false
  if (/^\\?:.+\\?:$/.test(id)) return false
  if (/^«.+»$/.test(id)) return false
  if (/(^|[-_:])(radix|headlessui|mui|mantine|chakra|reach|downshift|rc|ember|aria)[-_:]/i.test(id))
    return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return false
  if (/^[0-9a-f]{8,}$/i.test(id)) return false
  if (/^[A-Za-z0-9_-]{20,}$/.test(id)) return false
  if (/\d{4,}/.test(id)) return false
  return true
}

// ── Draft ⇄ flow ───────────────────────────────────────────────────────────

/**
 * Convert a linear draft into a real `FlowDefinition`.
 *
 * One state per step, chained on `NEXT`, with `final: true` on the last. This
 * is the shape the DevTools "Run" button already built inline and correctly —
 * the only correct converter that existed — promoted so that the thing you
 * preview and the thing you export can no longer disagree.
 *
 * Throws on an empty draft or a duplicate step id rather than emitting a flow
 * whose `goTo()` and resume would silently resolve to the wrong step.
 */
export function draftToFlow<TContext extends GuidanceContext = GuidanceContext>(
  draft: FlowDraft,
): FlowDefinition<TContext> {
  if (!draft || !Array.isArray(draft.steps) || draft.steps.length === 0) {
    throw new RangeError('draftToFlow: a draft needs at least one step.')
  }
  const seen = new Set<string>()
  for (const step of draft.steps) {
    if (seen.has(step.id)) {
      throw new RangeError(
        `draftToFlow: duplicate step id "${step.id}". Step ids must be unique — ` +
          'goTo(), resume and the skip loop all resolve the first match.',
      )
    }
    seen.add(step.id)
  }

  const states: Record<string, StateNode<TContext>> = {}
  draft.steps.forEach((step, i) => {
    const isLast = i === draft.steps.length - 1
    const built: Step<TContext> = {
      id: step.id,
      content: {
        title: step.title,
        ...(step.body !== undefined && { body: step.body }),
      },
      ...(step.target !== undefined && { target: step.target }),
      ...(step.placement !== undefined && { placement: step.placement }),
      ...(step.padding !== undefined && { padding: step.padding }),
      ...(step.clickThrough !== undefined && { clickThrough: step.clickThrough }),
    }
    states[`s${i}`] = {
      steps: [built],
      // No `on` key at all on the last state — an empty `on: {}` reads as a
      // contradiction next to `final: true`.
      ...(isLast ? { final: true } : { on: { NEXT: `s${i + 1}` } }),
    }
  })

  return { id: draft.id, initial: 's0', states }
}

/**
 * Flatten a linear flow back into a draft an editor can open.
 *
 * Partial by design: returns `null` for anything the linear model cannot hold,
 * rather than silently dropping a branch. `lossy` explains what stopped it.
 */
export function flowToDraft(flow: FlowDefinition): { draft: FlowDraft | null; lossy: FlowIssue[] } {
  const lossy: FlowIssue[] = []
  const refuse = (reason: string, hint: string, path = ''): { draft: null; lossy: FlowIssue[] } => {
    lossy.push({ code: 'not-an-object', severity: 'error', path, message: reason, hint })
    return { draft: null, lossy }
  }

  if (!isPlainObject(flow) || !isPlainObject(flow.states)) {
    return refuse('Not a flow.', 'Pass a FlowDefinition.')
  }

  const steps: LinearStep[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = flow.initial

  while (cursor !== undefined) {
    if (seen.has(cursor)) {
      return refuse(
        `The NEXT path loops back to "${cursor}".`,
        'A linear editor cannot represent a cycle.',
        `states.${cursor}`,
      )
    }
    seen.add(cursor)
    const node: StateNode | undefined = flow.states[cursor]
    if (!node) break

    if (node.onEntry !== undefined || node.onExit !== undefined) {
      return refuse(
        `State "${cursor}" has onEntry/onExit hooks.`,
        'Those are functions; an editor would drop them. Edit this flow in code.',
        `states.${cursor}`,
      )
    }
    if (node.route !== undefined) {
      return refuse(
        `State "${cursor}" carries a route.`,
        'Multi-route flows are not linear. Edit this flow in code.',
        `states.${cursor}`,
      )
    }
    const events = node.on ? Object.keys(node.on) : []
    if (events.length > 1) {
      return refuse(
        `State "${cursor}" branches on ${events.join(', ')}.`,
        'A step list cannot represent a branch. Edit this flow in code.',
        `states.${cursor}.on`,
      )
    }
    if (events.length === 1 && events[0] !== 'NEXT') {
      return refuse(
        `State "${cursor}" moves forward on "${events[0] as string}", not NEXT.`,
        'A step list only understands NEXT. Edit this flow in code.',
        `states.${cursor}.on`,
      )
    }

    for (const step of node.steps ?? []) {
      if (
        typeof step.target === 'function' ||
        typeof step.showIf === 'function' ||
        typeof step.content === 'function'
      ) {
        return refuse(
          `Step "${step.id}" uses a function for content, target or showIf.`,
          'Functions cannot be written to a file. Edit this flow in code.',
          `states.${cursor}.steps`,
        )
      }
      const content = step.content
      steps.push({
        id: step.id,
        title: content?.title ?? step.id,
        ...(content?.body !== undefined && { body: content.body }),
        ...(step.target !== undefined && { target: step.target as string | null }),
        ...(step.placement !== undefined && { placement: step.placement }),
        ...(step.padding !== undefined && { padding: step.padding }),
        ...(step.clickThrough !== undefined && { clickThrough: step.clickThrough }),
      })
    }

    const nextRef: string | { target?: string } | undefined = node.on?.['NEXT']
    cursor = typeof nextRef === 'string' ? nextRef : nextRef?.target
  }

  if (steps.length === 0) return refuse('The flow has no steps on its NEXT path.', 'Nothing to edit.')

  return {
    draft: { kind: 'guideflow-draft', draftVersion: 1, id: flow.id, name: flow.id, steps },
    lossy,
  }
}

/** The sentence a UI renders when `flowToDraft` refuses. */
export function explainNotLinear(flow: FlowDefinition): string | null {
  const { draft, lossy } = flowToDraft(flow)
  if (draft) return null
  return lossy[0]?.message ?? 'This flow cannot be opened in a step-list editor.'
}

// ── The one writer and the one reader ──────────────────────────────────────

/**
 * Serialise a flow to the `.flow.json` format.
 *
 * The **only** writer. Stamps `version` from the flow's own structure unless
 * one is already set, so a returning user's resume point is invalidated when
 * the shape changes and not when a typo is fixed.
 *
 * Throws when the flow contains anything JSON cannot hold — a function
 * `showIf`, a `RegExp`, a `Date`. Refusing is the point: a file that silently
 * dropped a `showIf` would mean something different from the flow it came from.
 */
export function stringifyFlowFile(flow: FlowDefinition, meta?: FlowFileMeta): string {
  const offending = findNonSerialisable(flow, 'flow')
  if (offending) {
    throw new TypeError(
      `stringifyFlowFile: ${offending} cannot be written to a file. ` +
        'Remove it, or keep this flow in code.',
    )
  }
  const file: FlowFile = {
    gfFlowFile: 1,
    flow: flow.version === undefined ? withFingerprint(flow) : flow,
    ...(meta !== undefined && { meta }),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Parse and validate a `.flow.json`.
 *
 * The **only** reader. Tolerant about what it accepts — the envelope, a bare
 * `FlowDefinition`, or a legacy draft — and strict about what it returns.
 * Never throws.
 */
export function parseFlowFile(
  input: unknown,
): FlowValidation & { meta: FlowFileMeta | null } {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch (error) {
      return fatal(
        'not-an-object',
        '',
        `The file is not valid JSON: ${(error as Error).message}`,
        'Check for a trailing comma or an unquoted key.',
      )
    }
  }

  let meta: FlowFileMeta | null = null
  let flowish: unknown = parsed

  if (isPlainObject(parsed) && 'gfFlowFile' in parsed) {
    meta = isPlainObject(parsed['meta']) ? (parsed['meta'] as FlowFileMeta) : null
    flowish = parsed['flow']
  } else if (isPlainObject(parsed) && parsed['kind'] === 'guideflow-draft') {
    // A saved editing session. Convert it so the caller gets a real flow.
    try {
      flowish = draftToFlow(parsed as unknown as FlowDraft)
    } catch (error) {
      return fatal(
        'flat-steps-shape',
        'steps',
        (error as Error).message,
        'Fix the draft in the editor that produced it.',
      )
    }
  }

  const validation = validateFlow(flowish)
  return { ...validation, meta }
}

/**
 * A single-issue failure, with `errors` populated.
 *
 * Hand-building this shape twice is how `errors` came to be `[]` on the
 * unparseable-JSON path — which made `guideflow validate` exit 0 on a file that
 * was not JSON at all. One constructor, so the two cannot drift.
 */
function fatal(
  code: FlowIssueCode,
  path: string,
  message: string,
  hint: string,
): FlowValidation & { meta: FlowFileMeta | null } {
  const issue: FlowIssue = { code, severity: 'error', path, message, hint }
  return { valid: false, issues: [issue], errors: [issue], warnings: [], flow: null, meta: null }
}

/** Depth-first search for a value JSON would drop or mangle. */
function findNonSerialisable(value: unknown, path: string, depth = 0): string | null {
  if (depth > 12) return null
  if (typeof value === 'function') return `${path} is a function`
  if (typeof value === 'symbol') return `${path} is a symbol`
  if (value instanceof RegExp) return `${path} is a RegExp`
  if (value instanceof Date) return `${path} is a Date`
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const hit = findNonSerialisable(item, `${path}[${i}]`, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      const hit = findNonSerialisable(item, `${path}.${key}`, depth + 1)
      if (hit) return hit
    }
  }
  return null
}
