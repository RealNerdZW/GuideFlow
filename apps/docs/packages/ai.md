---
description: "@guideflow/ai — AI tour generation, intent classification and page question answering for GuideFlow. Proxy, OpenAI, Anthropic, Ollama and Mock providers."
keywords: "@guideflow/ai, AI product tour, auto-generate tour steps, intent detection onboarding, conversational tour"
---

# @guideflow/ai

**AI tour generation, intent classification, and page-aware question answering.**

[![npm version](https://img.shields.io/npm/v/@guideflow/ai.svg)](https://www.npmjs.com/package/@guideflow/ai)

## Installation

```bash
npm install @guideflow/core @guideflow/ai
```

That is enough for `ProxyProvider`, `OllamaProvider` and `MockProvider` — none of them need an SDK.
Install `openai` or `@anthropic-ai/sdk` only where you construct those providers, which should be
**server-side**. Both are optional peer dependencies and are imported dynamically inside the call, so
the package builds and runs with neither present.

## Key Exports

| Export | Kind | Description |
|--------|------|-------------|
| `createAI()` | function | Attaches a `GuideBrain` to a GuideFlow instance as `.ai` |
| `GuideBrain` | class | `generate`, `watch`, `detectIntent`, `compress`, `chat` |
| `ProxyProvider` | class | Posts to your endpoint. **The one to use in a browser** |
| `OpenAIProvider` | class | OpenAI backend. Server-side only |
| `AnthropicProvider` | class | Anthropic backend. Server-side only |
| `OllamaProvider` | class | Local Ollama backend. No key |
| `MockProvider` | class | Deterministic fixtures, no network call |
| `serializeDOM()` | function | The DOM snapshot the providers receive |
| `validateSteps()` | function | Coerce untrusted model output to `Step[]` |
| `validateIntentSignal()` | function | Coerce untrusted model output to `IntentSignal` |
| `validateGuidedAnswer()` | function | Coerce untrusted model output to `GuidedAnswer` |

Exported types: `AIProvider`, `PageContext`, `GuideBrainOptions`, `BrainEventMap`,
`ProxyProviderOptions`, `OpenAIProviderOptions`, `AnthropicProviderOptions`, `OllamaProviderOptions`.

## Peer Dependencies

- `openai` >= 4.0.0 (optional)
- `@anthropic-ai/sdk` >= 0.17.0 (optional)

## Quick start

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// Keep createAI's return value — it is the binding typed with `.ai`.
const gf = createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), createGuideFlow())

const steps = await gf.ai.generate('Walk me through checkout')

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

## Links

- [npm](https://www.npmjs.com/package/@guideflow/ai)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/ai)
- [AI Overview](/guide/ai)
- [Running AI through your own server](/guide/ai-proxy)
- [Auto-Generate Tours](/guide/ai-generate)
- [Intent Detection](/guide/ai-intent)
- [Conversational Help](/guide/ai-chat)
- [Privacy](/guide/privacy)
