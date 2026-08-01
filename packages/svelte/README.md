# @guideflow/svelte

**A reactive Svelte store for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Svelte adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). `createTourStore()`
projects a `@guideflow/core` instance onto Svelte readable stores and forwards the whole control
surface; `hotspotAction` is a `use:` directive for standalone beacons. Works with Svelte 4 and
Svelte 5.

It ships **no Svelte components** — the spotlight and popover are rendered by core, or by your
own markup driven from `currentStep` / `currentContent`.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

**ESM only.** Svelte itself is ESM-only, so a CJS `require()` entry point could never load;
the one published up to v0.1.9 threw `ERR_REQUIRE_ESM` and has been removed.

## Quick Start

```svelte
<script lang="ts">
  import { createTourStore } from '@guideflow/svelte'
  import type { FlowDefinition } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const tour = createTourStore()

  // `tour` is a plain object whose fields are stores, so `$tour.isActive` does
  // not compile. Destructure the fields you need and prefix those with `$`.
  const { isActive, currentStepIndex, totalSteps } = tour

  // A flow is a state machine. A flat `{ id, steps: [...] }` object is not
  // valid. Mark the last state `final: true`: the tour completes either way,
  // but `final` is what stops the walk that computes `totalSteps`.
  const flow: FlowDefinition = {
    id: 'welcome',
    initial: 'main',
    states: {
      main: {
        steps: [
          {
            id: 'step-1',
            target: '#hero',
            content: { title: 'Hello!', body: 'Let us show you around.' },
            placement: 'bottom',
          },
        ],
        final: true,
      },
    },
  }
</script>

<button on:click={() => tour.start(flow)}>Start Tour</button>
{#if $isActive}
  <span>Step {$currentStepIndex + 1} of {$totalSteps}</span>
{/if}
```

## API

```ts
createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore
```

Pass a config to create an instance internally, pass an existing `GuideFlowInstance` to adopt
one, or pass nothing for defaults.

### TourStore

| Group | Members |
|-------|---------|
| Readable stores | `isActive`, `isPaused`, `currentStepId`, `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`, `locale` |
| Navigation | `start`, `next`, `prev`, `goTo`, `send`, `stop`, `pause`, `resume`, `skip` |
| Flows & config | `createFlow`, `listFlows`, `configure` |
| Standalone UI | `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints` |
| Subsystems | `i18n`, `progress`, `setLocale` |
| Lifecycle | `instance`, `ownsInstance`, `destroy` |

Every readable store is read-only — `set`/`update` are deliberately not exposed.

### hotspotAction

```svelte
<script>
  import { createTourStore, hotspotAction } from '@guideflow/svelte'

  const tour = createTourStore()
  const hotspot = hotspotAction(tour.instance)
</script>

<button use:hotspot={{ title: 'New', body: 'Export now supports CSV.' }}>Export</button>
```

The beacon is removed when the node is destroyed, and replaced when the options change.

Core types are re-exported for convenience: `FlowDefinition`, `Step`, `StepContent`,
`GuidanceContext`, `HotspotOptions`, `HintStep`, `GuideFlowConfig`, `GuideFlowInstance`,
`PopoverPlacement`.

### Notes

- **`destroy()` only disposes what the store owns.** An instance you passed in is left running,
  along with every listener you registered on it; `ownsInstance` tells you which case you are
  in. Up to v0.1.9 `destroy()` tore down a borrowed instance too.
- **The stores reset when a tour ends.** On `tour:complete` / `tour:abandon` everything returns
  to its idle value, so a progress indicator does not stay stuck on the last step.
- **SvelteKit**: core guards every DOM access and injects no styles on the server, so the store
  is safe to create during SSR. Start tours from `onMount`.

## Peer Dependencies

- `svelte` ^4.0.0 || ^5.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
