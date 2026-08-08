// ---------------------------------------------------------------------------
// Snapshot identity.
//
// `useSyncExternalStore` re-renders whenever `getSnapshot()` returns a new
// reference, so a fresh array on every call is an infinite render loop. This
// module rebuilds an item only when one of its fields differs, the array only
// when an item reference changed, and the top-level snapshot only when the
// array or a scalar changed.
//
// The key lists below are `satisfies Record<keyof …, true>` rather than
// hand-written arrays, so a field added to the interface fails to compile until
// it is added here. That is not pedantry: React's own tour-store comparator
// omits `isWaiting`, and the result is that no React consumer re-renders on
// `step:waiting` — a hand-written comparator rots silently.
// ---------------------------------------------------------------------------

import type { ChecklistDefinition, ChecklistItemState, ChecklistState } from './types.js'

export const ITEM_KEYS = Object.keys({
  id: true,
  title: true,
  description: true,
  done: true,
  source: true,
  available: true,
  blockedBy: true,
  flowId: true,
  href: true,
  group: true,
} satisfies Record<keyof ChecklistItemState, true>) as ReadonlyArray<keyof ChecklistItemState>

export const STATE_KEYS = Object.keys({
  id: true,
  title: true,
  items: true,
  doneCount: true,
  totalCount: true,
  complete: true,
  dismissed: true,
  collapsed: true,
  hidden: true,
  tourActive: true,
  persisted: true,
  hydrated: true,
} satisfies Record<keyof ChecklistState, true>) as ReadonlyArray<keyof ChecklistState>

function sameItem(a: ChecklistItemState, b: ChecklistItemState): boolean {
  for (const key of ITEM_KEYS) {
    if (key === 'blockedBy') {
      if (!sameStrings(a.blockedBy, b.blockedBy)) return false
      continue
    }
    if (a[key] !== b[key]) return false
  }
  return true
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

/**
 * Reuse the previous item objects wherever nothing about them changed.
 *
 * Returns the previous array itself when every item was reused, so an
 * unchanged list does not invalidate the snapshot above it.
 */
export function reconcileItems(
  previous: readonly ChecklistItemState[],
  next: readonly ChecklistItemState[],
): readonly ChecklistItemState[] {
  let changed = previous.length !== next.length
  const out = next.map((item, i) => {
    const before = previous[i]
    if (before && sameItem(before, item)) return before
    changed = true
    return item
  })
  return changed ? out : previous
}

/** True when every key of the two states matches, comparing `items` by reference. */
export function sameState(a: ChecklistState, b: ChecklistState): boolean {
  for (const key of STATE_KEYS) {
    if (a[key] !== b[key]) return false
  }
  return true
}

/**
 * Return `previous` when nothing changed, otherwise `next` with its items
 * reconciled against the previous ones.
 */
export function stabilise(
  previous: ChecklistState | null,
  next: ChecklistState,
): ChecklistState {
  if (!previous) return next
  const items = reconcileItems(previous.items, next.items)
  const candidate: ChecklistState = items === next.items ? next : { ...next, items }
  return sameState(previous, candidate) ? previous : candidate
}

/**
 * A frozen idle state, cached per definition.
 *
 * `getServerSnapshot` must be referentially stable across calls or React
 * re-renders forever during hydration, and it must report `hydrated: false` so
 * the server and the first client paint agree on rendering nothing.
 */
const serverSnapshots = new WeakMap<ChecklistDefinition, ChecklistState>()

export function serverSnapshot(definition: ChecklistDefinition): ChecklistState {
  const cached = serverSnapshots.get(definition)
  if (cached) return cached

  const state: ChecklistState = Object.freeze({
    id: definition.id,
    title: definition.title,
    items: Object.freeze([]) as readonly ChecklistItemState[],
    doneCount: 0,
    totalCount: Array.isArray(definition.items) ? definition.items.length : 0,
    complete: false,
    dismissed: false,
    collapsed: false,
    hidden: false,
    tourActive: false,
    persisted: false,
    hydrated: false,
  })
  serverSnapshots.set(definition, state)
  return state
}
