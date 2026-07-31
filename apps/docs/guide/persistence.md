---
description: Persist GuideFlow tour progress across sessions using localStorage, IndexedDB, or a custom driver. Users resume where they left off after a page reload.
keywords: GuideFlow persistence, tour progress storage, localStorage product tour, IndexedDB tour state
---

# Persistence

GuideFlow can persist tour progress so users resume where they left off after a
reload.

## Requires a user id

Persistence is keyed by user and is **completely inert without
`context.userId`**. No snapshot is written, no completed/dismissed record is
read, and no cross-tab channel is opened.

```ts
const gf = createGuideFlow({
  persistence: {
    driver: 'localStorage',          // or 'indexedDB', or your own driver
    ttl: 30 * 24 * 60 * 60 * 1000,   // 30 days
  },
  context: { userId: 'user-123' },
})
```

`gf.configure({ persistence })` re-applies the whole persistence config at
runtime; `gf.configure({ context })` merges a context patch, which is how you set
`userId` once the user has signed in.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `'localStorage' \| 'indexedDB' \| PersistenceDriver` | `'localStorage'` | Storage backend |
| `key` | `(userId: string) => string` | `` (userId) => `gf:${userId}:progress` `` | Key prefix factory |
| `ttl` | `number` | `2592000000` (30 days) | Expiry in milliseconds |

The prefix returned by `key` is suffixed per record —
`…:<flowId>:snapshot`, `…:<flowId>:dismissed`, `…:completed` — so one user's
data shares a prefix and `gf.progress.resetUser(userId)` can clear it in one go.

## What gets written, and when

- **On every navigation** (`start`, `next`, `prev`, `goTo`, `send`) and on
  abandonment, a snapshot of `{ flowId, currentState, stepIndex, stepId, version }`
  is saved. The snapshot's `completed` field is always `false` — it only exists
  while a tour is live.
- **On `tour:complete`**, the flow id is added to the completed list and the
  snapshot is deleted.
- **On dismissal**, if the flow opted in with `persistDismissal`.

The write happens the moment the **machine** moves, not when the render lands. With
[route waiting](/guide/routing) a render can take seconds, and a tab closed mid-wait
would otherwise lose the advance.

On the next `gf.start(flow)` the engine, in order:

1. returns early if the flow was dismissed;
2. returns early if it was completed;
3. **discards the snapshot if `version` does not match the flow's** — see below;
4. otherwise restores, preferring `stepId` over `stepIndex`, and re-renders.

## Versioning a flow

A stored `{ state, stepIndex }` is a coordinate into a structure. Rename a state,
delete a step or reorder two, redeploy — and every returning user resumes into a
position that means something different than it did when it was written.

Two independent gates prevent that, cheapest first.

**`stepId` is preferred over `stepIndex`.** An index means nothing once a step has
been inserted above it. If the stored step id no longer exists anywhere in that
state, the resume is **rejected** rather than clamped — there is no honest
coordinate to fall back to.

**An explicit `version` catches the rest**, including a renamed state:

```ts
gf.start({ id: 'onboarding', version: 'v2', initial: 'intro', states: { /* … */ } })
```

Or derive one from the flow's own shape, so you cannot forget to bump it:

```ts
import { withFingerprint } from '@guideflow/core/versioning'

const flow = withFingerprint({ id: 'onboarding', initial: 'intro', states: { /* … */ } })
```

`flowFingerprint` hashes only what changes the meaning of a coordinate — `initial`,
state names, `final` flags, step ids **in order**, and the transition table. It
ignores everything cosmetic: content, target, placement, padding, media, `showIf`,
`onEntry`/`onExit`, `context`, `targeting`, and the flow id itself. Fixing a typo
does not restart anybody's tour.

When a snapshot is thrown away, the tour starts from the beginning and emits:

```ts
gf.on('progress:discard', ({ flowId, reason }) => {
  // reason: 'version'   — the flow's version changed
  //       | 'structure' — the version matched but the position did not survive
})
```

::: warning `isCompleted` is version-blind
Completion is keyed on `flowId` alone, and there is no `clearCompleted`. Shipping
v2 of a flow will never re-show it to anyone who completed v1.
:::

## Drivers

### localStorage (default)

Synchronous, JSON-serialised, ~5 MB. Values that do not survive `JSON.stringify`
round-tripping are not supported.

```ts
persistence: { driver: 'localStorage' }
```

### IndexedDB

Asynchronous, larger capacity, structured-clone storage. Database `guideflow`,
object store `progress`.

```ts
persistence: { driver: 'indexedDB' }
```

Both built-in drivers no-op outside the browser, so SSR renders are safe.

### Custom Driver

```ts
import type { PersistenceDriver } from '@guideflow/core'

const serverDriver: PersistenceDriver = {
  async get<T>(key: string): Promise<T | null> {
    const res = await fetch(`/api/progress/${encodeURIComponent(key)}`)
    return res.ok ? ((await res.json()) as T) : null
  },
  async set<T>(key: string, value: T): Promise<void> {
    await fetch(`/api/progress/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    })
  },
  async remove(key: string): Promise<void> {
    await fetch(`/api/progress/${encodeURIComponent(key)}`, { method: 'DELETE' })
  },
  // Optional, but resetUser() needs it to enumerate what to delete — without it
  // a custom driver's records are never cleared. Both built-in drivers have it.
  async keys(): Promise<string[]> {
    return (await (await fetch('/api/progress')).json()) as string[]
  },
}

const gf = createGuideFlow({
  persistence: { driver: serverDriver },
  context: { userId: 'user-123' },
})
```

Values handed to `set` are `{ value, expiresAt }` wrappers. Expiry is enforced by
GuideFlow on read, not by the driver.

## Cross-Tab Sync

When `context.userId` is set and the browser supports `BroadcastChannel`,
GuideFlow publishes each saved snapshot on the `guideflow:progress` channel.

A receiving tab acts on the message **only if** it belongs to the same user *and*
that tab is currently running the same flow — it then restores the position and
re-renders. Tabs that are idle, or running a different tour, ignore it: nothing
is queued and no tour is started remotely. Since a message is only published when
a snapshot is written, sync happens on step changes, not on arbitrary UI events.

```ts
const gf = createGuideFlow({ context: { userId: 'user-123' } })
```

## Don't Show Again

Set `persistDismissal: true` on a flow to permanently suppress it once the user
dismisses it — via <kbd>Escape</kbd>, the Skip button, or a backdrop click:

```ts
await gf.start({
  id: 'welcome',
  initial: 'main',
  persistDismissal: true,
  states: { main: { steps: [/* ... */], final: true } },
})
```

This is **off by default**: closing a tour once usually means "not now", not
"never again". It also requires `context.userId`.

To implement your own policy, listen for `tour:dismiss` — emitted only on a user
dismissal, never on a programmatic `stop()`:

```ts
gf.on('tour:dismiss', ({ flowId, stepId, stepIndex }) => {
  if (stepIndex > 2) void gf.progress.markDismissed('user-123', flowId)
})
```

## Reading and clearing progress yourself

`gf.progress` is the live `ProgressStore`:

```ts
await gf.progress.isCompleted('user-123', 'welcome')     // boolean
await gf.progress.getCompletedFlows('user-123')          // string[]
await gf.progress.isDismissed('user-123', 'welcome')     // boolean
await gf.progress.clearDismissed('user-123', 'welcome')  // let it run again
await gf.progress.loadSnapshot('user-123', 'welcome')    // FlowSnapshot | null
await gf.progress.clearSnapshot('user-123', 'welcome')   // restart from step 0
await gf.progress.resetUser('user-123')                  // clear everything
```

Every method is async, including with the localStorage driver.

## Custom Storage Keys

```ts
persistence: {
  driver: 'localStorage',
  key: (userId) => `myapp_tour_progress_${userId}`,
}
```

## TTL (Time to Live)

Records carry an absolute expiry stamped at write time. Once expired they are
removed on the next read and the tour restarts from the beginning:

```ts
persistence: {
  ttl: 7 * 24 * 60 * 60 * 1000,  // 7 days
}
```

`ttl: 0` — or any non-positive value, or `Infinity` — means **never expires**.
The expiry applies to dismissals and the completed list as well as to snapshots,
so a short TTL makes "don't show again" temporary.
