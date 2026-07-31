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

Each adapter depends on `@guideflow/core` directly, so installing the adapter is
enough — add core explicitly as well if you import from it in your own code.

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

The framework itself is a peer dependency:

| Adapter | Peer range |
|---------|-----------|
| `@guideflow/react` | `react` / `react-dom` ^17 \|\| ^18 \|\| ^19 |
| `@guideflow/vue` | `vue` ^3 |
| `@guideflow/svelte` | `svelte` ^4 \|\| ^5 |

## Optional packages

```bash
# AI capabilities
pnpm add @guideflow/ai

# Analytics & A/B testing
pnpm add @guideflow/analytics

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

`@guideflow/cli` installs `commander`, `chalk`, `inquirer` and `ora`. The
`studio` command additionally needs **Vite**, which is an *optional* peer — add
it (`pnpm add -D vite`) only if you intend to run Studio.

## CDN (no bundler)

ESM, via jsDelivr:

```html
<script type="module">
  import { createGuideFlow } from 'https://cdn.jsdelivr.net/npm/@guideflow/core/+esm';
</script>
```

Or the IIFE build, which exposes a `GuideFlow` global — see
[Vanilla JavaScript](/guide/vanilla#cdn-script-tag).
