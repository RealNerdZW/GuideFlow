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

The prefix returned by `key` is suffixed per record, so one user's data shares a
prefix and `gf.progress.resetUser(userId)` can clear it in one go.

### Reserved key suffixes

| Suffix | Owner | Contents |
|---|---|---|
| `<flowId>:snapshot` | core | Resume point for one flow |
| `<flowId>:dismissed` | core | "Don't show again" for one flow |
| `completed` | core | The completed-flows array, entries `flowId` or `flowId@version`. **Reserved** |
| `caps` | `@guideflow/core/targeting` | Frequency caps. **Reserved** |
| `checklist` | `@guideflow/checklist` | Every checklist on the page, in one record |

`gf.progress.getRecord` / `setRecord` let a sibling package store its own record under this
prefix. Use a **single-segment** suffix: every flow-scoped key carries a second segment, so a
one-segment suffix cannot collide with a flow id.

::: danger `completed` and `caps` are taken
`setRecord(userId, 'completed', …)` overwrites core's completed-flows array **byte for byte** —
`getRecord` and `getCompletedFlows` read the identical `{ value, expiresAt }` wrapper — and
`@guideflow/ai` reads that key too. Pick a name nothing else owns.
:::

## What gets written, and when

- **On every navigation** (`start`, `next`, `prev`, `goTo`, `send`) and on
  abandonment, a snapshot of `{ flowId, currentState, stepIndex, stepId, version }`
  is saved. The snapshot's `completed` field is always `false` — it only exists
  while a tour is live.
- **On `tour:complete`**, the flow is added to the completed list — as
  `flowId@version` when the flow declares a `version`, as a bare `flowId` when
  it does not — and the snapshot is deleted. The version is captured *before*
  the active flow is cleared, so the record names the revision the user
  actually finished.
- **On dismissal**, if the flow opted in with `persistDismissal`.

The write happens the moment the **machine** moves, not when the render lands. With
[route waiting](/guide/routing) a render can take seconds, and a tab closed mid-wait
would otherwise lose the advance.

On the next `gf.start(flow)` the engine, in order:

1. returns early if the flow was dismissed;
2. returns early if it was completed **at this flow's `version`** — see
   [Completion is version-scoped](#completion-is-version-scoped);
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

## Completion is version-scoped

Completion is recorded against the version the user actually finished, so
republishing a structurally changed flow reaches the people who completed the
old one. The record is stored as `flowId@version`:

```ts
await gf.progress.markCompleted('user-123', 'onboarding', 'v2')
// stored entry: "onboarding@v2"

await gf.progress.isCompleted('user-123', 'onboarding', 'v2')  // true
await gf.progress.isCompleted('user-123', 'onboarding', 'v3')  // false — v3 shows
```

`version` is optional on both methods. Omitting it on `markCompleted` writes the
bare `flowId`, byte-identical to what this wrote before the change; omitting it
on `isCompleted` asks "has this user finished this flow at *any* version".

`gf.start()` passes `flow.version`, so this is automatic — a flow that carries a
`version` (declared, or stamped by `withFingerprint` / `stringifyFlowFile`) is
shown again after a structural change. A flow with **no** `version` records a
bare id and behaves exactly as before: finishing it once suppresses it forever.

::: warning A record written before this release suppresses every version
A bare `flowId` entry — written by an older build, or by a flow that declares no
`version` — matches **every** version. That is deliberate and conservative:
there is no way to know which revision an unversioned record meant, and an
upgrade must never resurrect a tour somebody already dismissed by completing it.
Those users see the new revision only if you clear the record yourself
(`resetUser`, or a `setRecord(userId, 'completed', …)` rewrite). There is still
no `clearCompleted`.
:::

::: tip `getCompletedFlows` still returns bare ids
Its signature and its output are unchanged: version suffixes are stripped and
duplicates removed, so `['onboarding@v1', 'onboarding@v2']` reads back as
`['onboarding']`. `@guideflow/checklist` matches an item's `flowId` against this
array and `@guideflow/ai` reads the same key — both would silently stop matching
if raw `id@version` entries leaked out.
:::

`@guideflow/core/targeting` calls `isCompleted` **without** a version, so a
`completed` targeting rule suppresses a flow the user finished at any revision.
That is the right default for eligibility: republishing should not re-fire a
frequency-capped campaign.

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

A receiving tab acts on the message **only if** it belongs to the same user, that
tab is currently running the same flow, *and* the snapshot's `version` matches
the flow that tab is running — it then restores the position and re-renders.
Tabs that are idle, running a different tour, or holding a different revision of
the same tour ignore it: nothing is queued and no tour is started remotely. Since
a message is only published when a snapshot is written, sync happens on step
changes, not on arbitrary UI events.

The version check matters once flows are fetched at runtime rather than bundled.
Two tabs of the same build can hold different revisions of the same
`.flow.json`, and restoring one tab's `stepIndex` into the other's machine would
clamp a stale coordinate into a different index space — see
[Hosting flows](/guide/hosting-flows).

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
await gf.progress.isCompleted('user-123', 'welcome')       // any version
await gf.progress.isCompleted('user-123', 'welcome', 'v2') // this version
await gf.progress.markCompleted('user-123', 'welcome', 'v2')
await gf.progress.getCompletedFlows('user-123')          // string[], bare ids
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
