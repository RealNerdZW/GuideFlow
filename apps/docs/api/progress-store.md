# ProgressStore

The `ProgressStore` handles persisting and restoring tour progress across sessions.

## Configuration

```ts
const gf = createGuideFlow({
  persistence: {
    driver: 'localStorage',
    ttl: 30 * 24 * 60 * 60 * 1000,
    key: (userId) => `gf_progress_${userId}`,
  },
  context: { userId: 'user-123' },
})
```

## PersistenceConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `'localStorage' \| 'indexedDB' \| PersistenceDriver` | `'localStorage'` | Storage backend |
| `key` | `(userId: string) => string` | Built-in | Storage key factory |
| `ttl` | `number` | `2592000000` (30 days) | Expiry in milliseconds |

## PersistenceDriver Interface

Implement this interface for custom storage backends:

```ts
interface PersistenceDriver {
  get(key: string): unknown | Promise<unknown>
  set(key: string, value: unknown): void | Promise<void>
  remove(key: string): void | Promise<void>
}
```

## Built-in Drivers

### localStorage

Synchronous, ~5 MB limit. Good for simple use cases.

### IndexedDB

Asynchronous, larger capacity. Good for complex progress data.

## Cross-Tab Sync

`BroadcastSync` keeps progress in sync across browser tabs using the `BroadcastChannel` API. This works automatically when persistence is enabled.

## Progress Data

The store tracks:

- Which flows have been completed
- Current step position in active flows
- Timestamp of last activity
- Custom context data
