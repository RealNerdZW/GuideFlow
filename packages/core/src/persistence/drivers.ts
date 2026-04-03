// ---------------------------------------------------------------------------
// Persistence Drivers
// LocalStorage and IndexedDB implementations of PersistenceDriver interface
// ---------------------------------------------------------------------------

import type { PersistenceDriver } from '../types/index.js'
import { isBrowser } from '../utils/ssr.js'

// ── LocalStorage Driver ───────────────────────────────────────────────────────

export class LocalStorageDriver implements PersistenceDriver {
  get<T>(key: string): T | null {
    if (!isBrowser()) return null
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    if (!isBrowser()) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.warn('[GuideFlow] LocalStorage write failed:', e)
    }
  }

  remove(key: string): void {
    if (!isBrowser()) return
    localStorage.removeItem(key)
  }

  keys(): string[] {
    if (!isBrowser()) return []
    return Object.keys(localStorage)
  }
}

// ── IndexedDB Driver ──────────────────────────────────────────────────────────

const IDB_DB_NAME = 'guideflow'
const IDB_STORE_NAME = 'progress'
const IDB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IndexedDBDriver implements PersistenceDriver {
  private _dbPromise: Promise<IDBDatabase> | null = null

  private _db(): Promise<IDBDatabase> {
    if (!this._dbPromise) {
      this._dbPromise = openDB()
    }
    return this._dbPromise
  }

  async get<T>(key: string): Promise<T | null> {
    if (!isBrowser()) return null
    try {
      const db = await this._db()
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly')
        const req = tx.objectStore(IDB_STORE_NAME).get(key)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => reject(req.error)
      })
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (!isBrowser()) return
    try {
      const db = await this._db()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
        const req = tx.objectStore(IDB_STORE_NAME).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch (e) {
      console.warn('[GuideFlow] IndexedDB write failed:', e)
    }
  }

  async remove(key: string): Promise<void> {
    if (!isBrowser()) return
    try {
      const db = await this._db()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
        const req = tx.objectStore(IDB_STORE_NAME).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch {
      // silent
    }
  }

  async keys(): Promise<string[]> {
    if (!isBrowser()) return []
    try {
      const db = await this._db()
      return await new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly')
        const req = tx.objectStore(IDB_STORE_NAME).getAllKeys()
        req.onsuccess = () => resolve((req.result as string[]) ?? [])
        req.onerror = () => reject(req.error)
      })
    } catch {
      return []
    }
  }
}

// ── Driver factory ────────────────────────────────────────────────────────────

export function createDriver(type: 'localStorage' | 'indexedDB'): PersistenceDriver {
  return type === 'indexedDB' ? new IndexedDBDriver() : new LocalStorageDriver()
}
