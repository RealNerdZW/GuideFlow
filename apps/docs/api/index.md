---
description: Complete API reference for GuideFlow.js. Documents all core exports, React, Vue, Svelte, AI, Analytics, and CLI packages.
keywords: GuideFlow API reference, GuideFlow documentation, createGuideFlow API, TourEngine API
---

# API Reference

Complete API documentation for all GuideFlow.js packages.

## Core API

- [createGuideFlow()](./create-guide-flow) — Factory function to create a GuideFlow instance
- [FlowDefinition](./flow-definition) — Flow (state machine) definition type
- [Step](./step) — Step configuration type
- [TourEngine](./tour-engine) — Tour lifecycle management
- [FlowMachine](./flow-machine) — Finite state machine internals
- [ProgressStore](./progress-store) — Persistence API

## React API

- [TourProvider](./react/tour-provider) — Context provider component
- [useTour()](./react/use-tour) — Tour state and controls hook
- [TourStep](./react/tour-step) — Step renderer component
- [GuidePopover](./react/guide-popover) — Popover component

## Vue API

- [GuideFlowPlugin](./vue/guide-flow-plugin) — Vue 3 plugin and `useGuideFlow()` accessor
- [useTour()](./vue/use-tour) — Reactive composable for tour state and controls

## Svelte API

- [createTourStore()](./svelte/create-tour-store) — Svelte store-based tour API

## AI API

- [createAI()](./ai/create-ai) — Attach AI capabilities to a GuideFlow instance
- [GuideBrain](./ai/guide-brain) — Tour generation, intent detection, and chat
- [Providers](./ai/providers) — OpenAI, Anthropic, Ollama, and Mock providers

## Analytics API

- [AnalyticsCollector](./analytics/analytics-collector) — Subscribe to tour events and forward to transports
- [Transports](./analytics/transports) — PostHog, Mixpanel, Amplitude, Segment, Webhook
- [ExperimentEngine](./analytics/experiment-engine) — Deterministic client-side A/B testing

## CLI

- [CLI Reference](./cli) — `guideflow init`, `studio`, `export`, `push`
