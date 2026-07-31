---
description: GuideFlow's chat API answers user questions about the current page and returns CSS selectors for the relevant elements, with an optional React panel.
keywords: GuideFlow conversational AI, in-app chat onboarding, AI help widget, ConversationalPanel
---

# Conversational Help

`gf.ai.chat()` sends a question plus a snapshot of the current page to your AI provider and returns
an answer with a list of selectors the model considered relevant. `@guideflow/react` ships a small
panel component on top of it.

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// Keep createAI's return value — it is the binding typed with `.ai`.
const gf = createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), createGuideFlow())
```

`ProxyProvider` keeps the API key on your server — see
[Running AI through your own server](./ai-proxy).

## Programmatic Chat

```ts
const answer = await gf.ai.chat('How do I export my data?')

console.log(answer.text)        // string — the answer
console.log(answer.highlights)  // string[] — CSS selectors, possibly empty
console.log(answer.confidence)  // number | undefined
```

### Signature

```ts
chat(question: string, root?: Element | null): Promise<GuidedAnswer>
```

The optional second argument is the **DOM root to serialize** (default `document.body`) — the same
scoping argument [`generate()`](./ai-generate) takes. Narrow it when the question concerns one
region, both for answer quality and to send less page content to the model.

### GuidedAnswer

```ts
interface GuidedAnswer {
  text: string
  highlights: string[]
  confidence?: number
  suggestedSteps?: Step[]
}
```

`highlights` is always an array — never `undefined`. A provider returning a single
`highlightSelector` has it folded into the array by response validation. `suggestedSteps` is part of
the type but no bundled provider populates it.

## How It Works

1. The question and `serializeDOM(root)` output are sent to `provider.answerQuestion()`.
2. The response is validated: a non-string `text` falls back to
   `'Sorry, I could not answer that.'`, and non-string entries in `highlights` are dropped.
3. `answer:ready` is emitted on the brain, and the `GuidedAnswer` is returned.

Nothing on the page changes as a result. Acting on `highlights` is up to you.

## React Component

```tsx
import { useState } from 'react'
import { ConversationalPanel } from '@guideflow/react'

function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Help</button>
      <ConversationalPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

The panel must be rendered inside a `TourProvider` — it reads the instance from context.

::: warning Prerequisite
`ConversationalPanel` calls `gf.ai.chat()`. Without `@guideflow/ai` attached to the instance it
renders a message saying the AI module is not configured, rather than failing.
:::

### ConversationalPanelProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | `true` | Renders `null` when false |
| `onClose` | `() => void` | — | When omitted, no close button is rendered |
| `placeholder` | `string` | `'Ask anything about this page...'` | Input placeholder |
| `title` | `string` | `'Need help?'` | Header text, also the dialog's accessible name |
| `className` | `string` | — | Appended to the built-in `gf-chat-panel` class |

When an answer comes back, the panel **scrolls each highlighted element into view**. It does not
spotlight them, and it does not start a tour.

## Custom Integration

For Vue, Svelte, or vanilla JS, use the API directly:

```ts
async function handleUserQuestion(question: string) {
  const { text, highlights } = await gf.ai.chat(question)

  displayAnswer(text)

  highlights.forEach((selector) => {
    gf.hotspot(selector, { title: 'Relevant', placement: 'top' })
  })
}
```

`gf.hotspot()` returns a hotspot id — keep it and pass it to `gf.removeHotspot(id)` when the answer
is dismissed, or the beacons accumulate.

## What leaves the page

Every call ships a DOM snapshot to a model. See [Privacy](./privacy).
