# @guideflow/checklist

Docked onboarding checklist. Guide: [Checklist](/guide/checklist).

```bash
pnpm add @guideflow/core @guideflow/checklist
```

Two entry points. `@guideflow/checklist` is headless and touches no DOM;
`@guideflow/checklist/widget` is the docked UI, so a host rendering its own list never bundles it.

`@guideflow/core` is a **peer dependency** at `>=0.1.9 <1.0.0`. There is no size budget or CI size
gate on this package in v1 — unlike core, whose gzip number is a headline promise, this is opt-in
weight in a package you choose to install.

## `createChecklist(gf, definition, options?)`

```ts
function createChecklist<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definition: ChecklistDefinition,
  options?: ChecklistOptions,
): ChecklistController
```

Reads storage once on construction and subscribes to `tour:start`, `tour:complete`,
`tour:abandon` and `progress:discard`. Every handler body is wrapped in `try`/`catch` — core's
emitter has no error isolation, and `step:enter` is emitted inside the try whose catch ends the
tour, so an unguarded listener here could stop a tour painting.

### `ChecklistDefinition`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Key within the stored record |
| `title` | `string` | Panel heading and launcher label |
| `items` | `ChecklistItem[]` | |
| `version` | `string \| number` | Bump on a shape change. A mismatch discards **this list only**, with a `console.warn` |
| `hideWhenComplete` | `boolean` | Default `true`. Surfaces as `state.hidden` |

### `ChecklistItem`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `title` | `string` | |
| `description` | `string` | Optional second line |
| `flowId` | `string` | Ticks from `getCompletedFlows`; `activate()` starts it |
| `requires` | `string[]` | Item ids that must be done first. Followed transitively |
| `onActivate` | `() => void \| Promise<void>` | Runs *instead of* `gf.start(flowId)` when both are set |

### `ChecklistOptions`

| Field | Type | Default | Notes |
|---|---|---|---|
| `anonymousId` | `boolean` | `false` | Mint a first-party id when `context.userId` is unset. Off by default because this package cannot consult `@guideflow/analytics`'s consent and DNT policy |
| `onEvent` | `(e: ChecklistEvent) => void` | — | The analytics seam. Synchronous, isolated in `try`/`catch` |

## `ChecklistController`

| Member | Notes |
|---|---|
| `subscribe(listener)` | Returns an unsubscribe. Pre-bound for `useSyncExternalStore` |
| `getSnapshot()` | Referentially stable while nothing changed |
| `getServerSnapshot()` | Frozen idle state, `hydrated: false`, cached per definition |
| `complete(itemId)` | Manual tick. Idempotent, merge-on-write. **Never** calls `progress.markCompleted` |
| `uncomplete(itemId)` | Removes a **manual** tick only. A flow-derived tick is not ours to remove |
| `activate(itemId)` | `onActivate`, else `gf.start(flowId)`. No-ops when unavailable, done, or `gf.isActive` |
| `setCollapsed(collapsed)` | Persisted |
| `dismiss()` | Persisted; sets `hidden` |
| `reset()` | Clears this list's record. Does **not** touch the completed flows |
| `refresh()` | Re-reads storage and re-derives. Call after your app changes `context.userId` |
| `destroy()` | Releases every tour listener and every subscriber |

## `ChecklistState`

| Field | Type | Notes |
|---|---|---|
| `id` / `title` | `string` | From the definition |
| `items` | `readonly ChecklistItemState[]` | |
| `doneCount` / `totalCount` | `number` | |
| `complete` | `boolean` | |
| `dismissed` / `collapsed` | `boolean` | |
| `hidden` | `boolean` | `dismissed \|\| (complete && hideWhenComplete)` |
| `tourActive` | `boolean` | Read off `gf.isActive`, not inferred from listener order |
| `persisted` | `boolean` | `false` when there is no identity: nothing read, nothing written |
| `hydrated` | `boolean` | `false` until the first storage read resolves. **Render nothing while false** |

### `ChecklistItemState`

`id`, `title`, `description | undefined`, `done`, `source: 'flow' | 'manual' | null`, `available`,
`blockedBy: readonly string[]`, `flowId: string | null`.

## `ChecklistEvent`

```ts
type ChecklistEvent =
  | { type: 'item-complete'; itemId: string; source: 'flow' | 'manual' }
  | { type: 'item-activate'; itemId: string }
  | { type: 'complete' }
  | { type: 'dismiss' }
```

Delivered through `options.onEvent` only. Nothing is emitted on the `TourEvents` bus.

## `deriveChecklist(definition, input)`

The pure core, exported deliberately: no DOM, no async, no `gf`.

```ts
deriveChecklist(definition, {
  completedFlows: await gf.progress.getCompletedFlows(userId),
  manual: { 'data': 1712345678901 },
})
// → { items, doneCount, totalCount, complete }
```

`completedFlows` is filtered to the flow ids the definition declares — the `:completed` array is
shared, and `@guideflow/ai` writes `'step:<id>'` entries into it — and tolerates a non-array.

## `@guideflow/checklist/widget`

### `mountChecklist(controller, options?)`

Returns `{ destroy(): void }`. A no-op outside a browser, returning a view whose `destroy()` is
safe to call.

| Option | Type | Default | Notes |
|---|---|---|---|
| `dock` | `'bottom-end' \| 'bottom-start' \| 'top-end' \| 'top-start'` | `'bottom-end'` | `position: fixed` with logical properties; mirrors under `dir="rtl"` with no extra rules |
| `nonce` | `string` | — | CSP nonce for the injected stylesheet. Taken **once**, at mount |
| `strings` | `Partial<ChecklistStrings>` | English | See [Strings](/guide/checklist#strings) |
| `container` | `HTMLElement` | `document.body` | Portal parent, so it inherits `data-gf-theme` |

There is deliberately no `setNonce`: the de-dupe set inside `injectStyles` is page-global, so a
second injection for the same id returns early and its nonce is never applied.

`destroy()` removes the root, the live region and the stylesheet.

### `ChecklistStrings`

`launcher`, `progressText` (`{done}` / `{total}`), `progressLabel`, `expand`, `collapse`,
`dismiss`, `completed`, `blocked` (`{title}`).

## Styling

The widget reads core's tokens, so `data-gf-theme` on `<html>` themes it for free. One token is
its own:

```css
--gf-z-checklist: 99999;   /* above the hint/hotspot band, BELOW --gf-z-overlay */
```

Override it on `:root`. Keep it below `--gf-z-overlay` (999998) or a running tour stops covering
the checklist and the overlay's modality promise is silently void.
