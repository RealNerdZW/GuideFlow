---
description: GuideFlow AI features overview — auto-generate tour steps from your DOM, detect user intent in real-time, and answer questions with an embedded conversational AI.
keywords: AI product tour, auto-generate tour, GuideFlow AI, AI onboarding library, @guideflow/ai
---

# AI Features

`@guideflow/ai` is the primary differentiator of GuideFlow — no other tour library has built-in AI capabilities.

## Providers

| Provider | Package | Notes |
|----------|---------|-------|
| `OpenAIProvider` | `openai` peer dep | GPT-4o-mini by default |
| `AnthropicProvider` | `@anthropic-ai/sdk` peer dep | claude-3-haiku by default |
| `OllamaProvider` | none | HTTP to local Ollama instance |
| `MockProvider` | none | Deterministic fake responses for testing |

## Setup

```ts
import { createGuideFlow } from '@guideflow/core';
import { createAI, OpenAIProvider } from '@guideflow/ai';

const gf = createGuideFlow();

// Attach AI — augments gf with a .ai property
createAI(
  new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }),
  gf,
  { autoWatch: false }, // optional GuideBrain options
);
```

## Auto-generate Steps

```ts
// Generate a full tour from the current page
const steps = await gf.ai.generate('Walk the user through the checkout flow');
gf.start({ id: 'ai-checkout', steps });

// Scope generation to a specific section
const steps = await gf.ai.generate('Explain this form', document.querySelector('#payment-form'));
```

## Intent Detection

```ts
// Start watching user behaviour
const stopWatch = gf.ai.watch();

// Listen for intent signals
gf.ai.on('intent:detected', (signal) => {
  if (signal.intent === 'checkout' && signal.confidence > 0.8) {
    gf.start({ id: 'checkout-help', steps: [...] });
  }
});

// Stop watching when no longer needed
stopWatch();
```

## Adaptive Step Compression

Skip steps the user has already mastered:

```ts
const allSteps = [...]; // your full step list
const relevant = await gf.ai.compress(allSteps, gf);
gf.start({ id: 'smart-tour', steps: relevant });
```

## Conversational Help

```ts
const answer = await gf.ai.chat('How do I add a promo code?');
console.log(answer.answer);          // natural language explanation
console.log(answer.highlightSelector); // CSS selector to highlight

// Highlight the element automatically
if (answer.highlightSelector) {
  document.querySelector(answer.highlightSelector)?.scrollIntoView();
}
```

## Using the Mock Provider (testing)

```ts
import { createAI, MockProvider } from '@guideflow/ai';

createAI(new MockProvider(0), gf); // 0ms delay for fast tests
const steps = await gf.ai.generate('test');
expect(steps.length).toBeGreaterThan(0);
```

## Using Ollama (local / offline)

```ts
import { createAI, OllamaProvider } from '@guideflow/ai';

createAI(
  new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3' }),
  gf,
);
```
