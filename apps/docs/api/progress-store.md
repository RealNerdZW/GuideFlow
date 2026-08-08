---
description: ProgressStore API reference — persists and restores GuideFlow tour progress across sessions using localStorage, IndexedDB, or a custom adapter.
keywords: ProgressStore API, GuideFlow persistence, tour progress localStorage, IndexedDB tour store
---

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

## Methods

Reach the store as `gf.progress`. Every method is `async`, because a driver may be.

```ts
// Resume points
saveSnapshot(userId, snapshot)          // written for you as a tour runs
loadSnapshot(userId, flowId)
clearSnapshot(userId, flowId)

// "Don't show again"
markDismissed(userId, flowId)
isDismissed(userId, flowId)
clearDismissed(userId, flowId)

// Completion
markCompleted(userId, flowId, version?)
isCompleted(userId, flowId, version?)
getCompletedFlows(userId)               // bare ids, version suffix stripped
clearCompleted(userId, flowId?)

// Everything, for this user
resetUser(userId)
```

### Letting someone see a tour again

```ts
await gf.progress.clearCompleted(userId, 'welcome')
```

That clears **every** version of `welcome` — asking for a replay means the tour,
not one revision of it — and leaves dismissals, resume points, targeting
frequency caps and [checklist](/guide/checklist) state untouched. Omit the
`flowId` to clear all completions for the user.

Reach for `resetUser(userId)` only when you mean *all* of it: it sweeps every key
under that user's prefix, including the four things above.

### Completion is version-scoped; dismissal is not

This asymmetry is deliberate.

| | Keyed on | A structurally changed republish |
|---|---|---|
| **Completed** | `flowId` + `version` | **Shows again** |
| **Dismissed** | `flowId` | Stays suppressed |

Completing a tour says *I have seen all of this*, so new content is worth
showing. Dismissing one says *do not put this in front of me*, which editing the
tour does not answer. Dismissal is also opt-in per flow
(`persistDismissal`), so nothing is stored unless the flow asked for it.

If you disagree for a particular rewrite, `clearDismissed(userId, flowId)` is one
line — and you know it was a rewrite, where the library cannot: `version` is a
[structural fingerprint](/guide/hosting-flows#versioning-what-happens-to-people-mid-tour)
that deliberately ignores content.

A completion record written **without** a version suppresses every version. That
is the conservative direction: there is no way to know which revision it meant.

## Cross-Tab Sync

`BroadcastSync` keeps progress in sync across browser tabs using the `BroadcastChannel` API. This works automatically when persistence is enabled.

## Progress Data

The store tracks:

- Which flows have been completed
- Current step position in active flows
- Timestamp of last activity
- Custom context data
