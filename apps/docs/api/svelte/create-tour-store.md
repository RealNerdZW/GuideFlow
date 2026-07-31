---
description: "createTourStore() API reference — Svelte store-based tour control for @guideflow/svelte."
keywords: createTourStore, GuideFlow Svelte, Svelte store, @guideflow/svelte
---

# createTourStore()

`createTourStore()` wraps a GuideFlow instance and projects its state onto individual
`Readable` Svelte stores, while forwarding the whole control surface — navigation,
pause/resume, flows, hotspots, hints and i18n.

The package ships **no components**. You render your own markup and drive it from the store,
or let `@guideflow/core`'s default renderer draw the popover for you.

## Signature

```ts
import { createTourStore } from '@guideflow/svelte'

function createTourStore(
  configOrInstance?: GuideFlowConfig | GuideFlowInstance
): TourStore
```

### Parameters

| Parameter          | Type                                   | Description |
|--------------------|----------------------------------------|-------------|
| `configOrInstance` | `GuideFlowConfig \| GuideFlowInstance` | Optional. A [`GuideFlowConfig`](../create-guide-flow) creates a new instance internally; an existing `GuideFlowInstance` is adopted as-is. Omitting it creates an instance with default config. |

Which one you pass decides who owns the instance, and therefore what `destroy()` tears down —
see [Cleanup](#cleanup).

## TourStore

### Readable state

Each of these is a separate Svelte store — not a field on one store.

| Property           | Type                              | Description |
|--------------------|-----------------------------------|-------------|
| `isActive`         | `Readable<boolean>`               | Whether a tour is currently active |
| `isPaused`         | `Readable<boolean>`               | Whether the active tour is paused |
| `currentStepId`    | `Readable<string \| null>`        | ID of the current step |
| `currentStepIndex` | `Readable<number>`                | Zero-based index of the current step within the active state |
| `totalSteps`       | `Readable<number>`                | Number of steps in the active flow state |
| `currentStep`      | `Readable<Step \| null>`          | The step object on screen — the same object as `instance.currentStep` |
| `currentContent`   | `Readable<StepContent \| null>`   | Its resolved content, with any async `content` already awaited |
| `locale`           | `Readable<string>`                | Active i18n locale — see [`setLocale()`](#i18n-and-progress) |

They are read-only projections: `set` and `update` are deliberately not exposed, so a
component cannot lie to the engine.

::: tip Values reset when a tour ends
On `tour:complete` and `tour:abandon` every store returns to its idle value — `isActive` and
`isPaused` to `false`, `currentStepId`/`currentStep`/`currentContent` to `null`,
`currentStepIndex` and `totalSteps` to `0`. Before v0.2.0 they latched the last rendered step,
so a progress indicator stayed stuck on "2 of 2".
:::

### Navigation

| Method   | Signature                                                                     | Description |
|----------|-------------------------------------------------------------------------------|-------------|
| `start`  | `(flow: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a flow definition, or a flow id previously registered with `createFlow()` |
| `next`   | `() => Promise<void>`                                                         | Advance to the next step |
| `prev`   | `() => Promise<void>`                                                         | Go to the previous step |
| `goTo`   | `(stepId: string) => Promise<void>`                                           | Jump to a step by ID |
| `send`   | `(event: string) => Promise<void>`                                            | Send a state machine event |
| `stop`   | `() => void`                                                                  | End the active tour programmatically |
| `pause`  | `() => void`                                                                  | Hide the tour UI without abandoning the flow |
| `resume` | `() => void`                                                                  | Re-show a paused tour at the step it was paused on |
| `skip`   | `() => void`                                                                  | Dismiss the tour the way a user would — emits `step:skip`, `tour:dismiss`, then `tour:abandon` |

`stop()` and `skip()` both end the tour, but only `skip()` reports it as a *user* dismissal, so
only `skip()` triggers a flow's `persistDismissal` "don't show again" behaviour.

### Flows and configuration

| Method       | Signature                                        | Description |
|--------------|--------------------------------------------------|-------------|
| `createFlow` | `(definition: FlowDefinition) => FlowDefinition` | Register a flow so `start('id')` can resolve it |
| `listFlows`  | `() => FlowDefinition[]`                         | Every flow registered on this instance |
| `configure`  | `(patch: Partial<GuideFlowConfig>) => void`      | Patch the instance config after creation |

### Standalone UI

| Method          | Signature                                                        | Description |
|-----------------|------------------------------------------------------------------|-------------|
| `hotspot`       | `(target: string \| Element, options?: HotspotOptions) => string` | Add a persistent beacon; returns its id (`''` during SSR or when the target is not found) |
| `removeHotspot` | `(id: string) => void`                                           | Remove a beacon by id |
| `hints`         | `(steps: HintStep[]) => void`                                    | Register hint badges |
| `showHints`     | `() => void`                                                     | Show every registered hint badge |
| `hideHints`     | `() => void`                                                     | Hide them again |

For a hotspot whose lifetime should follow an element, prefer the
[`hotspotAction`](#hotspotaction) `use:` directive.

::: warning Hints have no per-hint removal
Core's `HintSystem` can register and toggle hints, but only clears them wholesale when the
instance is destroyed. Register hints once, at app scope, rather than per component.
:::

### i18n and progress

| Property    | Type                       | Description |
|-------------|----------------------------|-------------|
| `i18n`      | `I18nRegistry`             | The instance's registry — `register()`, `use()`, `t()` |
| `progress`  | `ProgressStore`            | The instance's persistence store |
| `setLocale` | `(locale: string) => void` | Calls `i18n.use()` **and** updates the `locale` store |

Prefer `setLocale()` over `i18n.use()`: the registry emits no events, so a direct `use()` call
cannot update `locale`. Neither re-renders a popover that is already on screen — a locale
change applies to the next step rendered.

### instance and ownership

| Property       | Type                | Description |
|----------------|---------------------|-------------|
| `instance`     | `GuideFlowInstance` | The underlying GuideFlow instance — use it for `on()` and anything not projected |
| `ownsInstance` | `boolean`           | `true` when the store created the instance, `false` when one was handed in |
| `destroy`      | `() => void`        | Detach the store's listeners, and destroy the instance **only if the store owns it** |

## Using the stores in a component

Svelte's `$` auto-subscription applies to an **identifier that is itself a store**. `tour` is a
plain object, so `$tour.isActive` is a compile error. Destructure the fields you need first:

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const tour = createTourStore({ debug: true })
  const { isActive, isPaused, currentStepIndex, totalSteps } = tour

  const flow = {
    id: 'onboarding',
    initial: 'main',
    states: {
      main: {
        steps: [
          { id: 'step-1', target: '#hero', content: { title: 'Welcome', body: 'Start here.' } },
          { id: 'step-2', target: '#nav', content: { title: 'Navigate', body: 'Everything lives here.' } },
        ],
        final: true,
      },
    },
  }
</script>

<button on:click={() => tour.start(flow)}>Start Tour</button>

{#if $isActive}
  <p>Step {$currentStepIndex + 1} of {$totalSteps}</p>
  <button on:click={() => tour.prev()}>Back</button>
  <button on:click={() => tour.next()}>Next</button>
  {#if $isPaused}
    <button on:click={() => tour.resume()}>Resume</button>
  {:else}
    <button on:click={() => tour.pause()}>Pause</button>
  {/if}
  <button on:click={() => tour.stop()}>Close</button>
{/if}
```

## Rendering your own popover

`currentStep` and `currentContent` update on `step:enter`, so they are always in step with
core's own renderer:

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  const { isActive, isPaused, currentContent } = tour
</script>

{#if $isActive && !$isPaused && $currentContent}
  <aside role="dialog">
    <h2>{$currentContent.title}</h2>
    <p>{$currentContent.body}</p>
    <button on:click={() => tour.next()}>Next</button>
  </aside>
{/if}
```

To render *only* your own popover, pass a custom `renderer` implementing `RendererContract`
when the instance is created — core's `DefaultRenderer` will otherwise draw one too.

## hotspotAction

A `use:` directive whose hotspot lives exactly as long as the node it is applied to.

```ts
import { hotspotAction } from '@guideflow/svelte'

function hotspotAction(gf: GuideFlowInstance): (
  node: Element,
  options?: HotspotOptions,
) => { update: (options?: HotspotOptions) => void; destroy: () => void }
```

```svelte
<script>
  import { createTourStore, hotspotAction } from '@guideflow/svelte'

  const tour = createTourStore()
  const hotspot = hotspotAction(tour.instance)
</script>

<button use:hotspot={{ title: 'New', body: 'Export now supports CSV.' }}>Export</button>
```

Changing the options object replaces the beacon; destroying the node removes it. Listen for
clicks on the instance: `tour.instance.on('hotspot:open', ({ id }) => …)`.

## Wrapping an existing instance

```svelte
<script>
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'

  const gf = createGuideFlow({ context: { userId: 'u_123' } })
  const tour = createTourStore(gf)   // tour.ownsInstance === false
</script>
```

The store stays in sync even when the instance is driven directly (`gf.next()`), because it
subscribes to core's `tour:start`, `tour:complete`, `tour:abandon`, `tour:pause`,
`tour:resume`, `step:enter` and `step:exit` events.

## Cleanup

`destroy()` always removes the store's own event subscriptions. Whether it also destroys the
instance depends on who created it:

| How the store was created            | `ownsInstance` | `destroy()` calls `instance.destroy()` |
|--------------------------------------|----------------|----------------------------------------|
| `createTourStore()`                  | `true`         | yes                                    |
| `createTourStore({ debug: true })`   | `true`         | yes                                    |
| `createTourStore(existingInstance)`  | `false`        | no                                     |

```svelte
<script>
  import { onDestroy } from 'svelte'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  onDestroy(() => tour.destroy())
</script>
```

Before v0.2.0 `destroy()` tore down a borrowed instance too, so disposing one component's store
silently killed a GuideFlow instance the rest of the app was still using — along with every
listener the host had registered on it. An adopted instance is now left running, and remains
yours to destroy.

`destroy()` is idempotent.

## Module format

`@guideflow/svelte` is **ESM only**. Svelte itself is ESM-only — `svelte/store` has no `require`
condition in either Svelte 4 or Svelte 5 — so the CJS bundle published up to v0.1.9 threw
`ERR_REQUIRE_ESM` the moment it was loaded. The dead `require` entry point has been removed
rather than left advertised. Import it from ESM, or from a bundler that resolves the `import`
condition.

## See also

- [Svelte guide](/guide/svelte)
- [createGuideFlow()](../create-guide-flow)
- [FlowDefinition](../flow-definition)
