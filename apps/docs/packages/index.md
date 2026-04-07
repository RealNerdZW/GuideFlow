---
description: Overview of all GuideFlow.js npm packages — core engine, React/Vue/Svelte adapters, AI, analytics, CLI, and DevTools.
keywords: GuideFlow packages, @guideflow/core, @guideflow/react, @guideflow/vue, @guideflow/svelte, @guideflow/ai, @guideflow/analytics, @guideflow/cli
---

# Packages

GuideFlow is published as a collection of scoped npm packages. Install only what you need.

## Core

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/core](./core) | Tour engine, state machine, spotlight, renderer — zero runtime dependencies | `npm i @guideflow/core` |

## Framework Adapters

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/react](./react) | React hooks & components (`TourProvider`, `useTour`, `TourStep`) | `npm i @guideflow/react` |
| [@guideflow/vue](./vue) | Vue 3 plugin & composables (`GuideFlowPlugin`, `useTour`) | `npm i @guideflow/vue` |
| [@guideflow/svelte](./svelte) | Svelte store adapter (`createTourStore`) | `npm i @guideflow/svelte` |

## AI & Analytics

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/ai](./ai) | Auto-generate tours, intent detection, conversational help | `npm i @guideflow/ai` |
| [@guideflow/analytics](./analytics) | Event tracking, transports (PostHog, Mixpanel, Amplitude), A/B testing | `npm i @guideflow/analytics` |

## Tooling

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/cli](./cli) | Scaffold flows, validate configs, export tours from the terminal | `npm i -g @guideflow/cli` |
| [@guideflow/devtools](./devtools) | Chrome/Firefox extension — visual tour builder, flow inspector, AI assist | [Install from source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/devtools) |

## Version Matrix

All packages follow the same version number and are released together via [Changesets](https://github.com/changesets/changesets).

| Current version | License |
|-----------------|---------|
| **0.1.4** | MIT |
