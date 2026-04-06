---
description: Automatically generate GuideFlow product tour steps from a plain-English prompt by analyzing the current page's DOM. No manual step authoring needed.
keywords: auto-generate product tour, AI tour generation, DOM-based tour, GuideFlow ai-generate
---

# Auto-Generate Tours

GuideFlow's AI module can generate tour steps from a plain-English prompt by analyzing the current page's DOM.

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow()
createAI(new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }), gf)
```

## Generate Steps

```ts
const steps = await gf.ai.generate('Walk me through the checkout flow')

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

The AI analyzes the DOM, identifies relevant elements, and produces step definitions with appropriate targets, placements, and content.

## How It Works

1. **DOM serialization** — GuideFlow serializes the visible DOM into a compact representation
2. **Prompt construction** — your instruction is combined with the DOM context
3. **LLM inference** — the provider generates step definitions
4. **Validation** — steps are validated against the actual DOM before returning

## Providers

| Provider | Installation | Config |
|----------|-------------|--------|
| OpenAI | `npm i openai` | `new OpenAIProvider({ apiKey })` |
| Anthropic | `npm i @anthropic-ai/sdk` | `new AnthropicProvider({ apiKey })` |
| Ollama | None | `new OllamaProvider({ model, baseUrl })` |
| Mock | None | `new MockProvider()` |

All providers are **lazy-loaded** — only the SDK you import is included in your bundle.

## Custom Generation Options

```ts
const steps = await gf.ai.generate('Explain the settings page', {
  maxSteps: 5,           // limit number of steps
  placement: 'bottom',   // default placement for all steps
})
```
