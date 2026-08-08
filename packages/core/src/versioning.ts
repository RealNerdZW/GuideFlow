/**
 * `@guideflow/core/versioning` — derive a `FlowDefinition.version` from the
 * flow's own shape, so you do not have to remember to bump one.
 *
 * ```ts
 * import { withFingerprint } from '@guideflow/core/versioning'
 *
 * const flow = withFingerprint({ id: 'onboarding', initial: 'a', states: { … } })
 * ```
 *
 * A separate entry point because it is build-time-ish work that most flows do
 * not need — a hand-written `version: 'v2'` is perfectly good, and core is
 * size-gated.
 *
 * Purely computational: no `document`, no `window`, no `isBrowser()` guard
 * needed anywhere in this file.
 */
import type { FlowDefinition, GuidanceContext, StateNode } from './types/index.js'

/**
 * A short, stable hash of a flow's *structure*.
 *
 * **Hashes** — anything that changes what a persisted `{ state, stepId }`
 * coordinate means:
 *   - `initial`
 *   - state names, sorted (reordering the object literal is not a change)
 *   - each state's `final` flag
 *   - step ids, in order
 *   - each state's transition table, events sorted
 *
 * **Ignores** — everything cosmetic, so fixing a typo does not restart every
 * user's tour: content, target, placement, padding, clickThrough,
 * scrollIntoView, media, actions, meta, showIf, route, waitForTarget,
 * onEntry/onExit, the flow's `context`, `persistDismissal`, `targeting`, and
 * the flow id itself.
 *
 * Not cryptographic, and it does not need to be. A collision is a false
 * negative: the stale snapshot survives this gate and is then caught by
 * `FlowMachine.restore`'s structural checks, which verify the step id still
 * exists. Two independent gates, and the cheap one runs first.
 */
export function flowFingerprint<TContext = GuidanceContext>(
  flow: Pick<FlowDefinition<TContext>, 'initial' | 'states'>,
): string {
  const parts: string[] = [`i:${flow.initial}`]

  for (const name of Object.keys(flow.states).sort()) {
    const node: StateNode<TContext> | undefined = flow.states[name]
    if (!node) continue

    parts.push(`s:${name}`)
    if (node.final === true) parts.push('f')

    const steps = node.steps ?? []
    // Step ids in ORDER — reordering two steps is exactly the change that makes
    // a stored index point somewhere else.
    for (const step of steps) parts.push(`p:${step.id}`)

    const on = node.on
    if (on) {
      for (const event of Object.keys(on).sort()) {
        const transition = on[event]
        const target = typeof transition === 'string' ? transition : transition?.target ?? ''
        parts.push(`t:${event}>${target}`)
      }
    }
  }

  return hash(parts.join('|'))
}

/**
 * `flow` with `version` set to its fingerprint, unless it already declares one.
 *
 * Idempotent, and never overwrites an explicit `version` — a hand-set marker is
 * a deliberate statement about compatibility, and a derived one cannot know
 * better.
 */
export function withFingerprint<TContext = GuidanceContext>(
  flow: FlowDefinition<TContext>,
): FlowDefinition<TContext> {
  if (flow.version !== undefined) return flow
  return { ...flow, version: flowFingerprint(flow) }
}

/**
 * djb2-xor via `Math.imul`, base36.
 *
 * `Math.imul` keeps the multiply in 32-bit integer space; `h * 33` would go
 * through a double and lose the low bits on long inputs. `>>> 0` before
 * `toString` avoids a leading `-`.
 *
 * Deliberately NOT shared with `ExperimentEngine`'s hash in
 * `@guideflow/analytics` — that one has a known correlation defect, and core
 * must never import a sibling package anyway.
 */
function hash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h, 33) ^ input.charCodeAt(i)
  }
  return (h >>> 0).toString(36)
}
