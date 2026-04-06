---
description: "GuideBrain API reference — generate AI tours, detect user intent, compress steps, and answer questions in @guideflow/ai."
keywords: GuideBrain, GuideFlow AI, AI tour generation, intent detection, @guideflow/ai
---

# GuideBrain

The `GuideBrain` class orchestrates all AI interactions for a GuideFlow instance. It is created internally by [`createAI()`](./create-ai) and exposed via `instance.ai`.

## Constructor

```ts
new GuideBrain(provider: AIProvider, opts?: GuideBrainOptions)
```

You rarely need to instantiate this directly — use [`createAI()`](./create-ai) instead.

## Methods

### `generate(prompt?, root?)`

Captures the current DOM, sends it to the AI provider, and returns generated steps.

```ts
async generate(prompt?: string, root?: Element | null): Promise<Step[]>
```

| Parameter | Type                   | Description |
|-----------|------------------------|-------------|
| `prompt`  | `string`               | Natural language description of the tour goal |
| `root`    | `Element \| null`      | Root element to capture (defaults to `document.body`) |

```ts
const steps = await gf.ai.generate('Show the user how to create a project')
await gf.start({ id: 'ai-tour', steps })
```

---

### `chat(question)`

Answers a free-form question about the current page using the AI provider.

```ts
async chat(question: string): Promise<GuidedAnswer>
```

```ts
const answer = await gf.ai.chat('Where do I find my billing settings?')
console.log(answer.answer)      // human-readable answer string
console.log(answer.stepId)      // optional step to highlight
```

---

### `watch()`

Starts passively monitoring user events (clicks, focus, scroll) to emit intent signals.

```ts
watch(): void
```

Safe to call multiple times — duplicate listeners are guarded internally.

---

### `stopWatch()`

Stops monitoring user events and clears the internal event buffer.

```ts
stopWatch(): void
```

---

### `compress(steps)`

Removes steps the AI determines the user has already mastered based on their event history.

```ts
async compress(steps: Step[]): Promise<Step[]>
```

---

### `on(event, listener)`

Subscribe to brain events. Returns an unsubscribe function.

```ts
on<K extends keyof BrainEventMap>(event: K, listener: (payload: BrainEventMap[K]) => void): () => void
```

#### BrainEventMap

| Event               | Payload          | Description |
|---------------------|------------------|-------------|
| `intent:detected`   | `IntentSignal`   | Fired when user intent is detected after a period of inactivity |
| `steps:generated`   | `Step[]`         | Fired after `generate()` resolves |
| `answer:ready`      | `GuidedAnswer`   | Fired after `chat()` resolves |
| `error`             | `Error`          | Fired when any AI operation fails |

```ts
const off = gf.ai.on('intent:detected', (signal) => {
  console.log('Detected intent:', signal)
})

// Later, unsubscribe:
off()
```

---

### `destroy()`

Removes all DOM event listeners, clears the event buffer, and cleans up internal state.

```ts
destroy(): void
```

## See Also

- [createAI()](./create-ai) — how to attach AI to a GuideFlow instance
- [Providers](./providers) — available AI backends
