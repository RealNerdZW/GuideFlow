# Running AI through your own server

**Do not put an LLM API key in browser code.**

`OpenAIProvider` and `AnthropicProvider` accept an `apiKey`. If you construct one of those in code
that runs in a browser, the key is compiled into your JavaScript bundle and is readable by anyone who
opens devtools. There is no configuration that changes this — the browser has to be able to read the
key in order to send it, and so does your visitor.

Earlier versions of these docs showed exactly that pattern. It was wrong, and it has been corrected
throughout.

Use `ProxyProvider`, which holds no credential at all:

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

const gf = createGuideFlow()

createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), gf)
```

Your endpoint holds the key and can do the things a browser cannot: authenticate the caller, rate
limit, cap spend, and log what was asked.

If you construct a key-holding provider in a browser anyway, GuideFlow logs a one-time warning
pointing here. It does not stop you — SSR, tests and Node scripts all construct these providers
legitimately — but the mistake is no longer silent.

---

## The wire format

`ProxyProvider` sends one `POST` per call, with a `kind` discriminator:

| `kind` | Request body | Expected response |
|---|---|---|
| `generateSteps` | `{ kind, context: DOMContext, prompt: string }` | `Step[]` |
| `detectIntent` | `{ kind, events: UserEvent[] }` | `IntentSignal` |
| `answerQuestion` | `{ kind, question: string, context: PageContext }` | `GuidedAnswer` |

Return either the bare value or `{ data: <value> }` — both are accepted.

Responses are **validated client-side** regardless of what you return, so a bug or a compromise in
your backend cannot inject arbitrary shapes into the tour engine. Steps missing an `id` are dropped,
an unknown `placement` is stripped, and a malformed `IntentSignal` falls back to
`{ type: 'exploring', confidence: 0 }`.

---

## A minimal Express implementation

```ts
import express from 'express'
import OpenAI from 'openai'

const app = express()
app.use(express.json({ limit: '1mb' }))

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

app.post('/api/guideflow-ai', requireSession, rateLimit, async (req, res) => {
  const { kind } = req.body

  const prompt =
    kind === 'generateSteps'
      ? `Generate a product tour as a JSON array of steps.
Prompt: ${req.body.prompt || 'Create an overview tour of the page.'}
DOM: ${JSON.stringify(req.body.context)}
Return: [{ id, title, body, target?, placement? }]`
      : kind === 'detectIntent'
        ? `Classify this user's intent from these events.
Events: ${JSON.stringify(req.body.events.slice(-20))}
Return: { type: 'confused'|'stuck'|'exploring'|'engaged', confidence: number }`
        : `Answer this question about the page.
Question: ${req.body.question}
Page: ${JSON.stringify(req.body.context)}
Return: { text: string, highlights?: string[] }`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    // Structured output: ask for JSON rather than hoping for it.
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
  })

  res.json(JSON.parse(completion.choices[0]?.message?.content ?? 'null'))
})
```

`requireSession` and `rateLimit` are yours — they are the entire reason this endpoint exists. Without
them you have re-created the original problem with extra steps: an unauthenticated endpoint that
spends your quota is only marginally better than a leaked key.

---

## What leaves the browser

`ProxyProvider` sends whatever `serializeDOM()` captured to *your* server, and your server sends it
on to the model vendor. That payload includes the page URL, its title, and up to 80 elements with
their selectors, roles, geometry and visible text.

It does **not** read input values. It does capture text content, which on a real application page
routinely includes names, order numbers, balances and email addresses.

Treat that as a data-processing decision, not an implementation detail:

- decide whether your LLM vendor is an acceptable processor for that data;
- scrub or redact on your server before forwarding;
- exclude sensitive regions from capture with `data-gf-private` (see
  [Privacy](./privacy.md));
- disclose it wherever you disclose your other subprocessors.

---

## Local models

`OllamaProvider` needs no key and talks to a server you already run, so it is safe from a credential
standpoint:

```ts
import { OllamaProvider } from '@guideflow/ai'

createAI(new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama3' }), gf)
```

The data-egress question still applies if that Ollama instance is not on the user's own machine.

---

## Testing without a model

`MockProvider` returns deterministic fixtures and makes no network call. Use it in tests, in
Storybook, and in the demo app:

```ts
import { MockProvider } from '@guideflow/ai'

createAI(new MockProvider(), gf)
```
