---
description: "GuideBrain API reference — generate AI tours, classify user intent, compress steps, and answer page questions in @guideflow/ai."
keywords: GuideBrain, GuideFlow AI, AI tour generation, intent detection, @guideflow/ai
---

# GuideBrain

The `GuideBrain` class orchestrates AI interactions for a GuideFlow instance. It is created by
[`createAI()`](./create-ai) and exposed as `instance.ai`.

## Constructor

```ts
new GuideBrain(provider: AIProvider, opts?: GuideBrainOptions)
```

You rarely need this directly — use [`createAI()`](./create-ai), which also wires `destroy()` into
the instance lifecycle.

### GuideBrainOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `intentDebounceMs` | `number` | `2000` | Idle time before a buffered batch is sent to `detectIntent()` |
| `maxEventBuffer` | `number` | `200` | Buffer cap; the oldest event is dropped past it |
| `autoWatch` | `boolean` | `false` | Call `watch()` from the constructor |

## Methods

### `generate(prompt?, root?)`

Serializes the DOM under `root`, sends it to the provider, emits `steps:generated`, and returns the
validated steps.

```ts
generate(prompt?: string, root?: Element | null): Promise<Step[]>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt`  | `string` | `''` | Natural-language description of the tour goal |
| `root`    | `Element \| null` | `document.body` | Root element to serialize |

The second argument is a **DOM element**, not an options object. There is no `maxSteps` or default
`placement` parameter.

```ts
const steps = await gf.ai.generate('Show the user how to create a project')

await gf.start({
  id: 'ai-tour',
  initial: 'main',
  states: { main: { steps, final: true } },
})
```

Rejects — and emits `error` — if the provider throws.

---

### `chat(question, root?)`

Serializes the DOM under `root`, asks the provider, emits `answer:ready`, returns a `GuidedAnswer`.

```ts
chat(question: string, root?: Element | null): Promise<GuidedAnswer>
```

```ts
const answer = await gf.ai.chat('Where do I find my billing settings?')

answer.text        // string
answer.highlights  // string[] — CSS selectors, always an array
answer.confidence  // number | undefined
```

`GuidedAnswer` has no `answer` field and no `stepId` field.

---

### `watch()`

Attaches passive `click`, `input`, `scroll` and `keydown` listeners, buffering each as a `UserEvent`.
Each event resets a debounce timer; `intentDebounceMs` after the last one, `detectIntent()` runs.

```ts
watch(): () => void
```

**Returns a cleanup function.** Outside a browser it returns a no-op. Calling `watch()` while already
watching also returns a no-op — hold on to the value returned by the first call, because that is the
one that detaches the listeners.

```ts
const stopWatching = gf.ai.watch()
// …
stopWatching()
```

There is no `stopWatch()` method. Use the returned function, or [`destroy()`](#destroy).

---

### `detectIntent()`

Sends the current buffer to the provider immediately, bypassing the debounce. Emits
`intent:detected`, or `error` on failure.

```ts
detectIntent(): Promise<IntentSignal>
```

The buffer is not cleared by a detection — call [`clearBuffer()`](#clearbuffer) if you want a fresh
window.

---

### `compress(steps, instance, userId?)`

Asks the provider to classify the current buffer, then filters the supplied steps.

```ts
compress(steps: Step[], instance: GuideFlowInstance, userId?: string): Promise<Step[]>
```

| Parameter | Type | Description |
|---|---|---|
| `steps` | `Step[]` | The full list to filter |
| `instance` | `GuideFlowInstance` | **Required.** Used for the `progress` lookup |
| `userId` | `string` | Optional. Without it, the persistence check is skipped entirely |

The filter is two rules, both simple:

1. When `userId` is supplied, a step is dropped if `instance.progress.isCompleted(userId, 'step:' + step.id)`
   returns true. **Nothing in GuideFlow writes those keys** — core records completion per *flow*, not
   per step. Populate them yourself with `gf.progress.markCompleted(userId, 'step:' + id)` or this
   rule never fires.
2. A step is dropped if the detected signal has `confidence > 0.8`, a `type` other than `'confused'`,
   and the step's `id` contains the substring `'intro'`.

If the provider call throws, the original array is returned unchanged.

```ts
const relevant = await gf.ai.compress(allSteps, gf, currentUser.id)
```

---

### `on(event, listener)`

Subscribe to brain events. Returns an unsubscribe function.

```ts
on<K extends keyof BrainEventMap>(event: K, listener: (payload: BrainEventMap[K]) => void): () => void
```

#### BrainEventMap

| Event | Payload | Emitted by |
|---|---|---|
| `intent:detected` | `IntentSignal` | `detectIntent()`, including the debounced call from `watch()` |
| `steps:generated` | `Step[]` | `generate()` on success |
| `answer:ready` | `GuidedAnswer` | `chat()` on success |
| `error` | `Error` | `generate()`, `chat()` and `detectIntent()` on failure |

`compress()` emits nothing — not even `error`; it swallows provider failures and returns the input.

```ts
const off = gf.ai.on('intent:detected', (signal) => {
  console.log(signal.type, signal.confidence)
})

off()
```

A listener that throws is caught and logged with `console.error`; it does not break the other
listeners.

---

### `clearBuffer()`

Empties the buffered `UserEvent` list.

```ts
clearBuffer(): void
```

---

### `destroy()`

Clears the pending debounce timer, runs every cleanup registered by `watch()`, and drops all event
listeners. Called for you when the GuideFlow instance is destroyed, because `createAI()` wraps
`instance.destroy()`.

```ts
destroy(): void
```

It does **not** clear the event buffer — use `clearBuffer()` if you need that.

## See Also

- [createAI()](./create-ai) — attaching AI to an instance
- [Providers](./providers) — available backends
- [Intent detection](../../guide/ai-intent) — what the signal does and does not do
- [Running AI through your own server](../../guide/ai-proxy)
