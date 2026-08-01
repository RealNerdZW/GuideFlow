import type { PersistenceDriver } from '@guideflow/core'

/** In-memory driver, verbatim from core's own progress-store suite. */
export function createMemoryDriver(): PersistenceDriver & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    get<T>(key: string): T | null {
      const val = store.get(key)
      return val !== undefined ? (val as T) : null
    },
    set<T>(key: string, value: T): void {
      store.set(key, value)
    },
    remove(key: string): void {
      store.delete(key)
    },
    keys(): string[] {
      return [...store.keys()]
    },
  }
}

/** A one-step flow, enough for start/complete without any DOM target. */
export function makeFlow(id: string) {
  return {
    id,
    initial: 'main',
    states: {
      main: { steps: [{ id: `${id}-s1`, content: { title: id } }], final: true },
    },
  }
}

/** Resolve after the microtask queue and one macrotask turn have drained. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
