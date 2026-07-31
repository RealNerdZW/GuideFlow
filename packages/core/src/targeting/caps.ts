/**
 * Frequency-cap storage: one {@link CapRecord} per user, at suffix `'caps'`.
 *
 * Rides on `ProgressStore.getRecord`/`setRecord`, so it lands under the same
 * key prefix `resetUser()` sweeps and needs no second driver — a user who
 * configures `persistence` once gets caps in the same place as everything else.
 */
import type { ProgressStore } from '../persistence/progress-store.js'

import { emptyCaps, type CapRecord } from './rules.js'

const SUFFIX = 'caps'
/** Enough history for any plausible session window; bounded so it cannot grow. */
const MAX_GLOBAL_RECENT = 32
const MAX_FLOW_RECENT = 16
const MAX_FLOWS = 50

export async function loadCaps(store: ProgressStore, userId: string): Promise<CapRecord> {
  const raw = await store.getRecord<CapRecord>(userId, SUFFIX)
  // An unknown schema version is DISCARDED, not migrated. A cap record is
  // disposable — the cost of rebuilding it is one extra tour impression, and
  // the cost of mis-migrating it is silently wrong suppression forever.
  if (!raw || raw.v !== 1) return emptyCaps()
  return raw
}

export async function saveCaps(
  store: ProgressStore,
  userId: string,
  caps: CapRecord,
): Promise<void> {
  await store.setRecord(userId, SUFFIX, caps)
}

/**
 * Record that `flowId` was shown at `now`.
 *
 * Read-modify-write over an async driver with no lock and no compare-and-swap,
 * exactly like the existing `markCompleted`. Two tabs starting tours in the
 * same instant can lose one increment. That narrows the race rather than
 * closing it, and it is documented as such — closing it needs a storage-level
 * primitive none of the drivers expose.
 */
export function recordShow(caps: CapRecord, flowId: string, now: number): CapRecord {
  const flows = { ...caps.flows }
  const prev = flows[flowId] ?? { last: 0, total: 0, recent: [] }
  flows[flowId] = {
    last: now,
    total: prev.total + 1,
    recent: trim([...prev.recent, now], MAX_FLOW_RECENT),
  }

  return {
    v: 1,
    recent: trim([...caps.recent, now], MAX_GLOBAL_RECENT),
    total: caps.total + 1,
    flows: prune(flows),
  }
}

function trim(values: number[], max: number): number[] {
  return values.length <= max ? values : values.slice(values.length - max)
}

/**
 * Keep the 50 most recently shown flows.
 *
 * Without this the record grows without bound for an app with many flows, and
 * localStorage has a hard quota — a store that throws on write silently stops
 * enforcing every cap.
 */
function prune(flows: CapRecord['flows']): CapRecord['flows'] {
  const ids = Object.keys(flows)
  if (ids.length <= MAX_FLOWS) return flows

  const keep = ids
    .sort((a, b) => (flows[b]?.last ?? 0) - (flows[a]?.last ?? 0))
    .slice(0, MAX_FLOWS)

  const out: CapRecord['flows'] = {}
  for (const id of keep) {
    const entry = flows[id]
    if (entry) out[id] = entry
  }
  return out
}
