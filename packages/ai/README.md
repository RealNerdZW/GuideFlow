# @guideflow/ai

**AI-powered tour generation, intent detection, and conversational help for GuideFlow.**

[![npm version](https://img.shields.io/npm/v/@guideflow/ai.svg)](https://www.npmjs.com/package/@guideflow/ai)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)

AI module for [GuideFlow](https://github.com/johnmugabe/GuideFlow). Generate tours from natural language, detect user intent, and provide conversational help. All providers are lazy-loaded.

## Installation

```bash
# With OpenAI
npm install @guideflow/core @guideflow/ai openai

# With Anthropic
npm install @guideflow/core @guideflow/ai @anthropic-ai/sdk

# With local Ollama (no extra dependency)
npm install @guideflow/core @guideflow/ai
```

## Quick Start

### Generate a Tour from a Prompt

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow()

createAI(
  new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }),
  gf,
)

const steps = await gf.ai.generate('Walk me through the checkout flow')
await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

### Intent Detection

Passively watch user behaviour and trigger help flows:

```ts
createAI(new OpenAIProvider({ apiKey: '...' }), gf, { autoWatch: false })

const stopWatch = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  // signal.type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    gf.start(helpFlow)
  }
})

stopWatch()
```

## Providers

| Provider | Backend | Peer Dependency |
|----------|---------|-----------------|
| `OpenAIProvider` | OpenAI API | `openai` >= 4.0.0 |
| `AnthropicProvider` | Anthropic API | `@anthropic-ai/sdk` >= 0.17.0 |
| `OllamaProvider` | Local Ollama | None |
| `MockProvider` | Testing | None |

### Anthropic

```ts
import { AnthropicProvider } from '@guideflow/ai'
createAI(new AnthropicProvider({ apiKey: '...' }), gf)
```

### Local Ollama

```ts
import { OllamaProvider } from '@guideflow/ai'
createAI(new OllamaProvider({ model: 'llama3', baseUrl: 'http://localhost:11434' }), gf)
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createAI()` | Augments a GuideFlow instance with `.ai` property |
| `GuideBrain` | Core AI engine |
| `OpenAIProvider` | OpenAI backend |
| `AnthropicProvider` | Anthropic backend |
| `OllamaProvider` | Local Ollama backend |
| `MockProvider` | Mock provider for testing |
| `serializeDOM` | DOM serialization utility |

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React adapter (includes `ConversationalPanel`)
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)
