# Conversational Help

GuideFlow includes an embedded AI chat panel that can answer user questions and highlight relevant UI elements.

## React Component

```tsx
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

::: warning Prerequisite
`ConversationalPanel` requires `@guideflow/ai` to be configured on the GuideFlow instance.
:::

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow()
createAI(new OpenAIProvider({ apiKey: '...' }), gf)
```

## How It Works

1. User asks a question in the chat panel
2. GuideFlow serializes the current DOM context
3. The AI provider generates an answer with optional DOM element highlights
4. Referenced elements are highlighted on the page

## Programmatic Chat

Use the chat API directly without the React component:

```ts
const response = await gf.ai.chat('How do I export my data?')

console.log(response.text)        // AI answer
console.log(response.highlights)  // Array of CSS selectors to highlight
```

## ConversationalPanel Props

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Whether the panel is visible |
| `onClose` | `() => void` | Called when user closes the panel |

## Custom Integration

For Vue, Svelte, or vanilla JS, use the programmatic API and build your own UI:

```ts
const gf = createGuideFlow()
createAI(new OpenAIProvider({ apiKey: '...' }), gf)

// Build your own chat UI
async function handleUserQuestion(question: string) {
  const { text, highlights } = await gf.ai.chat(question)

  // Display the answer in your UI
  displayAnswer(text)

  // Optionally highlight elements
  if (highlights?.length) {
    highlights.forEach(selector => {
      gf.hotspot(selector, { title: 'Relevant', placement: 'top' })
    })
  }
}
```
