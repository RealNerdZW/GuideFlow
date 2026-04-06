---
description: "@guideflow/ai — AI-powered tour generation, intent detection and conversational help for GuideFlow. Auto-generate steps from DOM, detect when users need help."
keywords: "@guideflow/ai, AI product tour, auto-generate tour steps, intent detection onboarding, conversational tour"
---

# @guideflow/ai

**AI-powered tour generation, intent detection, and conversational help.**

[![npm version](https://img.shields.io/npm/v/@guideflow/ai.svg)](https://www.npmjs.com/package/@guideflow/ai)

## Installation

```bash
npm install @guideflow/core @guideflow/ai openai  # or @anthropic-ai/sdk
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createAI()` | Augments a GuideFlow instance with `.ai` |
| `GuideBrain` | Core AI engine |
| `OpenAIProvider` | OpenAI backend |
| `AnthropicProvider` | Anthropic backend |
| `OllamaProvider` | Local Ollama backend |
| `MockProvider` | Testing mock |
| `serializeDOM` | DOM serialization utility |

## Peer Dependencies

- `openai` >= 4.0.0 (optional)
- `@anthropic-ai/sdk` >= 0.17.0 (optional)

## Links

- [npm](https://www.npmjs.com/package/@guideflow/ai)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/ai)
- [AI Overview](/guide/ai)
- [Auto-Generate Tours](/guide/ai-generate)
- [Intent Detection](/guide/ai-intent)
- [Conversational Help](/guide/ai-chat)
