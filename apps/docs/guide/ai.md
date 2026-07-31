---
description: GuideFlow AI features overview — generate tour steps from your DOM, classify user intent, and answer page questions with @guideflow/ai.
keywords: AI product tour, auto-generate tour, GuideFlow AI, AI onboarding library, @guideflow/ai
---

# AI Features

`@guideflow/ai` adds three things to a GuideFlow instance: step generation from the live DOM,
an intent classifier over recent user events, and a page-aware question answerer.

Read [Running AI through your own server](./ai-proxy) first. Every provider except `ProxyProvider`
and `OllamaProvider` holds an API key, and a key in browser code is public by construction.

## Providers

| Provider | Extra install | Notes |
|----------|---------------|-------|
| `ProxyProvider` | none | **Use this in a browser.** POSTs to an endpoint you run; holds no credential |
| `OpenAIProvider` | `openai` optional peer dep | `gpt-4o-mini` by default. Server-side only |
| `AnthropicProvider` | `@anthropic-ai/sdk` optional peer dep | `claude-haiku-4-5` by default. Server-side only |
| `OllamaProvider` | none | HTTP to a local Ollama instance. No key |
| `MockProvider` | none | Deterministic fixtures for tests. No network call |

Full option tables: [Providers](../api/ai/providers).

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// createAI mutates the instance in place AND returns it, re-typed with `.ai`.
// Keep the return value — the original binding is not widened, so `.ai` on it
// is a type error.
const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
  { autoWatch: false }, // optional GuideBrainOptions
)
```

## Generate steps

`generate()` takes a prompt and an optional **root `Element`** to scope the DOM capture. It returns
`Step[]` — you still have to put those steps into a flow.

```ts
const steps = await gf.ai.generate('Walk the user through the checkout flow')

await gf.start({
  id: 'ai-checkout',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

```ts
// Scope generation to one section of the page.
const steps = await gf.ai.generate('Explain this form', document.querySelector('#payment-form'))
```

::: warning A flat `{ id, steps }` object is not a flow
`start()` expects a `FlowDefinition`. Passing `{ id, steps }` throws, because `initial` is missing
from `states`. See [Flows and steps](./flows-and-steps).
:::

## Intent detection

`watch()` buffers clicks, input, scroll and keydown events, and after `intentDebounceMs` of quiet
asks the provider to classify them. It returns a cleanup function.

```ts
const stopWatching = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  // signal.type is one of: 'confused' | 'stuck' | 'exploring' | 'engaged'
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    void gf.start(helpFlow)
  }
})

stopWatching()
```

::: warning Nothing is triggered for you
The signal is emitted and that is all. GuideFlow does not start, branch or suppress any flow in
response to an intent signal — the `gf.start(...)` above is yours to write. See
[Intent detection](./ai-intent).
:::

## Adaptive step compression

`compress()` needs the GuideFlow instance as its second argument, and an optional `userId` to enable
the persistence lookup.

```ts
const relevant = await gf.ai.compress(allSteps, gf, currentUser.id)

await gf.start({
  id: 'smart-tour',
  initial: 'main',
  states: { main: { steps: relevant, final: true } },
})
```

## Conversational help

`chat()` returns a `GuidedAnswer`: `{ text, highlights, confidence?, suggestedSteps? }`.

```ts
const answer = await gf.ai.chat('How do I add a promo code?')

console.log(answer.text)        // natural-language explanation
console.log(answer.highlights)  // string[] of CSS selectors

answer.highlights.forEach((selector) => {
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})
```

## Testing without a model

```ts
import { createAI, MockProvider } from '@guideflow/ai'

// The constructor arg is artificial latency in ms (default 120).
const gf = createAI(new MockProvider(0), createGuideFlow())

const steps = await gf.ai.generate('test')
expect(steps.length).toBeGreaterThan(0)
```

## Local models

```ts
import { createAI, OllamaProvider } from '@guideflow/ai'

const gf = createAI(
  new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3' }),
  createGuideFlow(),
)
```

## What leaves the page

Every AI call ships a DOM snapshot to a model. See [Privacy](./privacy) for exactly what
`serializeDOM()` captures and how to hold data back with `data-gf-private`.
