# Intent Detection

GuideFlow can passively monitor user behaviour and detect when they need help — automatically surfacing the right tour at the right moment.

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow()
createAI(new OpenAIProvider({ apiKey: '...' }), gf, { autoWatch: false })
```

## Start Watching

```ts
const stopWatch = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    gf.start(helpFlow)
  }
})

// Stop watching when no longer needed
stopWatch()
```

## Signal Types

| Type | Description |
|------|-------------|
| `confused` | User is clicking randomly, scrolling erratically, or revisiting elements |
| `stuck` | User is idle on a complex form or has been on the same page too long |
| `exploring` | User is browsing features systematically |
| `engaged` | User is actively using features productively |

## Signal Object

```ts
interface IntentSignal {
  type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  confidence: number  // 0–1
  context: {
    page: string
    duration: number   // ms on current page
    interactions: number
  }
}
```

## Responding to Intents

```ts
gf.ai.on('intent:detected', (signal) => {
  switch (signal.type) {
    case 'confused':
      if (signal.confidence > 0.8) gf.start(helpFlow)
      break
    case 'stuck':
      gf.hotspot('#help-btn', { title: 'Need help?', body: 'Click here for assistance.' })
      break
    case 'exploring':
      // Let them explore — maybe show feature highlights
      break
    case 'engaged':
      // No intervention needed
      break
  }
})
```

## Auto-Watch Mode

Enable `autoWatch` to start monitoring immediately:

```ts
createAI(new OpenAIProvider({ apiKey: '...' }), gf, { autoWatch: true })
// Watching starts automatically — no need to call gf.ai.watch()
```
