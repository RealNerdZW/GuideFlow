// ---------------------------------------------------------------------------
// Progress Store
// Per-user, per-flow progress persistence with TTL and "don't show again"
// ---------------------------------------------------------------------------

import type { PersistenceDriver, PersistenceConfig, FlowSnapshot } from '../types/index.js'

import { LocalStorageDriver, createDriver } from './drivers.js'

const DEFAULT_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

interface StoredEntry<T> {
  value: T
  expiresAt: number
}

/**
 * True when a stored entry is past its expiry. `Infinity` (written when TTL is
 * disabled) is never past, and a missing/NaN `expiresAt` is treated as
 * non-expiring rather than instantly stale.
 */
function isExpired(entry: { expiresAt?: unknown }): boolean {
  const at = entry.expiresAt
  if (typeof at !== 'number' || Number.isNaN(at)) return false
  return Date.now() > at
}

/**
 * `flowId` or `flowId@version`, the two shapes the completed record holds.
 *
 * Module-level rather than class statics on purpose: a minifier inlines these
 * and drops the names, where `ProgressStore._VERSION_SEP` survives as a real
 * property. That difference is 60 B of a 201 B change.
 */
const VERSION_SEP = '@'

function completedEntry(flowId: string, version?: string | number): string {
  if (version !== undefined) return `${flowId}${VERSION_SEP}${String(version)}`
  // An id with an INTERIOR separator and no version would be read back with its
  // own tail stripped — `my@flow` becomes `my`, and a checklist item pointing at
  // it silently never ticks. A trailing separator makes the split unambiguous.
  // `@scope/flow` is unaffected: a leading separator is never a split point.
  return flowId.lastIndexOf(VERSION_SEP) > 0 ? `${flowId}${VERSION_SEP}` : flowId
}

/** Strip a `@version` suffix, if there is one. A leading `@` is part of the id. */
function completedFlowId(entry: string): string {
  const at = entry.lastIndexOf(VERSION_SEP)
  return at > 0 ? entry.slice(0, at) : entry
}

export class ProgressStore {
  private _driver: PersistenceDriver
  private _keyFn: (userId: string) => string
  private _ttl: number

  constructor(config: PersistenceConfig = {}) {
    this._driver = ProgressStore._resolveDriver(config)
    this._keyFn = config.key ?? ((userId) => `gf:${userId}:progress`)
    this._ttl = config.ttl ?? DEFAULT_TTL
  }

  private static _resolveDriver(config: PersistenceConfig): PersistenceDriver {
    if (!config.driver || config.driver === 'localStorage') return new LocalStorageDriver()
    if (config.driver === 'indexedDB') return createDriver('indexedDB')
    return config.driver
  }

  /** Apply a new persistence config in place (used by `instance.configure()`). */
  reconfigure(config: PersistenceConfig): void {
    this._driver = ProgressStore._resolveDriver(config)
    this._keyFn = config.key ?? ((userId) => `gf:${userId}:progress`)
    this._ttl = config.ttl ?? DEFAULT_TTL
  }

  /**
   * Absolute expiry for a new write. A TTL of `0` (or any non-positive value,
   * or `Infinity`) means "never expires" — `ttl: 0` is documented as disabling
   * expiry but used to make every entry expire on the very next read, silently
   * turning off all persistence. See AUDIT `ttl-zero-expires-immediately`.
   */
  private _expiry(): number {
    return this._ttl > 0 && Number.isFinite(this._ttl)
      ? Date.now() + this._ttl
      : Number.POSITIVE_INFINITY
  }

  // ── Flow snapshots ────────────────────────────────────────────────────────

  async saveSnapshot(userId: string, snapshot: FlowSnapshot): Promise<void> {
    const key = `${this._keyFn(userId)}:${snapshot.flowId}:snapshot`
    const entry: StoredEntry<FlowSnapshot> = {
      value: snapshot,
      expiresAt: this._expiry(),
    }
    await this._driver.set(key, entry)
  }

  async loadSnapshot(userId: string, flowId: string): Promise<FlowSnapshot | null> {
    const key = `${this._keyFn(userId)}:${flowId}:snapshot`
    const entry = await this._driver.get<StoredEntry<FlowSnapshot>>(key)
    if (!entry) return null
    if (isExpired(entry)) {
      await this._driver.remove(key)
      return null
    }
    return entry.value
  }

  async clearSnapshot(userId: string, flowId: string): Promise<void> {
    const key = `${this._keyFn(userId)}:${flowId}:snapshot`
    await this._driver.remove(key)
  }

  // ── "Don't show again" ────────────────────────────────────────────────────

  async markDismissed(userId: string, flowId: string): Promise<void> {
    const key = `${this._keyFn(userId)}:${flowId}:dismissed`
    const entry: StoredEntry<boolean> = {
      value: true,
      expiresAt: this._expiry(),
    }
    await this._driver.set(key, entry)
  }

  async isDismissed(userId: string, flowId: string): Promise<boolean> {
    const key = `${this._keyFn(userId)}:${flowId}:dismissed`
    const entry = await this._driver.get<StoredEntry<boolean>>(key)
    if (!entry) return false
    if (isExpired(entry)) {
      await this._driver.remove(key)
      return false
    }
    return entry.value
  }

  async clearDismissed(userId: string, flowId: string): Promise<void> {
    const key = `${this._keyFn(userId)}:${flowId}:dismissed`
    await this._driver.remove(key)
  }

  // ── Auxiliary records ─────────────────────────────────────────────────────

  /**
   * Read an arbitrary record from this user's namespace.
   *
   * `suffix` is appended to the same prefix `resetUser()` sweeps, so anything
   * stored here is cleared for free when a user resets. Use a **single-segment**
   * suffix (`'caps'`): every flow-scoped key carries a second segment
   * (`:<flowId>:snapshot`), so a single-segment suffix cannot collide with a
   * flow id.
   *
   * This exists so `@guideflow/core/targeting` can persist frequency caps
   * without building a second driver and asking the user to configure
   * persistence twice.
   *
   * **Three single-segment suffixes are taken.** `'completed'` is this store's
   * own completed-flows array — `getRecord` and `getCompletedFlows` read the
   * identical `{ value, expiresAt }` wrapper, so writing it here overwrites it
   * byte for byte, and `@guideflow/ai` reads that key too. `'caps'` belongs to
   * `@guideflow/core/targeting` and `'checklist'` to `@guideflow/checklist`.
   */
  async getRecord<T>(userId: string, suffix: string): Promise<T | null> {
    const key = `${this._keyFn(userId)}:${suffix}`
    const entry = await this._driver.get<{ value: T; expiresAt: number }>(key)
    if (!entry) return null
    if (isExpired(entry)) {
      await this._driver.remove(key)
      return null
    }
    return entry.value
  }

  async setRecord<T>(userId: string, suffix: string, value: T): Promise<void> {
    await this._driver.set(`${this._keyFn(userId)}:${suffix}`, {
      value,
      expiresAt: this._expiry(),
    })
  }

  // ── Completed flows ───────────────────────────────────────────────────────
  //
  // Entries are `flowId` or `flowId@version`. Completion used to be keyed on the
  // flow id alone, and `start()` checks it *before* the snapshot version gate —
  // so a user who finished v1 of a tour never saw v2, no matter how much v2
  // changed. `start()` returned silently: no render, no event, nothing to
  // observe. Measured, and it is what made "edit the tour and republish"
  // unreachable for exactly the users who had engaged with it most.

  /**
   * Record that this user finished this flow.
   *
   * Omitting `version` writes the bare id, byte-identical to what this wrote
   * before — so a caller that does not care is unaffected.
   */
  async markCompleted(userId: string, flowId: string, version?: string | number): Promise<void> {
    const key = `${this._keyFn(userId)}:completed`
    const existing = await this._rawCompleted(userId)
    const entry = completedEntry(flowId, version)
    if (!existing.includes(entry)) {
      existing.push(entry)
      const stored: StoredEntry<string[]> = { value: existing, expiresAt: this._expiry() }
      await this._driver.set(key, stored)
    }
  }

  /**
   * Completed flow **ids**, with any version suffix stripped and duplicates
   * removed.
   *
   * The signature is unchanged on purpose. `@guideflow/checklist` projects this
   * array by matching an item's `flowId` against it, and `@guideflow/ai` reads
   * the same key — both would silently stop matching if raw `id@version`
   * entries leaked out of here.
   */
  async getCompletedFlows(userId: string): Promise<string[]> {
    const raw = await this._rawCompleted(userId)
    return [...new Set(raw.map(completedFlowId))]
  }

  /**
   * Has this user finished this flow, at this version?
   *
   * A bare `flowId` entry — written before this record carried versions, or by
   * a caller that passed none — suppresses **every** version. That is the
   * conservative direction: an upgrade must never resurrect a tour someone
   * already dismissed by completing it, and there is no way to know which
   * version an unversioned record referred to.
   */
  async isCompleted(userId: string, flowId: string, version?: string | number): Promise<boolean> {
    const raw = await this._rawCompleted(userId)
    if (version === undefined) return raw.some((e) => completedFlowId(e) === flowId)
    // `completedEntry(flowId)` normalises the unversioned form — identical to
    // `flowId` for an ordinary id, and `flowId@` for one with an interior
    // separator. Both spellings are checked so a record written before this
    // release still suppresses every version.
    return (
      raw.includes(flowId) ||
      raw.includes(completedEntry(flowId)) ||
      raw.includes(completedEntry(flowId, version))
    )
  }

  /** The stored entries, verbatim, including any `@version` suffix. */
  private async _rawCompleted(userId: string): Promise<string[]> {
    const key = `${this._keyFn(userId)}:completed`
    const entry = await this._driver.get<StoredEntry<string[]>>(key)
    if (!entry) return []
    // Handle legacy raw string[] format (pre-fix) gracefully
    if (Array.isArray(entry)) return entry
    if (isExpired(entry)) {
      await this._driver.remove(key)
      return []
    }
    return entry.value
  }

  // ── Full reset ────────────────────────────────────────────────────────────

  async resetUser(userId: string): Promise<void> {
    const prefix = this._keyFn(userId)
    if (this._driver.keys) {
      const allKeys = await this._driver.keys()
      const keysToRemove = allKeys.filter((k) => k.startsWith(prefix))
      await Promise.all(keysToRemove.map((k) => this._driver.remove(k)))
    } else if (this._driver instanceof LocalStorageDriver && typeof localStorage !== 'undefined') {
      // Fallback for drivers without keys()
      const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith(prefix))
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
  }
}
