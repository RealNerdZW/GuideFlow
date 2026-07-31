---
"@guideflow/ai": minor
"@guideflow/core": patch
---

AI: structured outputs, timeouts, retries, capped detection, and intent triggers that actually start a tour

**Structured outputs.** Every provider used to hand a raw completion straight to `JSON.parse`, with
one sentence in the system prompt ("Always respond with valid JSON only — no prose, no markdown
fences") as its only defence. Models ignore that routinely, and each provider's `catch` turned the
resulting throw into an empty tour — silently. Providers now request structured output at the API
level: `response_format: { type: 'json_schema', strict: true }` on OpenAI, a forced single-tool
`tool_choice` on Anthropic, and a JSON Schema `format` on Ollama. Behind that sits
`parseModelJson()`, which strips Markdown fences, extracts the first balanced JSON value from
surrounding prose, and validates before anything reaches the engine — and now *warns* when it cannot,
instead of returning `[]` and leaving you to guess whether the page simply had nothing to tour.

**Timeouts, cancellation and retries.** A grep for `signal`, `timeout`, `AbortController` and `retry`
across the package used to return zero implementation hits outside `ProxyProvider`. Ollama's `fetch`
had no signal at all, so an unreachable `baseUrl` left `generate()` pending forever. All four
providers now accept `timeoutMs`, `signal` and `maxRetries`, retry only what is worth retrying
(timeouts, network errors, 429/5xx), and never retry an abort you asked for. `GuideBrain.destroy()`
cancels work already in flight rather than letting a slow provider resolve into a torn-down instance.

**Capped detection.** `push()` ran on every click, input, keydown and scroll, and every 2-second lull
issued a full provider round trip — so one stray scroll bought an LLM call, with no floor, no cooldown
and no ceiling. Now `minEventsBeforeDetect` (5), `detectCooldownMs` (30s) and `maxDetectsPerSession`
(20), with a high-water mark so the same events are never re-analysed. `gf.ai.stats` reports what has
been spent. An explicit `detectIntent()` stays uncapped — that call is yours.

**No more unhandled rejections.** `scheduleDetect` used `void this.detectIntent()`, which discards the
promise without attaching a rejection handler; `detectIntent` re-throws after emitting `error`. An
expired key, a rate limit or a network blip therefore became an unhandled rejection on a timer, which
takes a Node process down outright.

**Intent triggers.** `intent:detected` was emitted and connected to nothing, while the README and the
intent guide both promised "automatically surfacing the right tour at the right moment". `createAI`
now accepts `intentTriggers`, mapping a signal type and confidence floor to a flow. Opt-in and empty
by default. Three behaviours are deliberate: a tour already on screen is never interrupted;
`minConfidence` defaults to 0.7 so a failed detection (which falls back to `confidence: 0`) cannot
fire a rule; and `once` defaults to true, because a tour that reopens every time the user looks
confused *at the tour* is a loop.

**The Anthropic default model.** `claude-3-haiku-20240307` retired on 2026-04-19 and returns HTTP 404,
so anyone following the documented setup got a 404 on every call. The default is now
`claude-haiku-4-5`, and the two docs tables that repeated the stale id are corrected.

**`@guideflow/core`:** `flowId` is now declared on `GuideFlowInstance`. It has always been reachable —
`TourEngine` declares it on the prototype and the `Object.assign` literal does not shadow it — but the
interface omitted it, so TypeScript consumers could not read which flow was running.
