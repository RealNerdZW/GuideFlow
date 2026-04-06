---
description: Introduction to GuideFlow.js — an open-source, AI-powered product tour library for React, Vue, Svelte and Vanilla JS. Learn why GuideFlow beats Driver.js and Intro.js.
keywords: GuideFlow introduction, product tour library overview, user onboarding JavaScript, open source tour library
---

# Introduction

GuideFlow.js is an open-source, AI-powered product tour library that helps you guide users through your application with context-aware, personalised onboarding experiences.

## Why GuideFlow?

Most tour libraries treat onboarding as a static linear script. GuideFlow treats it as a conversation:

- **AI-generated steps** — point GuideFlow at any page and it will write the tour for you
- **Intent detection** — watch how users interact and surface the right tour at the right moment
- **Adaptive flows** — skip steps the user already understands, branch based on their role or data
- **Analytics built-in** — track completion rates, drop-offs, and run A/B experiments without extra SDKs
- **DevTools extension** — build tours visually, inspect state, and push flows straight from your browser

## Packages

| Package | Description |
|---------|-------------|
| `@guideflow/core` | Framework-agnostic engine, zero dependencies |
| `@guideflow/react` | React 17/18/19 hooks and components |
| `@guideflow/vue` | Vue 3 composables and plugin |
| `@guideflow/svelte` | Svelte 4/5 stores |
| `@guideflow/ai` | AI brain — OpenAI, Anthropic, Ollama, Mock |
| `@guideflow/analytics` | Event collection, transports, A/B testing |
| `@guideflow/cli` | `guideflow init / studio / export / push` |
| `@guideflow/devtools` | Manifest V3 browser extension |

## Design Principles

1. **Zero dependencies in core** — `@guideflow/core` ships with no runtime dependencies
2. **SSR safe** — every DOM access is guarded; works in Next.js App Router, Nuxt, and SvelteKit
3. **CSP compliant** — all style injection accepts a `nonce` parameter
4. **Tree-shakeable** — ESM-first; only import what you use
5. **Type-safe** — written in strict TypeScript; full generics support for your flow context
