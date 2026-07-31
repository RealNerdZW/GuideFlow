---
description: "AI provider reference for @guideflow/ai — OpenAI, Anthropic, Ollama, and Mock providers with configuration options."
keywords: GuideFlow AI providers, OpenAI, Anthropic, Ollama, MockProvider, @guideflow/ai
---

# AI Providers

`@guideflow/ai` ships with four built-in providers. Pass any of them to [`createAI()`](./create-ai).

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
| `model` | `string` | `"claude-3-haiku-20240307"` | Model identifier. |
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

new MockProvider()
```

No options — produces a fixed set of generated steps and a fixed chat answer.

```ts
import { createAI, MockProvider } from '@guideflow/ai'

const gf = createAI(new MockProvider(), createGuideFlow({}))

const steps = await gf.ai.generate()   // returns predictable stub steps
```

---

## Custom Provider

Implement the `AIProvider` interface to bring your own backend:

```ts
import type { AIProvider, PageContext } from '@guideflow/ai'
import type { Step, GuidedAnswer } from '@guideflow/core'

class MyProvider implements AIProvider {
  async generateSteps(context: PageContext, prompt: string): Promise<Step[]> {
    // Call your API…
    return []
  }

  async answerQuestion(context: PageContext, question: string): Promise<GuidedAnswer> {
    return { answer: '…', stepId: null }
  }
}
```

## See Also

- [createAI()](./create-ai)
- [GuideBrain](./guide-brain)
