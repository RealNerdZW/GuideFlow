# @guideflow/svelte

**Svelte stores and utilities for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createTourStore()` | Creates a reactive tour store |

### TourStore Properties

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `Readable<boolean>` | Tour running state |
| `currentStepId` | `Readable<string \| null>` | Current step ID |
| `currentStepIndex` | `Readable<number>` | Current step index |
| `totalSteps` | `Readable<number>` | Total steps |
| `start(flow)` | Method | Start a tour |
| `stop()` | Method | Stop the tour |
| `next()` | Method | Next step |
| `prev()` | Method | Previous step |

## Peer Dependencies

- `svelte` ^4.0.0 || ^5.0.0

## Links

- [npm](https://www.npmjs.com/package/@guideflow/svelte)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/svelte)
- [Svelte Guide](/guide/svelte)
