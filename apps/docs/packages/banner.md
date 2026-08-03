# @guideflow/banner

Docked announcement bar. Guide: [Banners](/guide/banners).

```bash
pnpm add @guideflow/core @guideflow/banner
```

Two entry points. `@guideflow/banner` is headless and touches no DOM;
`@guideflow/banner/widget` is the docked UI, so a host rendering its own bar never bundles it.

`@guideflow/core` is a **peer dependency** at `>=0.1.9 <1.0.0`. There is no size budget or CI size
gate on this package in v1 — unlike core, whose gzip number is a headline promise, this is opt-in
weight in a package you choose to install.

## `createBanners(gf, definitions, options?)`

```ts
function createBanners<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definitions: readonly BannerDefinition<TContext>[],
  options?: BannerOptions,
): BannerController<TContext>
```

Reads storage once on construction and subscribes to `tour:start`, `tour:complete` and
`tour:abandon`. It watches route changes only when some definition declares a `urlPattern` —
patching `history.pushState` for every consumer, including those with no url-scoped banner, would
be a page-global side effect taken for nothing.

`tourActive` is read from `gf.isActive` at derive time rather than tracked by listener order:
listener order flips across a React remount, so inferring "a tour is running" from which handler
fired last is wrong exactly when a host re-mounts.

### `BannerDefinition`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Storage key for the dismissal |
| `title` | `string` | |
| `body` | `string?` | **Plain text**, rendered with `textContent`. Never HTML |
| `tone` | `'neutral' \| 'info' \| 'success' \| 'warning'` | Colour only. No `'error'` — see below |
| `actions` | `BannerAction[]?` | |
| `dismissible` | `boolean?` | Default `true` |
| `targeting` | `BannerTargeting?` | `urlPattern`, `audience`, `schedule`, `priority` |
| `version` | `string \| number?` | Omit and a dismissal is permanent |

There is no `'error'` tone deliberately. An error tone is what makes `role="alert"` look like the
obvious next commit, and `role="alert"` is assertive — it would cut a running tour's step
announcement in half.

### `BannerAction`

`flowId` starts a tour, but never over a running one: `gf.start()` ends the current tour first and
that emits `tour:abandon`, which analytics reads as the user giving up. `onSelect` runs your own
code and wins when both are set. `dismisses: true` records the dismissal **before** the handler
runs, so it survives a handler that navigates away.

## `BannerController`

```ts
subscribe(listener)        // shaped for useSyncExternalStore
getSnapshot()              // referentially stable while nothing changed
getServerSnapshot()        // frozen idle state; SSR and hydration agree
evaluate()                 // score everything; never shows, never writes
dismiss(bannerId)
select(index)              // run an action on the visible banner
setBanners(definitions)    // replace the set. Dropping an id records nothing
reset()                    // clear stored dismissals
refresh()                  // re-read storage; call after context.userId changes
destroy()
```

`getSnapshot().current` is `BannerView | null`, nested rather than flattened, so `if (state.current)`
narrows every field at once. A flat `id: string | null` alongside `title: string | undefined`
narrows nothing under `exactOptionalPropertyTypes` and forces `?? ''` at every render site.

### `evaluate()`

```ts
console.table(banners.evaluate())
// [{ banner: {…}, eligible: false, priority: 0, blockedBy: ['audience'] }]
```

`blockedBy` reuses core's own `BlockReason` union, so "why isn't my banner showing" has the same
answer shape as "why didn't my tour start". This surface has four silent failure modes — not
hydrated, no identity, a guard rejected it, a stored dismissal — and without this they are
indistinguishable from "nothing to show".

## `mountBanner(controller, options?)`

```ts
function mountBanner(controller: BannerController, options?: BannerViewOptions): BannerWidget
```

| Option | Type | Default |
|---|---|---|
| `dock` | `'top' \| 'bottom'` | `'top'` |
| `nonce` | `string?` | CSP nonce, taken once at mount |
| `strings` | `Partial<BannerStrings>?` | `region`, `dismiss` |
| `container` | `HTMLElement?` | `document.body` |

Returns `{ destroy() }`. Outside a browser it is a no-op whose `destroy()` is safe to call.

`dock: 'top'` inserts the bar **first** in `container` so reading order matches visual order
(WCAG 1.3.2). If your page has a skip link, pass `container` and mount inside your own layout.

There is deliberately no `setNonce`: `injectStyles`' de-dupe set is module-level and page-global, so
a second injection for the same id returns early and its nonce is never applied. A setter that only
ever affected the first mount would be worse than not offering one.

## Storage

One record per user under a single-segment suffix on the prefix `progress.resetUser()` sweeps.
`'completed'`, `'caps'` and `'checklist'` are taken by core, targeting and the checklist
respectively; this package owns `'banner'`.

Cross-tab writes are **last-write-wins**, the same limitation `markCompleted` and the frequency caps
carry. Within a tab every write re-reads and merges through one promise chain.

## Related

- [Checklist](/packages/checklist) — the other docked surface
- [Core](/packages/core) — the engine and the targeting matchers this reuses
