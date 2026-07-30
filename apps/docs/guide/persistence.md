---
description: Persist GuideFlow tour progress across sessions using localStorage, IndexedDB, or a custom backend adapter. Users resume where they left off after page reloads.
keywords: GuideFlow persistence, tour progress storage, localStorage product tour, IndexedDB tour state
---

# Persistence

GuideFlow can persist tour progress so users resume where they left off, even across page reloads or browser tabs.

## Configuration

```ts
const gf = createGuideFlow({
  persistence: {
    driver: 'localStorage',  // or 'indexedDB' or a custom driver
    ttl: 30 * 24 * 60 * 60 * 1000,  // 30 days
  },
  context: { userId: 'user-123' },
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `'localStorage' \| 'indexedDB' \| PersistenceDriver` | `'localStorage'` | Storage backend |
| `key` | `(userId: string) => string` | Built-in | Custom storage key factory |
| `ttl` | `number` | `2592000000` (30 days) | Progress expiry in milliseconds |

## Drivers

### localStorage (default)

Simple synchronous storage. Works everywhere but limited to ~5 MB.

```ts
persistence: { driver: 'localStorage' }
```

### IndexedDB

Asynchronous storage with larger capacity. Good for complex progress data.

```ts
persistence: { driver: 'indexedDB' }
```

### Custom Driver

Implement the `PersistenceDriver` interface for custom backends (e.g., a server API):

```ts
const serverDriver: PersistenceDriver = {
  async get(key: string) {
    const res = await fetch(`/api/progress/${key}`)
    return res.json()
  },
  async set(key: string, value: unknown) {
    await fetch(`/api/progress/${key}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    })
  },
  async remove(key: string) {
    await fetch(`/api/progress/${key}`, { method: 'DELETE' })
  },
}

const gf = createGuideFlow({
  persistence: { driver: serverDriver },
})
```

## Cross-Tab Sync

GuideFlow uses `BroadcastChannel` to sync tour state across browser tabs. When a user completes a step in one tab, all other tabs update automatically.

This requires `context.userId` to be set — the channel is keyed by user, and persistence is inert without an id:

```ts
const gf = createGuideFlow({ context: { userId: 'user-123' } })
```

Snapshots belonging to a different flow are ignored, so two tabs running different tours will not interfere.

## Don't Show Again

Set `persistDismissal: true` on a flow to permanently suppress it once the user dismisses it — via <kbd>Escape</kbd>, the Skip button, or a backdrop click:

```ts
await gf.start({
  id: 'welcome',
  initial: 'main',
  persistDismissal: true,
  states: { main: { steps: [...], final: true } },
})
```

This is **off by default**: closing a tour once usually means "not now", not "never again". It also requires `context.userId`.

To implement your own policy, listen for `tour:dismiss` — emitted only on a user dismissal, never on a programmatic `stop()`:

```ts
gf.on('tour:dismiss', ({ flowId, stepId, stepIndex }) => {
  if (stepIndex > 2) void gf.progress.markDismissed('user-123', flowId)
})
```

Completed tours are suppressed automatically — once `tour:complete` fires for a flow, `start()` will not run it again for that user.

## Custom Storage Keys

Override the default key generation:

```ts
persistence: {
  driver: 'localStorage',
  key: (userId) => `myapp_tour_progress_${userId}`,
}
```

## TTL (Time to Live)

Progress data expires after the TTL period. Once expired, users restart the tour from the beginning:

```ts
persistence: {
  ttl: 7 * 24 * 60 * 60 * 1000,  // 7 days
}
```

Set `ttl: 0` to disable expiry (progress persists indefinitely).
