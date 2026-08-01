// ---------------------------------------------------------------------------
// The pure core.
//
// Everything that decides what a checklist *means* lives here: which items are
// done, which won the tie, which are blocked and by what. No DOM, no async, no
// `gf`, no driver. happy-dom proves nothing about the widget (CLAUDE.md §7.1),
// so the mitigation is to put the logic somewhere a plain unit test can reach.
// ---------------------------------------------------------------------------

import type {
  ChecklistDefinition,
  ChecklistItem,
  ChecklistItemState,
  DeriveInput,
  DeriveResult,
} from './types.js'

/**
 * Resolve a definition plus its two truth sources into item states.
 *
 * An item is done if **either** its `flowId` appears in `completedFlows`
 * **or** its id appears in the manual map. A union, never an override —
 * `source` reports which won, and `'flow'` wins the label when both are true.
 */
export function deriveChecklist(
  definition: ChecklistDefinition,
  input: DeriveInput,
): DeriveResult {
  const items = Array.isArray(definition.items) ? definition.items : []
  // `getCompletedFlows` trusts `entry.value` to be an array, and the same
  // `:completed` key is written by `@guideflow/ai` as `'step:' + id`. Guard the
  // shape, then look up by declared flowId only — a foreign entry must never
  // tick an item.
  const completed = new Set(Array.isArray(input.completedFlows) ? input.completedFlows : [])
  const manual = input.manual as Record<string, number | undefined>

  const done = new Map<string, 'flow' | 'manual'>()
  for (const item of items) {
    const byFlow = item.flowId !== undefined && completed.has(item.flowId)
    const byManual = manual[item.id] !== undefined
    if (byFlow) done.set(item.id, 'flow')
    else if (byManual) done.set(item.id, 'manual')
  }

  const states: ChecklistItemState[] = items.map((item) => {
    const source = done.get(item.id) ?? null
    const blockedBy = unmetRequirements(item, items, done)
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      done: source !== null,
      source,
      available: blockedBy.length === 0,
      blockedBy,
      flowId: item.flowId ?? null,
    }
  })

  const doneCount = states.reduce((n, s) => (s.done ? n + 1 : n), 0)
  return {
    items: states,
    doneCount,
    totalCount: states.length,
    complete: states.length > 0 && doneCount === states.length,
  }
}

/**
 * Ids of the `requires` entries that are not yet done, following the chain.
 *
 * Transitive: an item requiring B is blocked while B is blocked, and B's own
 * unmet requirement is named too — "do X first" is useless when X is itself
 * unreachable. A cycle terminates because every id is visited at most once.
 */
function unmetRequirements(
  item: ChecklistItem,
  items: readonly ChecklistItem[],
  done: ReadonlyMap<string, 'flow' | 'manual'>,
): readonly string[] {
  const requires = item.requires
  if (requires === undefined || requires.length === 0) return EMPTY

  const out: string[] = []
  const seen = new Set<string>([item.id])
  const queue = [...requires]

  while (queue.length > 0) {
    const id = queue.shift() as string
    if (seen.has(id)) continue
    seen.add(id)

    const dep = items.find((i) => i.id === id)
    // A `requires` naming an item that does not exist is unsatisfiable, and
    // reporting it is more useful than silently treating it as met.
    if (!dep) {
      out.push(id)
      continue
    }
    if (done.has(id)) continue

    out.push(id)
    if (dep.requires !== undefined) queue.push(...dep.requires)
  }

  return out.length === 0 ? EMPTY : out
}

/** Shared so an unblocked item's `blockedBy` is referentially stable. */
const EMPTY: readonly string[] = Object.freeze([])
