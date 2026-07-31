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

## Framework adapters

Install the adapter for your framework alongside core:

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

Every GuideFlow package declares `@guideflow/core` as a **peer dependency** rather than bundling
it, so always install core alongside the package you want. That is what keeps a single copy of the
engine in your app — two copies would mean two independent tour states.

## Optional packages

```bash
# AI capabilities (pick your provider)
pnpm add @guideflow/core @guideflow/ai openai             # OpenAI
pnpm add @guideflow/core @guideflow/ai @anthropic-ai/sdk  # Anthropic
pnpm add @guideflow/core @guideflow/ai                    # Ollama (no extra dep)

# Analytics & A/B testing
pnpm add @guideflow/core @guideflow/analytics

# CLI tools
pnpm add -D @guideflow/cli
```

## CDN (no bundler)

```html
<script type="module">
  import { createGuideFlow } from 'https://cdn.jsdelivr.net/npm/@guideflow/core/+esm';
</script>
```
