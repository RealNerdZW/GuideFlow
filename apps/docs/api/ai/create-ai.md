---
description: "createAI() API reference — attach AI capabilities to a GuideFlow instance using ProxyProvider, Ollama, Mock, or a server-side OpenAI/Anthropic provider."
keywords: createAI, GuideFlow AI, @guideflow/ai, AI tour generation
---

# createAI()

Attaches an AI layer to an existing GuideFlow instance, exposing a `.ai` property that gives access
to the [GuideBrain](./guide-brain) API.

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
| `provider` | `AIProvider`        | The AI backend — see [Providers](./providers) |
| `instance` | `GuideFlowInstance` | An instance created with `createGuideFlow()` |
| `opts`     | `GuideBrainOptions` | Optional tuning for the GuideBrain |

## Returns

The same `instance` reference, **mutated in place**, typed to include `.ai: GuideBrain`.

Keep the return value. At runtime `.ai` is present on the original object too, but TypeScript does
not widen the original binding, so `gf.ai` on a variable declared as `GuideFlowInstance` is a
compile error:

```ts
const gf = createGuideFlow()
createAI(provider, gf)
gf.ai.generate()          // ✗ Property 'ai' does not exist on type 'GuideFlowInstance'

const gfAI = createAI(provider, createGuideFlow())
await gfAI.ai.generate()  // ✓
```

`createAI()` also wraps `instance.destroy()` so that destroying the instance destroys the brain.

## Example

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
  { autoWatch: true },
)

// Generate steps, then assemble a flow — generate() returns Step[], not a flow.
const steps = await gf.ai.generate('Walk me through the checkout flow')

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})

// Answer a user question
const answer = await gf.ai.chat('How do I apply a promo code?')
console.log(answer.text)
```

::: danger Use ProxyProvider in a browser
`OpenAIProvider` and `AnthropicProvider` hold an API key, which in client code ships in your bundle.
See [Running AI through your own server](../../guide/ai-proxy).
:::

## GuideBrainOptions

| Option              | Type      | Default | Description |
|---------------------|-----------|---------|-------------|
| `intentDebounceMs`  | `number`  | `2000`  | Milliseconds of inactivity before intent detection fires |
| `maxEventBuffer`    | `number`  | `200`   | Max user events buffered before the oldest are discarded |
| `autoWatch`         | `boolean` | `false` | Call `watch()` from the constructor |

With `autoWatch: true` the cleanup function returned by `watch()` is retained internally and released
only by `destroy()`. Leave it `false` if you need to stop watching without tearing down the brain.

## See Also

- [GuideBrain](./guide-brain) — full brain API
- [Providers](./providers) — Proxy, OpenAI, Anthropic, Ollama, Mock
