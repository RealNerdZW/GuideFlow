---
description: Install GuideFlow.js packages via npm, pnpm, or yarn. Covers @guideflow/core and framework adapters for React, Vue, Svelte. Node.js 18+ required.
keywords: install GuideFlow, npm install product tour, @guideflow/core, @guideflow/react setup
---

# Installation

## Requirements

- Node.js ≥ 18
- A package manager: npm, pnpm, or yarn

## Install core

```bash
# npm
npm install @guideflow/core

# pnpm
pnpm add @guideflow/core

# yarn
yarn add @guideflow/core
```

`@guideflow/core` has no runtime dependencies. It ships ESM, CJS and an IIFE
build, plus stylesheets under `@guideflow/core/styles`.

## Framework adapters

Every GuideFlow package declares `@guideflow/core` as a **peer dependency** rather than bundling it,
so install core alongside the adapter you want. That is what keeps a single copy of the engine in
your app — two copies would mean two independent tour states.

::: code-group

```bash [React]
pnpm add @guideflow/core @guideflow/react
```

```bash [Vue]
pnpm add @guideflow/core @guideflow/vue
```

```bash [Svelte]
pnpm add @guideflow/core @guideflow/svelte
```

:::

Your framework is a peer dependency too:

| Adapter | Peer range |
|---------|-----------|
| `@guideflow/react` | `react` / `react-dom` ^18 \|\| ^19 |
| `@guideflow/vue` | `vue` ^3 |
| `@guideflow/svelte` | `svelte` ^4 \|\| ^5 |
| `@guideflow/checklist` | none beyond `@guideflow/core` — it is framework-agnostic |

React 17 is not supported: the adapter uses `useId` and `useSyncExternalStore`, both React 18.

## Optional packages

```bash
# AI capabilities (pick your provider)
pnpm add @guideflow/core @guideflow/ai                    # ProxyProvider / Ollama — no SDK needed
pnpm add @guideflow/core @guideflow/ai openai             # OpenAIProvider (server-side only)
pnpm add @guideflow/core @guideflow/ai @anthropic-ai/sdk  # AnthropicProvider (server-side only)

# Analytics & A/B testing
pnpm add @guideflow/core @guideflow/analytics

# Onboarding checklist
pnpm add @guideflow/core @guideflow/checklist

# CLI tools
pnpm add -D @guideflow/cli
```

### AI provider dependencies

`@guideflow/ai` itself needs nothing extra. Provider SDKs are **optional peer
dependencies**, imported lazily by the provider that uses them:

| Provider | Extra install | Where it can run |
|----------|---------------|------------------|
| `ProxyProvider` | none | browser or server — holds no API key |
| `OllamaProvider` | none | wherever it can reach your Ollama host |
| `MockProvider` | none | anywhere (tests, demos) |
| `OpenAIProvider` | `pnpm add openai` | **server only** — holds an API key |
| `AnthropicProvider` | `pnpm add @anthropic-ai/sdk` | **server only** — holds an API key |

A key-holding provider must not be constructed in browser code: anything in the
bundle is public. Use `ProxyProvider` in the browser and keep the key on your
own endpoint — see [Running AI on your server](/guide/ai-proxy).

### CLI

`@guideflow/cli` installs `commander`, `chalk`, `inquirer`, `ora` and
`@guideflow/core` — the last of these because `guideflow validate` and
`guideflow export` share the validator in `@guideflow/core/authoring`. There are
no optional peers to add.

## CDN (no bundler)

ESM, via jsDelivr:

```html
<script type="module">
  import { createGuideFlow } from 'https://cdn.jsdelivr.net/npm/@guideflow/core/+esm';
</script>
```

Or the IIFE build, which exposes a `GuideFlow` global — see
[Vanilla JavaScript](/guide/vanilla#cdn-script-tag).
