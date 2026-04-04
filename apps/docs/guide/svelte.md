# Svelte

GuideFlow provides a store-based reactive API for Svelte 4 and 5.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

## Quick Start

```svelte
<script lang="ts">
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const store = createTourStore(createGuideFlow())
  const { isActive, currentStepIndex, totalSteps, start } = store

  const flow = {
    id: 'welcome',
    initial: 'main',
    states: {
      main: {
        steps: [
          {
            id: 'step-1',
            content: { title: 'Hello!' },
            target: '#hero',
            placement: 'bottom',
          },
        ],
        final: true,
      },
    },
  }
</script>

<button on:click={() => start(flow)}>Start Tour</button>
{#if $isActive}
  <span>Step {$currentStepIndex + 1} of {$totalSteps}</span>
{/if}
```

## createTourStore API

`createTourStore(instance)` returns a `TourStore` with Svelte-compatible readable stores:

### Reactive Stores

| Store | Type | Description |
|-------|------|-------------|
| `isActive` | `Readable<boolean>` | Whether a tour is currently running |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of current step |
| `totalSteps` | `Readable<number>` | Total steps in the active tour |

### Methods

| Method | Description |
|--------|-------------|
| `start(flow)` | Start a tour |
| `stop()` | Stop the active tour |
| `next()` | Advance to the next step |
| `prev()` | Go to the previous step |

## Access the Instance

The store also exposes the underlying GuideFlow instance:

```svelte
<script lang="ts">
  const store = createTourStore(createGuideFlow())
  const { instance } = store

  // Use hotspots, events, etc.
  instance.hotspot('#btn', { title: 'New!' })
  instance.on('tour:complete', () => console.warn('Done!'))
</script>
```

## SvelteKit

GuideFlow is SSR-safe. All DOM access is guarded, so it works in SvelteKit without special configuration. Import styles in your root layout:

```svelte
<!-- +layout.svelte -->
<script>
  import '@guideflow/core/styles'
</script>
```
