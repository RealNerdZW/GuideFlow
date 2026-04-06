---
description: "AI provider reference for @guideflow/ai — OpenAI, Anthropic, Ollama, and Mock providers with configuration options."
keywords: GuideFlow AI providers, OpenAI, Anthropic, Ollama, MockProvider, @guideflow/ai
---

# AI Providers

`@guideflow/ai` ships with four built-in providers. Pass any of them to [`createAI()`](./create-ai).

## OpenAIProvider

Uses the OpenAI Chat Completions API (GPT-4o by default).

```ts
import { OpenAIProvider } from '@guideflow/ai'

new OpenAIProvider(options?: OpenAIProviderOptions)
```

### OpenAIProviderOptions

| Option      | Type     | Default      | Description |
|-------------|----------|--------------|-------------|
| `apiKey`    | `string` | —            | Your OpenAI API key |
| `model`     | `string` | `"gpt-4o"`   | Model identifier |
| `baseURL`   | `string` | OpenAI default | Override for custom endpoints / proxies |

```ts
const provider = new OpenAIProvider({
  apiKey: import.meta.env.VITE_OPENAI_KEY,
  model: 'gpt-4o-mini',
})
```

---

## AnthropicProvider

Uses the Anthropic Messages API (Claude 3.5 Sonnet by default).

```ts
import { AnthropicProvider } from '@guideflow/ai'

new AnthropicProvider(options?: AnthropicProviderOptions)
```

### AnthropicProviderOptions

| Option      | Type     | Default                        | Description |
|-------------|----------|--------------------------------|-------------|
| `apiKey`    | `string` | —                              | Your Anthropic API key |
| `model`     | `string` | `"claude-3-5-sonnet-20241022"` | Model identifier |
| `baseURL`   | `string` | Anthropic default              | Override for proxies |

```ts
const provider = new AnthropicProvider({
  apiKey: import.meta.env.VITE_ANTHROPIC_KEY,
})
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
| `baseURL`   | `string` | `"http://localhost:11434"` | Ollama server URL |

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
