// ---------------------------------------------------------------------------
// Storage.
//
// One record per user, holding every survey on the page, at a single-segment
// suffix on the prefix `ProgressStore.resetUser()` already sweeps.
// ---------------------------------------------------------------------------

import type { ProgressStore } from '@guideflow/core'

/**
 * Single-segment suffix on `<keyFn(userId)>`.
 *
 * RESERVED — do not use any of these:
 *   'completed' — ProgressStore's completed-flows array. `setRecord(userId,
 *                 'completed', …)` overwrites it byte-for-byte, and
 *                 `@guideflow/ai` reads that key too.
 *   'caps'      — `@guideflow/core/targeting`'s frequency caps.
 *   'checklist' — `@guideflow/checklist`.
 *   'banner'    — `@guideflow/banner`.
 *
 * A two-segment suffix would collide with `<flowId>:snapshot` /
 * `<flowId>:dismissed`, which is why `getRecord`'s docblock requires one
 * segment.
 */
export const SUFFIX = 'survey'

/** Keep the 50 most recently asked. localStorage has a hard quota. */
const MAX_SURVEYS = 50

export interface StoredSurvey {
  /**
   * When this person was last SHOWN the survey, epoch ms.
   *
   * The cooldown measures from here rather than from `answeredAt`, because
   * someone who closed it without answering has also been asked. Also the
   * prune key.
   */
  at: number
  /** Set once they actually answered. Absent means asked-but-not-answered. */
  answeredAt?: number
  /** `SurveyDefinition.version` at the moment of the ask. */
  ver?: string | number
}

export interface SurveyRecord {
  /** Wire format. Unknown value ⇒ discard the whole record. */
  v: 1
  asked: Record<string, StoredSurvey>
}

function emptyRecord(): SurveyRecord {
  return { v: 1, asked: {} }
}

/** Read the whole record. Discard an unknown format rather than migrate it. */
export async function loadRecord(store: ProgressStore, userId: string): Promise<SurveyRecord> {
  const raw = await store.getRecord<SurveyRecord>(userId, SUFFIX)
  if (!raw) return emptyRecord()
  if (raw.v !== 1 || typeof raw.asked !== 'object' || raw.asked === null) {
    console.warn(
      '[@guideflow/survey] Stored survey record has an unrecognised format ' +
        `(v: ${String((raw as { v?: unknown }).v)}). It was discarded — people may be asked ` +
        'again once.',
    )
    return emptyRecord()
  }
  return raw
}

/**
 * Has this person been asked recently enough that we should not ask again?
 *
 * Three rules, in order:
 *   - never asked, or asked about a DIFFERENT version → ask;
 *   - `cooldownMs` set → ask again once that long has passed since the ask;
 *   - no `cooldownMs` → asking once is final.
 *
 * The version check comes first so that bumping `version` overrides a cooldown
 * that has not elapsed: a genuinely new question should not wait out the old
 * one's timer.
 */
export function isSuppressed(
  record: SurveyRecord,
  surveyId: string,
  version: string | number | undefined,
  cooldownMs: number | undefined,
  now: number,
): boolean {
  const stored = record.asked[surveyId]
  if (!stored) return false
  if (stored.ver !== version) return false
  if (cooldownMs === undefined) return true
  return now - stored.at < cooldownMs
}

/** Record that the survey was shown, and optionally that it was answered. */
export async function recordAsk(
  store: ProgressStore,
  userId: string,
  surveyId: string,
  version: string | number | undefined,
  answered: boolean,
  now: number,
): Promise<SurveyRecord> {
  const record = await loadRecord(store, userId)
  record.asked[surveyId] = {
    at: now,
    ...(answered && { answeredAt: now }),
    ...(version !== undefined && { ver: version }),
  }
  const next: SurveyRecord = { v: 1, asked: prune(record.asked, surveyId) }
  await store.setRecord(userId, SUFFIX, next)
  return next
}

/** Drop every stored ask. Never touches anything outside this suffix. */
export async function clearRecord(store: ProgressStore, userId: string): Promise<void> {
  await store.setRecord(userId, SUFFIX, emptyRecord())
}

/**
 * Keep the {@link MAX_SURVEYS} most recent, and `writing` always.
 *
 * `writing` is exempt because `at` is millisecond-resolution: fifty-odd
 * records written in the same tick all tie, the sort is free to order them any
 * way it likes, and the entry the caller just wrote can be the one evicted — a
 * write that silently does nothing. The same trap `@guideflow/checklist` found
 * with a test and `@guideflow/banner` inherited.
 */
function prune(
  asked: Record<string, StoredSurvey>,
  writing: string,
): Record<string, StoredSurvey> {
  const ids = Object.keys(asked)
  if (ids.length <= MAX_SURVEYS) return asked

  const position = new Map(ids.map((id, index) => [id, index]))
  const keep = ids
    .filter((id) => id !== writing)
    .sort((a, b) => {
      const byTime = (asked[b]?.at ?? 0) - (asked[a]?.at ?? 0)
      return byTime !== 0 ? byTime : (position.get(b) ?? 0) - (position.get(a) ?? 0)
    })
    .slice(0, MAX_SURVEYS - 1)

  const out: Record<string, StoredSurvey> = {}
  for (const id of [writing, ...keep]) {
    const entry = asked[id]
    if (entry) out[id] = entry
  }
  return out
}
