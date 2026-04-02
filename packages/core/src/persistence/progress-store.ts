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

export class ProgressStore {
  private _driver: PersistenceDriver
  private _keyFn: (userId: string) => string
  private _ttl: number

  constructor(config: PersistenceConfig = {}) {
    if (!config.driver || config.driver === 'localStorage') {
      this._driver = new LocalStorageDriver()
    } else if (config.driver === 'indexedDB') {
      this._driver = createDriver('indexedDB')
    } else {
      this._driver = config.driver
    }
    this._keyFn = config.key ?? ((userId) => `gf:${userId}:progress`)
    this._ttl = config.ttl ?? DEFAULT_TTL
  }

  // ── Flow snapshots ────────────────────────────────────────────────────────

  async saveSnapshot(userId: string, snapshot: FlowSnapshot): Promise<void> {
    const key = `${this._keyFn(userId)}:${snapshot.flowId}:snapshot`
    const entry: StoredEntry<FlowSnapshot> = {
      value: snapshot,
      expiresAt: Date.now() + this._ttl,
    }
    await this._driver.set(key, entry)
  }

  async loadSnapshot(userId: string, flowId: string): Promise<FlowSnapshot | null> {
    const key = `${this._keyFn(userId)}:${flowId}:snapshot`
    const entry = await this._driver.get<StoredEntry<FlowSnapshot>>(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
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
      expiresAt: Date.now() + this._ttl,
    }
    await this._driver.set(key, entry)
  }

  async isDismissed(userId: string, flowId: string): Promise<boolean> {
    const key = `${this._keyFn(userId)}:${flowId}:dismissed`
    const entry = await this._driver.get<StoredEntry<boolean>>(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      await this._driver.remove(key)
      return false
    }
    return entry.value
  }

  async clearDismissed(userId: string, flowId: string): Promise<void> {
    const key = `${this._keyFn(userId)}:${flowId}:dismissed`
    await this._driver.remove(key)
  }

  // ── Completed flows ───────────────────────────────────────────────────────

  async markCompleted(userId: string, flowId: string): Promise<void> {
    const key = `${this._keyFn(userId)}:completed`
    const existing = (await this._driver.get<string[]>(key)) ?? []
    if (!existing.includes(flowId)) {
      existing.push(flowId)
      await this._driver.set(key, existing)
    }
  }

  async getCompletedFlows(userId: string): Promise<string[]> {
    const key = `${this._keyFn(userId)}:completed`
    return (await this._driver.get<string[]>(key)) ?? []
  }

  async isCompleted(userId: string, flowId: string): Promise<boolean> {
    const completed = await this.getCompletedFlows(userId)
    return completed.includes(flowId)
  }

  // ── Full reset ────────────────────────────────────────────────────────────

  async resetUser(userId: string): Promise<void> {
    // Best-effort: only localStorage supports enumerable keys
    if (this._driver instanceof LocalStorageDriver && typeof localStorage !== 'undefined') {
      const prefix = this._keyFn(userId)
      const keysToRemove = Object.keys(localStorage).filter((k) => k.startsWith(prefix))
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
  }
}
