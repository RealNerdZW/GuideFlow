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

## Optional packages

```bash
# AI capabilities (pick your provider)
pnpm add @guideflow/ai openai          # OpenAI
pnpm add @guideflow/ai @anthropic-ai/sdk  # Anthropic
pnpm add @guideflow/ai                 # Ollama (no extra dep)

# Analytics & A/B testing
pnpm add @guideflow/analytics

# CLI tools
pnpm add -D @guideflow/cli
```

## CDN (no bundler)

```html
<script type="module">
  import { createGuideFlow } from 'https://cdn.jsdelivr.net/npm/@guideflow/core/+esm';
</script>
```
