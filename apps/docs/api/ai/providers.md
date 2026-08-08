---
description: "AI provider reference for @guideflow/ai — OpenAI, Anthropic, Ollama, and Mock providers with configuration options."
keywords: GuideFlow AI providers, OpenAI, Anthropic, Ollama, MockProvider, @guideflow/ai
---

# AI Providers

`@guideflow/ai` ships with five built-in providers. Pass any of them to [`createAI()`](./create-ai).

## ProxyProvider

**The provider to use in a browser.** It holds no credential — it POSTs to an endpoint you run,
which keeps the API key server-side. See [Running AI through your own server](../../guide/ai-proxy).

```ts
import { ProxyProvider } from '@guideflow/ai'

new ProxyProvider(options: ProxyProviderOptions)
```

### ProxyProviderOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `endpoint` | `string` | — | **Required.** URL of your endpoint. Relative paths resolve against the current origin. |
| `headers` | `Record<string,string>` or `() => Record<string,string>` | `{}` | Extra headers, e.g. a CSRF token. A function is re-evaluated per call so short-lived tokens can refresh. **Never put an LLM key here** — it is visible to the user. |
| `credentials` | `RequestCredentials` | `"same-origin"` | Passed through to `fetch`. |
| `timeoutMs` | `number` | `30000` | Aborts the request via `AbortController`. |
| `onError` | `(error: Error) => void` | — | Called when a request fails. |

```ts
createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), gf)
```

---

## OpenAIProvider

Uses the OpenAI Chat Completions API.

::: danger Do not construct this in browser code
`apiKey` ends up in your JavaScript bundle, where every visitor can read it. Use
[`ProxyProvider`](#proxyprovider) on the client and keep this on your server. GuideFlow logs a
one-time warning if it detects a key in a browser.
:::

```ts
import { OpenAIProvider } from '@guideflow/ai'

new OpenAIProvider(options?: OpenAIProviderOptions)
```

### OpenAIProviderOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `process.env.OPENAI_API_KEY` | Your OpenAI API key. Server-side only. |
| `model` | `string` | `"gpt-4o-mini"` | Model identifier. |
| `temperature` | `number` | `0.2` | Sampling temperature. |
| `maxTokens` | `number` | `2048` | Maximum tokens per completion. |

```ts
// Server-side only — e.g. inside your /api/guideflow-ai handler.
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
})
```

---

## AnthropicProvider

Uses the Anthropic Messages API.

::: danger Do not construct this in browser code
Same reasoning as `OpenAIProvider` above.
:::

```ts
import { AnthropicProvider } from '@guideflow/ai'

new AnthropicProvider(options?: AnthropicProviderOptions)
```

### AnthropicProviderOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `process.env.ANTHROPIC_API_KEY` | Your Anthropic API key. Server-side only. |
| `model` | `string` | `"claude-haiku-4-5"` | Model identifier. Ids retire — pin one you control if that matters to you. |
| `maxTokens` | `number` | `2048` | Maximum tokens per response. |

```ts
// Server-side only.
const provider = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
```

---

## OllamaProvider

Runs inference locally using [Ollama](https://ollama.com). No API key required.

```ts
import { OllamaProvider } from '@guideflow/ai'

new OllamaProvider(options?: OllamaProviderOptions)
```

### OllamaProviderOptions

| Option      | Type     | Default                   | Description |
|-------------|----------|---------------------------|-------------|
| `model`     | `string` | `"llama3"`                | Local model name |
| `baseUrl`   | `string` | `"http://localhost:11434"` | Ollama server URL. Note the lower-case `rl` — this doc previously said `baseURL`, which the provider ignores. |

```ts
const provider = new OllamaProvider({ model: 'mistral' })
```

---

## MockProvider

Returns deterministic stub responses. Useful for tests and Storybook.

```ts
import { MockProvider } from '@guideflow/ai'

new MockProvider(delayMs?: number)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `delayMs` | `number` | `120` | Artificial latency before each response resolves. Pass `0` in tests. |

Responses are derived from the input, so they are stable for the same DOM: `generateSteps()` returns
one step per captured element up to five, `detectIntent()` always returns
`{ type: 'exploring', confidence: 0.75 }`, and `answerQuestion()` echoes the question and the page
URL.

```ts
import { createAI, MockProvider } from '@guideflow/ai'

const gf = createAI(new MockProvider(), createGuideFlow({}))

const steps = await gf.ai.generate()   // returns predictable stub steps
```

---

## Custom Provider

Implement the `AIProvider` interface to bring your own backend:

All three methods are required.

```ts
import type { AIProvider, PageContext } from '@guideflow/ai'
import type { Step, DOMContext, UserEvent, IntentSignal, GuidedAnswer } from '@guideflow/core'

class MyProvider implements AIProvider {
  async generateSteps(context: DOMContext, prompt: string): Promise<Step[]> {
    // Call your API…
    return []
  }

  async detectIntent(events: UserEvent[]): Promise<IntentSignal> {
    return { type: 'exploring', confidence: 0 }
  }

  async answerQuestion(question: string, context: PageContext): Promise<GuidedAnswer> {
    return { text: '…', highlights: [] }
  }
}
```

Note the argument order and types: `generateSteps` receives a `DOMContext` (what `serializeDOM()`
returns), and `answerQuestion` takes the **question first**, then a `PageContext` — a `DOMContext`
wrapped with `url`, `title` and an optional `currentStepId`.

The bundled providers run their responses through `validateSteps`, `validateIntentSignal` and
`validateGuidedAnswer`, all exported from `@guideflow/ai`. Reuse them if your backend returns
model output verbatim.

## See Also

- [createAI()](./create-ai)
- [GuideBrain](./guide-brain)
