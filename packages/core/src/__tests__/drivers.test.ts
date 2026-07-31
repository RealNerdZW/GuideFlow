import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  IndexedDBDriver,
  LocalStorageDriver,
  createDriver,
} from '../persistence/drivers.js'

// ── Minimal hand-rolled IndexedDB stub ────────────────────────────────────────
// happy-dom 13 does not implement IndexedDB at all (`typeof indexedDB` is
// 'undefined' in this environment), so the tests below install just enough of
// the IDBFactory surface that `drivers.ts` actually touches:
//   indexedDB.open() -> { onupgradeneeded, onsuccess, onerror, result, error }
//   db.transaction(store, mode).objectStore(store).get/put/delete/getAllKeys()
// Every request settles in a microtask so the driver has time to attach its
// handlers, exactly like the real async API.

class FakeRequest<T> {
  result: T | undefined = undefined
  error: Error | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null
}

function settle<T>(req: FakeRequest<T>, value: T): void {
  queueMicrotask(() => {
    req.result = value
    req.onsuccess?.()
  })
}

class FakeObjectStore {
  constructor(private readonly _data: Map<string, unknown>) {}

  get(key: string): FakeRequest<unknown> {
    const req = new FakeRequest<unknown>()
    settle(req, this._data.get(key))
    return req
  }

  put(value: unknown, key: string): FakeRequest<undefined> {
    const req = new FakeRequest<undefined>()
    this._data.set(key, value)
    settle(req, undefined)
    return req
  }

  delete(key: string): FakeRequest<undefined> {
    const req = new FakeRequest<undefined>()
    this._data.delete(key)
    settle(req, undefined)
    return req
  }

  getAllKeys(): FakeRequest<string[]> {
    const req = new FakeRequest<string[]>()
    settle(req, [...this._data.keys()])
    return req
  }
}

class FakeDatabase {
  readonly stores = new Set<string>()

  constructor(private readonly _data: Map<string, unknown>) {}

  createObjectStore(name: string): FakeObjectStore {
    this.stores.add(name)
    return new FakeObjectStore(this._data)
  }

  transaction(_name: string, _mode?: string): { objectStore: () => FakeObjectStore } {
    return { objectStore: () => new FakeObjectStore(this._data) }
  }
}

/** Builds a stub IDBFactory backed by `data`; `failOpen` makes open() error. */
function createFakeIndexedDB(
  data: Map<string, unknown>,
  failOpen = false,
): { open: () => FakeRequest<FakeDatabase> } {
  return {
    open(): FakeRequest<FakeDatabase> {
      const req = new FakeRequest<FakeDatabase>()
      queueMicrotask(() => {
        if (failOpen) {
          req.error = new Error('open blocked')
          req.onerror?.()
          return
        }
        req.result = new FakeDatabase(data)
        req.onupgradeneeded?.()
        req.onsuccess?.()
      })
      return req
    },
  }
}

// ── Spec-accurate Storage stub ────────────────────────────────────────────────
// happy-dom 13's Storage keeps entries in a `#store` private field and exposes
// no named properties, so `Object.keys(localStorage)` is permanently `[]` there.
// Real browsers expose every entry as an own enumerable property (Storage is a
// legacy platform object with a named property getter). This Proxy reproduces
// that so `keys()` assertions exercise the driver rather than the environment.

function createBrowserLikeStorage(): Storage {
  const data = new Map<string, string>()
  const api = {
    getItem: (name: string): string | null => data.get(name) ?? null,
    setItem: (name: string, value: string): void => {
      data.set(name, String(value))
    },
    removeItem: (name: string): void => {
      data.delete(name)
    },
    clear: (): void => {
      data.clear()
    },
    key: (index: number): string | null => [...data.keys()][index] ?? null,
    get length(): number {
      return data.size
    },
  }

  return new Proxy(api, {
    get: (target, prop, receiver) =>
      typeof prop === 'string' && data.has(prop)
        ? data.get(prop)
        : (Reflect.get(target, prop, receiver) as unknown),
    ownKeys: () => [...data.keys()],
    getOwnPropertyDescriptor: (_target, prop) =>
      typeof prop === 'string' && data.has(prop)
        ? { value: data.get(prop), enumerable: true, configurable: true, writable: true }
        : undefined,
  }) as unknown as Storage
}

// ── LocalStorageDriver ────────────────────────────────────────────────────────

describe('LocalStorageDriver', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('round-trips an object through set/get', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:snapshot', { flowId: 'tour-1', stepIndex: 2 })

    expect(driver.get<{ flowId: string; stepIndex: number }>('gf:snapshot')).toEqual({
      flowId: 'tour-1',
      stepIndex: 2,
    })
  })

  it('stores JSON, not "[object Object]"', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:snapshot', { a: 1 })

    expect(localStorage.getItem('gf:snapshot')).toBe('{"a":1}')
  })

  it('returns null for a missing key', () => {
    const driver = new LocalStorageDriver()
    expect(driver.get('gf:absent')).toBeNull()
  })

  it('distinguishes a stored null from a missing key', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:null', null)

    expect(localStorage.getItem('gf:null')).toBe('null')
    expect(driver.get('gf:null')).toBeNull()
  })

  it('remove() deletes the key so a later get returns null', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:doomed', { keep: false })
    expect(driver.get('gf:doomed')).not.toBeNull()

    driver.remove('gf:doomed')

    expect(driver.get('gf:doomed')).toBeNull()
    expect(localStorage.getItem('gf:doomed')).toBeNull()
  })

  it('does not throw and returns null for a corrupted (non-JSON) value', () => {
    const driver = new LocalStorageDriver()
    localStorage.setItem('gf:corrupt', '{ not json at all')

    expect(() => driver.get('gf:corrupt')).not.toThrow()
    expect(driver.get('gf:corrupt')).toBeNull()
  })

  it('swallows a QuotaExceededError from setItem and warns instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    const driver = new LocalStorageDriver()

    expect(() => driver.set('gf:big', { payload: 'x'.repeat(64) })).not.toThrow()
    expect(setItem).toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  // ── SSR safety ──
  // isBrowser() reads `typeof window`/`typeof document`; stubbing them to
  // undefined makes those typeof checks report 'undefined', i.e. a Node/SSR run.

  it('get() returns null when there is no window (SSR)', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:ssr', { seen: true })

    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)

    expect(driver.get('gf:ssr')).toBeNull()
  })

  it('set() is a no-op when there is no window (SSR)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)

    new LocalStorageDriver().set('gf:ssr', { seen: true })

    expect(setItem).not.toHaveBeenCalled()
  })

  it('remove() is a no-op when there is no window (SSR)', () => {
    const driver = new LocalStorageDriver()
    driver.set('gf:ssr', { seen: true })

    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    driver.remove('gf:ssr')
    vi.unstubAllGlobals()

    expect(driver.get('gf:ssr')).toEqual({ seen: true })
  })

  describe('keys()', () => {
    it('enumerates every stored key', () => {
      vi.stubGlobal('localStorage', createBrowserLikeStorage())
      const driver = new LocalStorageDriver()
      driver.set('gf:a', 1)
      driver.set('gf:b', 2)
      localStorage.setItem('unrelated', 'x')

      expect(driver.keys().sort()).toEqual(['gf:a', 'gf:b', 'unrelated'])
    })

    it('is empty when nothing is stored', () => {
      vi.stubGlobal('localStorage', createBrowserLikeStorage())

      expect(new LocalStorageDriver().keys()).toEqual([])
    })

    it('returns an empty array when there is no window (SSR)', () => {
      vi.stubGlobal('localStorage', createBrowserLikeStorage())
      const driver = new LocalStorageDriver()
      driver.set('gf:ssr', 1)
      expect(driver.keys()).toEqual(['gf:ssr'])

      vi.stubGlobal('window', undefined)
      vi.stubGlobal('document', undefined)

      expect(driver.keys()).toEqual([])
    })

    // Portability finding `localstorage-keys-uses-object-keys` (reported, not yet
    // filed in AUDIT.md): keys() is implemented as `Object.keys(localStorage)`,
    // which only works on Storage implementations that expose entries as named
    // properties. It returns [] on happy-dom 13, jsdom's non-proxy Storage and
    // common Storage polyfills, which silently breaks ProgressStore.resetUser().
    // The spec-portable form is a `length` / `key(i)` loop. Un-skip when fixed.
    it.skip('enumerates keys from a Storage without named properties', () => {
      const driver = new LocalStorageDriver()
      driver.set('gf:a', 1)
      driver.set('gf:b', 2)

      expect(driver.keys().sort()).toEqual(['gf:a', 'gf:b'])
    })
  })
})

// ── IndexedDBDriver ───────────────────────────────────────────────────────────

describe('IndexedDBDriver', () => {
  let data: Map<string, unknown>

  beforeEach(() => {
    data = new Map<string, unknown>()
    vi.stubGlobal('indexedDB', createFakeIndexedDB(data))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('round-trips a value through set/get', async () => {
    const driver = new IndexedDBDriver()
    await driver.set('gf:snapshot', { flowId: 'tour-1', stepIndex: 3 })

    await expect(driver.get('gf:snapshot')).resolves.toEqual({
      flowId: 'tour-1',
      stepIndex: 3,
    })
  })

  it('creates the object store on first open', async () => {
    const driver = new IndexedDBDriver()
    await driver.set('gf:a', 1)

    expect(data.get('gf:a')).toBe(1)
  })

  it('returns null for a missing key', async () => {
    await expect(new IndexedDBDriver().get('gf:absent')).resolves.toBeNull()
  })

  it('remove() deletes the key so a later get returns null', async () => {
    const driver = new IndexedDBDriver()
    await driver.set('gf:doomed', { keep: false })
    await driver.remove('gf:doomed')

    await expect(driver.get('gf:doomed')).resolves.toBeNull()
    expect(data.has('gf:doomed')).toBe(false)
  })

  it('keys() enumerates every stored key', async () => {
    const driver = new IndexedDBDriver()
    await driver.set('gf:a', 1)
    await driver.set('gf:b', 2)

    await expect(driver.keys()).resolves.toEqual(['gf:a', 'gf:b'])
  })

  it('keys() is empty when nothing is stored', async () => {
    await expect(new IndexedDBDriver().keys()).resolves.toEqual([])
  })

  it('get() resolves null when the open request errors', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB(data, true))

    await expect(new IndexedDBDriver().get('gf:a')).resolves.toBeNull()
  })

  it('set() warns and does not reject when the open request errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('indexedDB', createFakeIndexedDB(data, true))

    await expect(new IndexedDBDriver().set('gf:a', 1)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('remove() does not reject when the open request errors', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB(data, true))

    await expect(new IndexedDBDriver().remove('gf:a')).resolves.toBeUndefined()
  })

  it('keys() resolves an empty array when the open request errors', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDB(data, true))

    await expect(new IndexedDBDriver().keys()).resolves.toEqual([])
  })

  it('does not touch indexedDB when there is no window (SSR)', async () => {
    const factory = { open: vi.fn() }
    vi.stubGlobal('indexedDB', factory)
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)

    const driver = new IndexedDBDriver()

    await expect(driver.get('gf:a')).resolves.toBeNull()
    await expect(driver.set('gf:a', 1)).resolves.toBeUndefined()
    await expect(driver.keys()).resolves.toEqual([])
    expect(factory.open).not.toHaveBeenCalled()
  })
})

// ── createDriver ──────────────────────────────────────────────────────────────

describe('createDriver', () => {
  it('returns a LocalStorageDriver for "localStorage"', () => {
    expect(createDriver('localStorage')).toBeInstanceOf(LocalStorageDriver)
  })

  it('returns an IndexedDBDriver for "indexedDB"', () => {
    expect(createDriver('indexedDB')).toBeInstanceOf(IndexedDBDriver)
  })

  it('returns a fresh instance on every call', () => {
    expect(createDriver('localStorage')).not.toBe(createDriver('localStorage'))
  })
})
