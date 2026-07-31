---
description: Generate GuideFlow product tour steps from a plain-English prompt by serializing the current page's DOM and sending it to an AI provider.
keywords: auto-generate product tour, AI tour generation, DOM-based tour, GuideFlow ai-generate
---

# Auto-Generate Tours

`gf.ai.generate()` serializes the current page and asks your AI provider to write tour steps for it.

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// Keep createAI's return value — it is the binding typed with `.ai`.
const gf = createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), createGuideFlow())
```

`ProxyProvider` keeps your API key on a server you control. See
[Running AI through your own server](./ai-proxy).

## Generate Steps

```ts
const steps = await gf.ai.generate('Walk me through the checkout flow')

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

`generate()` returns `Step[]`. It does not start anything — you assemble the flow.

## Signature

```ts
generate(prompt?: string, root?: Element | null): Promise<Step[]>
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `prompt` | `string` | `''` | Natural-language description of the tour goal |
| `root` | `Element \| null` | `document.body` | The element whose subtree is serialized |

There is **no options object**. The second argument is a DOM root, so scoping generation to a region
looks like this:

```ts
const steps = await gf.ai.generate(
  'Explain the settings page',
  document.querySelector('#settings-panel'),
)
```

If you want a step cap or a fixed placement, say so in the prompt and then filter or map the returned
array yourself:

```ts
const steps = (await gf.ai.generate('Explain the settings page'))
  .slice(0, 5)
  .map((step) => ({ ...step, placement: 'bottom' as const }))
```

## How It Works

1. **DOM serialization** — `serializeDOM()` walks the root and collects up to 80 interesting elements
   (interactive tags, landmarks, headings, anything with a known ARIA role), each with a selector,
   tag, role, label, geometry and visibility flag. Elements inside `[data-gf-private]` and password
   inputs are excluded.
2. **Provider call** — the snapshot and your prompt go to `provider.generateSteps()`.
3. **Shape validation** — the response is run through `validateSteps()`. Entries without a string
   `id` are dropped, `title`/`body` are folded into `content`, and an unrecognised `placement` is
   stripped.

Validation checks the **shape of the response only**. It does not verify that a generated `target`
selector matches anything on the page — a step pointing at a selector that no longer exists will
simply render without a spotlight.

## Providers

| Provider | Installation | Construction |
|----------|-------------|--------------|
| Proxy | none | `new ProxyProvider({ endpoint })` |
| OpenAI | `npm i openai` | `new OpenAIProvider({ apiKey })` — **server-side only** |
| Anthropic | `npm i @anthropic-ai/sdk` | `new AnthropicProvider({ apiKey })` — **server-side only** |
| Ollama | none | `new OllamaProvider({ model, baseUrl })` |
| Mock | none | `new MockProvider(delayMs?)` |

`openai` and `@anthropic-ai/sdk` are **optional** peer dependencies, and each provider imports its
SDK dynamically inside the call rather than at module scope — so `@guideflow/ai` builds and runs with
neither installed, and a bundler only pulls in the SDK you actually construct a provider for.

## See Also

- [Providers](../api/ai/providers) — full option tables
- [Privacy](./privacy) — what the DOM snapshot contains
