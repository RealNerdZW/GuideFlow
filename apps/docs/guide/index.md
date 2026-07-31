---
description: Introduction to GuideFlow.js — an open-source product tour library for React, Vue, Svelte and Vanilla JS, where every tour is a finite state machine and the AI layer is optional.
keywords: GuideFlow introduction, product tour library overview, user onboarding JavaScript, open source tour library
---

# Introduction

GuideFlow.js is an open-source product tour library for guiding users through your application. The engine is framework-agnostic and dependency-free; the AI layer is an optional package you opt into.

## Why GuideFlow?

Most tour libraries treat onboarding as a static linear script. GuideFlow models
it as a finite state machine, so branching, guards and conditional paths are
first-class rather than bolted on:

- **Tours are state machines** — states, transitions and guards, with steps that can be skipped in either direction via `showIf`
- **Resumable** — progress is persisted per user and per flow; completed and dismissed tours are suppressed automatically
- **AI-generated steps** — `gf.ai.generate()` serializes the page and asks your model to write the steps; you assemble them into a flow
- **Intent detection** — a classifier over recent user events emits an `intent:detected` signal you subscribe to and act on ([nothing is triggered automatically](/guide/ai-intent))
- **Adaptive flows** — branch on role or data with `showIf` and FSM transitions
- **Analytics** — six tour lifecycle events to PostHog, Mixpanel, Amplitude, Segment or a webhook, with consent and URL-scrubbing defaults, plus [deterministic A/B assignment you apply yourself](/guide/ab-testing)
- **DevTools extension** — an MV3 extension lives in the repo for inspecting a page's tour state and recording steps. It is **not published** to any store or to npm: build it and load it unpacked

## Packages

| Package | Description |
|---------|-------------|
| `@guideflow/core` | Framework-agnostic engine, zero runtime dependencies |
| `@guideflow/react` | React 17/18/19 hooks and components |
| `@guideflow/vue` | Vue 3 plugin and `useTour` composable |
| `@guideflow/svelte` | Svelte 4/5 `createTourStore` |
| `@guideflow/ai` | `GuideBrain` plus Proxy / OpenAI / Anthropic / Ollama / Mock providers |
| `@guideflow/analytics` | Event collection, 5 transports, A/B testing |
| `@guideflow/cli` | `guideflow init / studio / export / push` |
| `@guideflow/devtools` | Manifest V3 browser extension — **not published**; load it unpacked from the repo |

## Design Principles

1. **Zero dependencies in core** — `@guideflow/core` has no runtime dependencies, and its gzipped bundle size is gated in CI
2. **SSR safe** — DOM access is guarded and never runs at module scope, so the package can be imported from Next.js, Nuxt and SvelteKit
3. **CSP friendly** — injected `<style>` tags accept a nonce, and `content.html` is parsed and allowlist-sanitised rather than trusted
4. **Tree-shakeable** — ESM-first, `sideEffects: false`; only import what you use
5. **Type-safe** — strict TypeScript, with your flow context threaded through `createGuideFlow<TContext>()` into guards and `showIf`

Start with [Installation](/guide/installation), then the [Quick Start](/guide/quick-start).
