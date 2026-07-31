# @guideflow/svelte

**A reactive Svelte store for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Svelte adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). One function,
`createTourStore()`, projects a `@guideflow/core` instance onto Svelte readable stores.
Works with Svelte 4 and Svelte 5.

It ships **no Svelte components** — the spotlight and popover are rendered by core.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

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
  // valid, and a flow with no `final: true` state never completes.
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

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `Readable<boolean>` | Whether a tour is currently running |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of the current step |
| `totalSteps` | `Readable<number>` | Number of steps in the active flow state |
| `start(flow, context?)` | `Promise<void>` | Start a flow definition or a registered flow id |
| `next()` | `Promise<void>` | Advance to the next step |
| `prev()` | `Promise<void>` | Go to the previous step |
| `goTo(stepId)` | `Promise<void>` | Jump to a step by ID |
| `send(event)` | `Promise<void>` | Send a state machine event |
| `stop()` | `void` | Stop the active tour |
| `destroy()` | `void` | Detach listeners **and destroy the underlying instance** |
| `instance` | `GuideFlowInstance` | The wrapped instance — use it for `hotspot()`, `hints()`, `i18n`, `progress`, `on()` |

Core types are re-exported for convenience: `FlowDefinition`, `Step`, `StepContent`,
`GuidanceContext`, `HotspotOptions`, `HintStep`, `GuideFlowConfig`, `GuideFlowInstance`,
`PopoverPlacement`.

### Notes

- **`destroy()` also destroys the instance**, including one you passed in. If the instance is
  shared across your app, do not call `destroy()` from a component.
- **The step stores do not reset when a tour ends.** `isActive` returns to `false`, but
  `currentStepId`, `currentStepIndex` and `totalSteps` keep their last rendered values — gate
  progress indicators on `$isActive`.
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
