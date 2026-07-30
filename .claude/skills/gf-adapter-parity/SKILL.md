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

| Capability | React | Vue | Svelte | Notes |
|---|---|---|---|---|
| Provider / plugin | `TourProvider` | `GuideFlowPlugin` | — (store owns instance) | |
| Access raw instance | `useGuideFlow()` | `useGuideFlow()` | `store.instance` | |
| start/stop | | | | |
| next/prev/goTo/send | | | | |
| pause/resume | | | | |
| reactive isActive/index/total | | | | |
| reactive currentStep/currentContent | | | | |
| hotspots | `useHotspot`, `HotspotBeacon` | | | |
| hints | | | | |
| i18n | | | | |
| progress | | | | |
| headless popover component | `GuidePopover`, `TourStep` | none | none | |
| AI chat UI | `ConversationalPanel` | none | none | |
| SSR-safe | | | | |
| cleanup on unmount/dispose | | | | |

Record the real answer per cell (`✅` / `❌` / `partial + why`), then list every `❌` as a gap with the
work needed to close it.

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

- [ ] Reactive state uses `ref`/`shallowRef` and actually updates — event handlers must write to refs.
- [ ] `onScopeDispose` (or `onUnmounted`) removes every listener.
- [ ] `GuideFlowPlugin` provides via a symbol key and `useTour` fails loudly outside it.
- [ ] SSR/Nuxt: no `document` access during setup.
- [ ] Ships the components its `description` and `keywords` advertise — it currently advertises
      "composables and components" and ships only composables.

### Svelte (`packages/svelte`)

- [ ] Stores follow the contract (`subscribe` returns an unsubscribe; initial value emitted
      synchronously).
- [ ] `destroy()` unsubscribes from every core event.
- [ ] Works with Svelte 5 runes as well as Svelte 4 stores (peer range allows both).
- [ ] Decide and document: does `createTourStore` create its own instance, accept one, or both?
      README shows `createTourStore(createGuideFlow())`.
- [ ] Ships the components its `description` advertises — it currently advertises "stores and
      components" and ships only a store. Note `tsup` cannot compile `.svelte` files; shipping real
      components needs `svelte-package`.

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

## When adding a capability to `core`

The definition of done is: core API + tests → React → Vue → Svelte → docs page per adapter →
parity matrix updated here → changeset naming all four packages.
