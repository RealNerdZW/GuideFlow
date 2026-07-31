---
name: gf-adapter-parity
description: Check that the React, Vue and Svelte adapters expose an equivalent capability surface over @guideflow/core, and that each handles framework lifecycle correctly (cleanup, SSR, reactivity, StrictMode). Use when adding an API to core, adding or changing an adapter, writing a new framework adapter, or when asked why a feature works in React but not Vue/Svelte.
---

# /gf-adapter-parity — adapter capability parity

Every capability that reaches users through one adapter should reach them through all of them, or the
asymmetry should be a documented, deliberate decision.

## The core surface adapters wrap

From `GuideFlowInstance` (`packages/core/src/index.ts`):

**Lifecycle** `start` · `stop` · `destroy` · `configure`
**Navigation** `next` · `prev` · `goTo` · `send` · `pause` · `resume` · `skip`
**State (readonly)** `isActive` · `currentStepId` · `currentStepIndex` · `totalSteps` ·
`currentStep` · `currentContent`
**Flows** `createFlow` · `listFlows`
**Standalone UI** `hotspot` · `removeHotspot` · `hints` · `showHints` · `hideHints`
**Subsystems** `i18n` · `progress`
**Events** the full `TourEvents` map via `on()`

## Parity matrix — fill this in on every audit

Record the real answer per cell (`✅` / `❌` / `partial + why`), then list every `❌` as a gap with the
work needed to close it.

### Baseline — 2026-07-30, before Phase 5.2

| Capability | React | Vue | Svelte | Notes |
|---|---|---|---|---|
| Provider / plugin | ✅ `TourProvider` | ✅ `GuideFlowPlugin` | ✅ store owns instance | |
| Access raw instance | ✅ `useGuideFlow()` | ✅ `useGuideFlow()` | ✅ `store.instance` | |
| start/stop | ✅ | ✅ | ✅ | |
| next/prev/goTo/send | ✅ | ✅ | ✅ | |
| pause/resume | ❌ | ❌ | ❌ | `adapters-no-pause-resume-anywhere`. Core has no `isPaused` getter either. |
| skip | ❌ | ❌ | ❌ | On `GuideFlowInstance` since Phase 1; no adapter forwards it. |
| reactive isActive/index/total | partial | partial | partial | All three latch stale step values after `tour:complete`/`tour:abandon` (core emits *before* it nulls the machine). React additionally reads mutable engine state with plain `useState` — `react-no-usesyncexternalstore-tearing`. |
| reactive currentStep/currentContent | ❌ | ❌ | ❌ | `adapters-no-hints-progress-i18n-listflows-surface` |
| createFlow / listFlows | ❌ | ❌ | ❌ | Reachable only off the raw instance. |
| configure | ❌ | ❌ | ❌ | React freezes `config` in a ref — `react-provider-ignores-config-changes`. |
| hotspots | partial `useHotspot`, `HotspotBeacon` | ❌ | ❌ | React's `useHotspot` returns `id: null` always — `react-usehotspot-returns-null-id`. |
| hints | ❌ | ❌ | ❌ | |
| i18n | ❌ | ❌ | ❌ | `GuidePopover` reads the `defaultI18n` singleton, not `instance.i18n`. |
| progress | ❌ | ❌ | ❌ | |
| headless popover component | ✅ `GuidePopover`, `TourStep` | none | none | React's duplicates core's `DefaultRenderer` — two stacked `aria-modal` dialogs. |
| AI chat UI | ✅ `ConversationalPanel` | none | none | |
| SSR-safe | partial | ✅ | ✅ | React ships no `'use client'` directive despite documented App Router support. |
| cleanup on unmount/dispose | partial | ✅ `onScopeDispose` | partial | React's provider never destroys the instance it created; Svelte's `destroy()` destroys an instance it may not own. |
| dual ESM+CJS build that runs | ✅ | ✅ | ❌ | `svelte-cjs-build-cannot-run` — `require('svelte/store')` throws `ERR_REQUIRE_ESM` on every Node in the declared `>=18` range below 22.12. |

### Current — 2026-07-31, after Phase 5.2 (Vue + Svelte only; React is Phase 5.1)

| Capability | React | Vue | Svelte | Notes |
|---|---|---|---|---|
| Provider / plugin | ✅ `TourProvider` | ✅ `GuideFlowPlugin` | ✅ store owns instance | Vue's `$guideflow` is now typed via `ComponentCustomProperties`. |
| Access raw instance | ✅ `useGuideFlow()` | ✅ `useGuideFlow()` / `tour.instance` | ✅ `store.instance` | |
| start/stop | ✅ | ✅ | ✅ | |
| next/prev/goTo/send | ✅ | ✅ | ✅ | |
| pause/resume | ❌ | ✅ + reactive `isPaused` | ✅ + `isPaused` store | Updated from `tour:pause`/`tour:resume`, but seeded and re-read from core's `isPaused` getter (added 2026-07-31), so a consumer created while a tour is already paused is correct. |
| skip | ❌ | ✅ | ✅ | |
| reactive isActive/index/total | partial | ✅ resets to idle on tour end | ✅ resets to idle on tour end | |
| reactive currentStep/currentContent | ❌ | ✅ `shallowRef` | ✅ `Readable` | |
| createFlow / listFlows | ❌ | ✅ | ✅ | |
| configure | ❌ | ✅ | ✅ | |
| hotspots | partial | ✅ `tour.hotspot()` + `useHotspot()` composable | ✅ `store.hotspot()` / `removeHotspot()` | Vue's `useHotspot` takes a template ref and removes on scope dispose. |
| hints | ❌ | ✅ `tour.hints/showHints/hideHints` + `useHints()` | ✅ `store.hints/showHints/hideHints` | |
| i18n | ❌ | ✅ `tour.i18n`, reactive `locale`, `setLocale()` | ✅ `store.i18n`, `locale` store, `setLocale()` | `locale` only tracks changes made through `setLocale()`; calling `i18n.use()` directly bypasses it (the registry emits no events). |
| progress | ❌ | ✅ `tour.progress` | ✅ `store.progress` | |
| headless popover component | ✅ `GuidePopover`, `TourStep` | none — deliberate | none — deliberate | Svelte components need `svelte-package`, not `tsup`. Descriptions/keywords no longer claim components. |
| AI chat UI | ✅ `ConversationalPanel` | none | none | |
| SSR-safe | partial | ✅ | ✅ | |
| cleanup on unmount/dispose | partial | ✅ `onScopeDispose` | ✅ `destroy()` only disposes an instance it created | |
| dual ESM+CJS build that runs | ✅ | ✅ | ✅ ESM-only, honestly declared | Svelte's dead `require` entry point was removed rather than faked. |

Remaining `❌`s all sit in React and are owned by Phase 5.1.

## Per-framework correctness checks

### React (`packages/react`)

- [ ] `TourProvider` **destroys** the instance it created on unmount. It currently creates one via
      `useMemo` and never calls `destroy()` — that leaks document listeners, injected styles and DOM
      nodes across mounts.
- [ ] An externally supplied `instance` prop is **not** destroyed by the provider (the caller owns it).
- [ ] `config` changes after first render are handled or explicitly documented as ignored
      (`configRef` freezes the first value).
- [ ] StrictMode double-invocation does not produce two instances or double subscriptions.
- [ ] Hooks subscribe through `useSyncExternalStore`, or otherwise guarantee no tearing and no stale
      closures; every subscription is cleaned up.
- [ ] `GuidePopover` re-renders on `step:enter` and reads `currentStep`/`currentContent` rather than
      keeping a parallel copy.
- [ ] `ConversationalPanel` aborts in-flight AI requests on unmount, shows loading and error states,
      and **never** renders model output as HTML.
- [ ] Works under React 19 (the peer range allows `^19`).

### Vue (`packages/vue`)

- [x] Reactive state uses `ref`/`shallowRef` and actually updates — event handlers must write to refs.
      `currentStep`/`currentContent` are `shallowRef`s exposed through `computed()`, not `readonly()`:
      `readonly()` returns a *deep* readonly proxy, which would wrap the step's own callbacks and
      break identity against `instance.currentStep`.
- [x] `onScopeDispose` (or `onUnmounted`) removes every listener. Must be `onScopeDispose` —
      `onUnmounted` silently registers nothing inside a bare `effectScope()` (Pinia store).
- [x] `GuideFlowPlugin` provides via a symbol key and `useTour` fails loudly outside it.
- [x] SSR/Nuxt: no `document` access during setup. `useHotspot` defers to a `flush: 'post'` watcher
      or `nextTick`, and core's `hotspot()` returns `''` on the server anyway.
- [x] `$guideflow` is typed via a `ComponentCustomProperties` augmentation in `plugin.ts`. Pinned by
      an Options API test in `src/__tests__/use-tour.test.ts` — `tsc --noEmit` covers `src/__tests__`,
      so dropping the augmentation fails type-check, not just the test.
- [x] Ships the components its `description` and `keywords` advertise — **deliberately none**. Phase 4
      corrected the description; the tour UI is core's renderer or your own markup driven from
      `currentStep`/`currentContent`.

### Svelte (`packages/svelte`)

- [x] Stores follow the contract (`subscribe` returns an unsubscribe; initial value emitted
      synchronously).
- [x] `destroy()` unsubscribes from every core event.
- [ ] Works with Svelte 5 runes as well as Svelte 4 stores (peer range allows both). `svelte/store`
      exists in both majors and is all the package uses, but the devDependency is Svelte 4.2 and
      nothing is tested against 5. **Still unverified.**
- [x] Decide and document: `createTourStore` does **both**. It creates its own instance from a config
      (or from nothing), or adopts one passed in. `ownsInstance` reports which, and `destroy()`
      disposes the instance only when it owns it.
- [x] Ships the components its `description` advertises — **deliberately none**. `tsup` cannot compile
      `.svelte`; real components need `svelte-package`. The idiomatic substitute shipped instead is
      `hotspotAction`, a `use:` directive, which is plain TypeScript.
- [x] The build format matches reality: ESM only, because Svelte is ESM only.

## Missing adapters

Not gaps in parity, but gaps in reach. Ranked by likely adoption impact:

1. **Plain `<script>` / CDN** — `core` already emits an IIFE global build; it is undocumented and
   untested. Cheapest win available.
2. **Angular** — largest un-served framework audience for tour libraries.
3. **Next.js App Router / RSC** guidance — `'use client'` boundaries, route-change handling.
4. **Nuxt module** — auto-import + SSR-safe plugin registration.
5. **SvelteKit** guidance.
6. **Solid / Preact** — small adapters, small audience.
7. **Web component** — one wrapper serves every framework at once.

## Core gaps that force adapters to improvise

Found while closing Phase 5.2. Each one makes an adapter do something it should not have to:

1. ~~**No `isPaused` getter.**~~ **Closed 2026-07-31.** `TourEngine` kept `_paused` private, so every
   adapter derived paused-ness from `tour:pause` / `tour:resume` into a parallel boolean seeded with
   a literal `false` — wrong for any consumer created *after* the pause. `isPaused` is now a getter
   on `TourEngine` and a `readonly` field on `GuideFlowInstance`; Vue and Svelte seed their
   ref/store from `gf.isPaused` and read it in their pause/resume handlers. Adapters still keep a
   local ref/store — the getter is not reactive, so the events are still what drives an update.
   React (Phase 5.1) has no `isPaused` at all yet.
2. **`_doEnd()` emits before it clears state.** `tour:complete` / `tour:abandon` fire while
   `_machine`, `_currentStep` and `_currentContent` are still set, so any handler that reads the
   instance sees the last live step. Every adapter now hard-codes the idle values on those two
   events. Emitting after the reset — or adding a `tour:idle` event — would remove the duplication.
3. **`HintSystem` has no `unregister(id)`.** Hints can be registered and toggled, but only cleared
   wholesale via `destroy()`, which belongs to the instance. That is why neither adapter ships a
   scope-bound `useHints`/hints action the way both ship one for hotspots.
4. **`rerender()` is on the `TourEngine` prototype but absent from `GuideFlowInstance`.** It is
   reachable at runtime and invisible to TypeScript, so `setLocale()` cannot repaint the live
   popover without an `any` cast.

## When adding a capability to `core`

The definition of done is: core API + tests → React → Vue → Svelte → docs page per adapter →
parity matrix updated here → changeset naming all four packages.
