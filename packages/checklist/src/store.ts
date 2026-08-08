// ---------------------------------------------------------------------------
// Storage.
//
// One record per user, holding every checklist on the page, at a single-segment
// suffix on the prefix `ProgressStore.resetUser()` already sweeps.
// ---------------------------------------------------------------------------

import type { ProgressStore } from '@guideflow/core'

/**
 * Single-segment suffix on `<keyFn(userId)>`.
 *
 * RESERVED — do not use either of these:
 *   'completed' — ProgressStore's completed-flows array. `setRecord(userId,
 *                 'completed', …)` overwrites it byte-for-byte, because
 *                 `getRecord` and `getCompletedFlows` read the identical
 *                 `{ value, expiresAt }` wrapper. `@guideflow/ai` reads it too.
 *   'caps'      — `@guideflow/core/targeting`'s frequency caps.
 *
 * A two-segment suffix would collide with `<flowId>:snapshot` /
 * `<flowId>:dismissed`, which is why `getRecord`'s docblock requires one
 * segment.
 */
export const SUFFIX = 'checklist'

/** Keep the 20 most recently touched lists. localStorage has a hard quota. */
const MAX_LISTS = 20

export interface StoredList {
  /** Mirrors `ChecklistDefinition.version`. Mismatch ⇒ discard THIS list only. */
  ver?: string | number
  /** itemId → epoch ms of the manual tick. */
  done: Record<string, number>
  dismissed?: boolean
  collapsed?: boolean
  /** Last-touched epoch ms, for pruning. */
  t: number
}

export interface ChecklistRecord {
  /** Wire format. Unknown value ⇒ discard the whole record. */
  v: 1
  lists: Record<string, StoredList>
}

export interface ListPatch {
  /** Ticks to add. Merged with `Math.min` — the earlier timestamp is the true one. */
  done?: Record<string, number>
  /** Ticks to remove. Explicit, so a merge's absences never read as deletions. */
  undone?: readonly string[]
  dismissed?: boolean
  collapsed?: boolean
}

export function emptyList(): StoredList {
  return { done: {}, t: Date.now() }
}

function emptyRecord(): ChecklistRecord {
  return { v: 1, lists: {} }
}

/**
 * Read the whole record.
 *
 * Discard, do not migrate — the same call the frequency caps make, but with a
 * `console.warn`, which is the deliberate divergence. A lost cap costs one
 * extra tour impression; a lost tick is a visible regression someone files a
 * ticket about, and silence would make it unattributable.
 */
export async function loadRecord(
  store: ProgressStore,
  userId: string,
): Promise<ChecklistRecord> {
  const raw = await store.getRecord<ChecklistRecord>(userId, SUFFIX)
  if (!raw) return emptyRecord()
  if (raw.v !== 1 || typeof raw.lists !== 'object' || raw.lists === null) {
    console.warn(
      '[@guideflow/checklist] Stored checklist record has an unrecognised format ' +
        `(v: ${String((raw as { v?: unknown }).v)}). It was discarded — manual ticks are lost, ` +
        'flow-backed items are unaffected.',
    )
    return emptyRecord()
  }
  return raw
}

/**
 * The stored list for `listId`, or a fresh one when the version moved.
 *
 * A `ver` mismatch discards THAT list only. Every other checklist on the page
 * shares the record and has nothing to do with this one's shape changing.
 */
export function readList(
  record: ChecklistRecord,
  listId: string,
  version: string | number | undefined,
): StoredList {
  const stored = record.lists[listId]
  if (!stored || typeof stored.done !== 'object' || stored.done === null) return emptyList()
  if (stored.ver !== version) {
    console.warn(
      `[@guideflow/checklist] Checklist "${listId}" changed version ` +
        `(stored ${String(stored.ver)}, current ${String(version)}). Its stored ticks were ` +
        'discarded rather than migrated.',
    )
    return emptyList()
  }
  return stored
}

/**
 * Merge `patch` into the stored list and write the record back.
 *
 * Re-reads first and unions rather than overwriting: `done` maps merge with
 * `Math.min` on the timestamp (the earlier tick is the true one), `dismissed`
 * and `collapsed` take the patch. Union is sound because manual completion is
 * monotone within a list version.
 *
 * This narrows the read-modify-write race to the cross-tab case. Within a tab
 * the caller serialises writes through one promise chain; across tabs the last
 * write wins, exactly as `markCompleted` itself does. Closing that needs a
 * compare-and-swap no driver exposes.
 */
export async function mergeList(
  store: ProgressStore,
  userId: string,
  listId: string,
  version: string | number | undefined,
  patch: ListPatch,
): Promise<StoredList> {
  const record = await loadRecord(store, userId)
  const current = record.lists[listId]
  const base: StoredList =
    current && current.ver === version && typeof current.done === 'object' && current.done !== null
      ? current
      : emptyList()

  const done: Record<string, number> = { ...base.done }
  if (patch.done) {
    for (const [itemId, at] of Object.entries(patch.done)) {
      const existing = done[itemId]
      done[itemId] = existing === undefined ? at : Math.min(existing, at)
    }
  }
  // Removal is explicit rather than "whatever is absent from the patch",
  // because a merge whose absences are meaningful is not a merge — a
  // concurrent tick in another tab would read as a removal.
  for (const itemId of patch.undone ?? []) delete done[itemId]

  const next: StoredList = {
    ...(version !== undefined && { ver: version }),
    done,
    ...(base.dismissed !== undefined && { dismissed: base.dismissed }),
    ...(base.collapsed !== undefined && { collapsed: base.collapsed }),
    ...(patch.dismissed !== undefined && { dismissed: patch.dismissed }),
    ...(patch.collapsed !== undefined && { collapsed: patch.collapsed }),
    t: Date.now(),
  }

  record.lists[listId] = next
  await store.setRecord(userId, SUFFIX, { v: 1, lists: prune(record.lists, listId) })
  return next
}

/** Drop this list from the record entirely. Never touches the completed flows. */
export async function clearList(
  store: ProgressStore,
  userId: string,
  listId: string,
): Promise<void> {
  const record = await loadRecord(store, userId)
  delete record.lists[listId]
  await store.setRecord(userId, SUFFIX, record)
}

/**
 * Keep the {@link MAX_LISTS} most recently touched lists, and `writing` always.
 *
 * `writing` is exempt because `t` is millisecond-resolution: twenty-odd lists
 * written in the same tick all tie, the sort is then free to order them any
 * way it likes, and the list the caller *just wrote* can be the one evicted —
 * a write that silently does nothing. Ties are otherwise broken by insertion
 * order, latest first, since string keys enumerate in insertion order.
 */
function prune(
  lists: Record<string, StoredList>,
  writing: string,
): Record<string, StoredList> {
  const ids = Object.keys(lists)
  if (ids.length <= MAX_LISTS) return lists

  const position = new Map(ids.map((id, index) => [id, index]))
  const keep = ids
    .filter((id) => id !== writing)
    .sort((a, b) => {
      const byTime = (lists[b]?.t ?? 0) - (lists[a]?.t ?? 0)
      return byTime !== 0 ? byTime : (position.get(b) ?? 0) - (position.get(a) ?? 0)
    })
    .slice(0, MAX_LISTS - 1)

  const out: Record<string, StoredList> = {}
  for (const id of [writing, ...keep]) {
    const entry = lists[id]
    if (entry) out[id] = entry
  }
  return out
}
