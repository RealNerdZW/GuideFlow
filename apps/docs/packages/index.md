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

Each adapter takes `@guideflow/core` as a peer dependency, so install core alongside it.

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/react](./react) | React hooks & components (`TourProvider`, `useTour`, `TourStep`) | `npm i @guideflow/core @guideflow/react` |
| [@guideflow/vue](./vue) | Vue 3 plugin & composables (`GuideFlowPlugin`, `useTour`) | `npm i @guideflow/core @guideflow/vue` |
| [@guideflow/svelte](./svelte) | Svelte store adapter (`createTourStore`) | `npm i @guideflow/core @guideflow/svelte` |

## AI & Analytics

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/ai](./ai) | Auto-generate tours, intent detection, conversational help | `npm i @guideflow/core @guideflow/ai` |
| [@guideflow/analytics](./analytics) | Event tracking, transports (PostHog, Mixpanel, Amplitude), A/B testing | `npm i @guideflow/core @guideflow/analytics` |
| [@guideflow/checklist](./checklist) | Docked onboarding checklist — a projection of `ProgressStore`, not a second source of truth | `npm i @guideflow/core @guideflow/checklist` |

## Tooling

| Package | Description | Install |
|---------|-------------|---------|
| [@guideflow/cli](./cli) | Scaffold flows, validate configs, export tours from the terminal | `npm i -g @guideflow/cli` |
| [@guideflow/devtools](./devtools) | Chrome/Firefox extension — visual tour builder, flow inspector, AI assist | [Install from source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/devtools) |

## Versions

Every package is MIT-licensed and released from the same repository with
[Changesets](https://github.com/changesets/changesets). Versions are not locked together — a
release bumps only the packages a changeset names — so read the current version off npm rather
than off this page:

| Package | Latest |
|---------|--------|
| `@guideflow/core` | [![npm](https://img.shields.io/npm/v/@guideflow/core.svg?label=)](https://www.npmjs.com/package/@guideflow/core) |
| `@guideflow/react` | [![npm](https://img.shields.io/npm/v/@guideflow/react.svg?label=)](https://www.npmjs.com/package/@guideflow/react) |
| `@guideflow/vue` | [![npm](https://img.shields.io/npm/v/@guideflow/vue.svg?label=)](https://www.npmjs.com/package/@guideflow/vue) |
| `@guideflow/svelte` | [![npm](https://img.shields.io/npm/v/@guideflow/svelte.svg?label=)](https://www.npmjs.com/package/@guideflow/svelte) |
| `@guideflow/ai` | [![npm](https://img.shields.io/npm/v/@guideflow/ai.svg?label=)](https://www.npmjs.com/package/@guideflow/ai) |
| `@guideflow/analytics` | [![npm](https://img.shields.io/npm/v/@guideflow/analytics.svg?label=)](https://www.npmjs.com/package/@guideflow/analytics) |
| `@guideflow/checklist` | [![npm](https://img.shields.io/npm/v/@guideflow/checklist.svg?label=)](https://www.npmjs.com/package/@guideflow/checklist) |
| `@guideflow/cli` | [![npm](https://img.shields.io/npm/v/@guideflow/cli.svg?label=)](https://www.npmjs.com/package/@guideflow/cli) |

`@guideflow/devtools` is not published to npm — install it from source.
