# @guideflow/svelte

**Svelte stores and utilities for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Svelte adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Provides a store-based reactive API for building product tours.

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

## Key Exports

| Export | Description |
|--------|-------------|
| `createTourStore()` | Creates a reactive tour store from a GuideFlow instance |

### TourStore Properties

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `Readable<boolean>` | Whether a tour is currently running |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of the current step |
| `totalSteps` | `Readable<number>` | Total number of steps in the active tour |
| `start(flow)` | `function` | Start a tour |
| `stop()` | `function` | Stop the active tour |
| `next()` | `function` | Advance to the next step |
| `prev()` | `function` | Go to the previous step |

## Peer Dependencies

- `svelte` ^4.0.0 || ^5.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
