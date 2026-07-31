---
description: GuideFlow intent detection buffers user events and asks your AI provider to classify them, emitting an intent signal you wire to your own tours.
keywords: GuideFlow intent detection, behavioural onboarding, user behaviour monitoring, IntentSignal
---

# Intent Detection

`GuideBrain` can buffer user interactions and ask your AI provider to classify what the user is
doing. It emits an `intent:detected` signal with the result.

::: warning The signal is not wired to anything
GuideFlow does **not** start, branch, or suppress a tour in response to an intent signal. There is no
auto-triggering. `intent:detected` is an event you subscribe to, and every reaction to it is code you
write. Treat this page as documenting a classifier, not an automation.
:::

## Setup

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// Keep createAI's return value — it is the binding typed with `.ai`.
const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
  { autoWatch: false },
)
```

Use `ProxyProvider` — see [Running AI through your own server](./ai-proxy). Intent detection issues a
provider call every time the user goes quiet, so this is the feature most likely to run up a bill on
a leaked browser key.

## Start Watching

```ts
const stopWatching = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    void gf.start(helpFlow)
  }
})

// Stop watching when no longer needed
stopWatching()
```

`watch()` returns a cleanup function. Calling it a second time while already watching returns a
no-op cleanup — the original return value is the one that actually detaches the listeners.
`destroy()` (called for you when the GuideFlow instance is destroyed) detaches everything.

## What is captured

`watch()` attaches four passive listeners:

| DOM event | Recorded as | `target` |
|---|---|---|
| `click` on `document` | `'click'` | `tag#id` or `tag.first-class` |
| `input` on `document` | `'focus'` | `tag#id` or `tag.first-class` |
| `scroll` on `window` | `'scroll'` | `'window'` |
| `keydown` on `document` | `'keydown'` | the key name |

Only a shallow selector is recorded — never the value of an input. Events accumulate in a buffer
capped at `maxEventBuffer` (default 200); `clearBuffer()` empties it.

Each event resets a debounce timer. `intentDebounceMs` (default 2000) after the last event, the whole
buffer is sent to `provider.detectIntent()`. The buffer is **not** cleared afterwards, so successive
calls re-send overlapping history. The built-in providers only forward the most recent 20 events.

## Signal Types

The provider is asked to pick one of four labels. Anything else it returns is coerced to
`'exploring'` by response validation.

| Type | Meaning |
|------|---------|
| `confused` | The model judged the interaction pattern erratic |
| `stuck` | The model judged the user to be making no progress |
| `exploring` | The model judged the user to be browsing. Also the fallback for any unparseable or unrecognised response |
| `engaged` | The model judged the user to be working productively |

These are the model's judgement, not a deterministic heuristic. There is no rule in GuideFlow that
maps a click rate to `confused`.

## Signal Object

```ts
interface IntentSignal {
  type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  /** A selector the model pointed at, when it supplied one. */
  element?: string
  /** 0–1. Clamped on the way in; 0 when the provider returned no number. */
  confidence: number
  /** Present in the type, but no bundled provider populates it. */
  duration?: number
}
```

There is no `context` object on the signal — no page, no interaction count, no dwell time. If you
need those, capture them yourself alongside the handler.

## Responding to Intents

Every branch below is application code. Nothing here happens by default.

```ts
gf.ai.on('intent:detected', (signal) => {
  switch (signal.type) {
    case 'confused':
      if (signal.confidence > 0.8) void gf.start(helpFlow)
      break
    case 'stuck':
      gf.hotspot('#help-btn', { title: 'Need help?', body: 'Click here for assistance.' })
      break
    case 'exploring':
    case 'engaged':
      // No intervention.
      break
  }
})
```

`gf.start()` takes a `FlowDefinition` — `{ id, initial, states }` — or the id of a flow already
registered with `gf.createFlow()`. See [Flows and steps](./flows-and-steps).

## Errors

A failed provider call emits `error` on the brain and rejects the internal promise. Subscribe, or a
rejected detection is invisible:

```ts
gf.ai.on('error', (err) => console.warn('[intent]', err))
```

## Auto-Watch Mode

```ts
createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), gf, { autoWatch: true })
```

`watch()` is then called from the `GuideBrain` constructor. The cleanup function is kept internally
and released by `destroy()`; you do not get a handle to it, so use the default (`false`) if you need
to stop watching without destroying the brain.

## Manual detection

You can skip the debounce entirely and classify the current buffer on demand:

```ts
const signal = await gf.ai.detectIntent()
```
