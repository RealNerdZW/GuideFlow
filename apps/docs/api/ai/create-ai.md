---
description: "createAI() API reference — attach AI capabilities to a GuideFlow instance using OpenAI, Anthropic, Ollama, or a custom provider."
keywords: createAI, GuideFlow AI, @guideflow/ai, AI tour generation
---

# createAI()

Attaches an AI layer to an existing GuideFlow instance, exposing a `.ai` property that gives access to the full [GuideBrain](./guide-brain) API.

## Signature

```ts
import { createAI } from '@guideflow/ai'

function createAI<T extends GuideFlowInstance>(
  provider: AIProvider,
  instance: T,
  opts?: GuideBrainOptions,
): T & { ai: GuideBrain }
```

## Parameters

| Parameter  | Type                | Description |
|------------|---------------------|-------------|
| `provider` | `AIProvider`        | The AI backend to use — see [Providers](./providers) |
| `instance` | `GuideFlowInstance` | An existing GuideFlow instance created with `createGuideFlow()` |
| `opts`     | `GuideBrainOptions` | Optional tuning options for the GuideBrain |

## Returns

The same `instance` reference (mutated in place), typed to include an `.ai: GuideBrain` property.

## Example

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow({ theme: 'minimal' })

const gfWithAI = createAI(
  new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }),
  gf,
  { autoWatch: true },
)

// Generate steps from the current page
const steps = await gfWithAI.ai.generate('Walk me through the checkout flow')
await gfWithAI.start({ id: 'ai-tour', steps })

// Answer a user question
const answer = await gfWithAI.ai.chat('How do I apply a promo code?')
console.log(answer.answer)
```

## GuideBrainOptions

| Option              | Type      | Default | Description |
|---------------------|-----------|---------|-------------|
| `intentDebounceMs`  | `number`  | `2000`  | Milliseconds of inactivity before intent detection fires |
| `maxEventBuffer`    | `number`  | `200`   | Max user events to buffer before oldest are discarded |
| `autoWatch`         | `boolean` | `false` | Automatically start watching user events on creation |

## See Also

- [GuideBrain](./guide-brain) — full brain API reference
- [Providers](./providers) — OpenAI, Anthropic, Ollama, Mock
