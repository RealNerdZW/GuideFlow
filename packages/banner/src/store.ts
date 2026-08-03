// ---------------------------------------------------------------------------
// Storage.
//
// One record per user, holding every banner on the page, at a single-segment
// suffix on the prefix `ProgressStore.resetUser()` already sweeps.
// ---------------------------------------------------------------------------

import type { ProgressStore } from '@guideflow/core'

/**
 * Single-segment suffix on `<keyFn(userId)>`.
 *
 * RESERVED — do not use any of these:
 *   'completed' — ProgressStore's completed-flows array. `setRecord(userId,
 *                 'completed', …)` overwrites it byte-for-byte, because
 *                 `getRecord` and `getCompletedFlows` read the identical
 *                 `{ value, expiresAt }` wrapper. `@guideflow/ai` reads it too.
 *   'caps'      — `@guideflow/core/targeting`'s frequency caps.
 *   'checklist' — `@guideflow/checklist`.
 *
 * A two-segment suffix would collide with `<flowId>:snapshot` /
 * `<flowId>:dismissed`, which is why `getRecord`'s docblock requires one
 * segment.
 */
export const SUFFIX = 'banner'

/** Keep the 50 most recently dismissed. localStorage has a hard quota. */
const MAX_BANNERS = 50

export interface StoredBanner {
  /**
   * `BannerDefinition.version` at the moment of dismissal.
   *
   * Absent means the author declared no version, and the dismissal is
   * permanent — ADR-015's default. Present means the dismissal only suppresses
   * that revision.
   */
  ver?: string | number
  /** Dismissal epoch ms. Also the prune key. */
  at: number
}

export interface BannerRecord {
  /** Wire format. Unknown value ⇒ discard the whole record. */
  v: 1
  dismissed: Record<string, StoredBanner>
}

function emptyRecord(): BannerRecord {
  return { v: 1, dismissed: {} }
}

/**
 * Read the whole record.
 *
 * Discard, do not migrate, and say so — the same call `@guideflow/checklist`
 * makes. A lost dismissal is visible (a banner someone closed comes back) and
 * silence would make it unattributable.
 */
export async function loadRecord(store: ProgressStore, userId: string): Promise<BannerRecord> {
  const raw = await store.getRecord<BannerRecord>(userId, SUFFIX)
  if (!raw) return emptyRecord()
  if (raw.v !== 1 || typeof raw.dismissed !== 'object' || raw.dismissed === null) {
    console.warn(
      '[@guideflow/banner] Stored banner record has an unrecognised format ' +
        `(v: ${String((raw as { v?: unknown }).v)}). It was discarded — dismissed banners ` +
        'may reappear once.',
    )
    return emptyRecord()
  }
  return raw
}

/**
 * Is this banner suppressed by a stored dismissal?
 *
 * Two rules, and the asymmetry is the point (ADR-015 / ADR-017):
 *   - a dismissal stored WITHOUT a version suppresses every version, forever;
 *   - a dismissal stored WITH one suppresses only that revision.
 *
 * The first is the default because omitting `version` is the default. The
 * second only happens when an author declared a version and then changed it,
 * which is them asserting the content is genuinely new.
 */
export function isDismissed(
  record: BannerRecord,
  bannerId: string,
  version: string | number | undefined,
): boolean {
  const stored = record.dismissed[bannerId]
  if (!stored) return false
  if (stored.ver === undefined) return true
  return stored.ver === version
}

/**
 * Record a dismissal and write the record back.
 *
 * Re-reads first, so a concurrent write in the same tab does not lose an entry.
 * Across tabs the last write wins, exactly as `markCompleted` and the frequency
 * caps already do — closing that needs a compare-and-swap no driver exposes.
 */
export async function recordDismissal(
  store: ProgressStore,
  userId: string,
  bannerId: string,
  version: string | number | undefined,
): Promise<BannerRecord> {
  const record = await loadRecord(store, userId)
  record.dismissed[bannerId] = {
    ...(version !== undefined && { ver: version }),
    at: Date.now(),
  }
  const next: BannerRecord = { v: 1, dismissed: prune(record.dismissed, bannerId) }
  await store.setRecord(userId, SUFFIX, next)
  return next
}

/** Drop every stored dismissal. Never touches anything outside this suffix. */
export async function clearRecord(store: ProgressStore, userId: string): Promise<void> {
  await store.setRecord(userId, SUFFIX, emptyRecord())
}

/**
 * Keep the {@link MAX_BANNERS} most recent dismissals, and `writing` always.
 *
 * `writing` is exempt because `at` is millisecond-resolution: fifty-odd
 * dismissals written in the same tick all tie, the sort is then free to order
 * them any way it likes, and the entry the caller *just wrote* can be the one
 * evicted — a write that silently does nothing. This is the same trap
 * `@guideflow/checklist`'s `prune` documents; it is a real one, found there by
 * a test.
 */
function prune(
  dismissed: Record<string, StoredBanner>,
  writing: string,
): Record<string, StoredBanner> {
  const ids = Object.keys(dismissed)
  if (ids.length <= MAX_BANNERS) return dismissed

  const position = new Map(ids.map((id, index) => [id, index]))
  const keep = ids
    .filter((id) => id !== writing)
    .sort((a, b) => {
      const byTime = (dismissed[b]?.at ?? 0) - (dismissed[a]?.at ?? 0)
      return byTime !== 0 ? byTime : (position.get(b) ?? 0) - (position.get(a) ?? 0)
    })
    .slice(0, MAX_BANNERS - 1)

  const out: Record<string, StoredBanner> = {}
  for (const id of [writing, ...keep]) {
    const entry = dismissed[id]
    if (entry) out[id] = entry
  }
  return out
}
