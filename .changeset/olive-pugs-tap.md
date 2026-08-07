---
"@guideflow/core": minor
"@guideflow/analytics": minor
---

**Deep links: `?gf_tour=<id>` starts a named tour in the app the recipient already has.**

The only part of the demo-automation distribution layer that transfers to an embedded library, and
it is cheap because our audience is already inside the product. A support agent pastes a link into a
Zendesk reply; the customer opens it and the guide runs in their own application. No clone, no
hosting, no share page — and it makes the Zendesk / Intercom / GitBook integration row real without
writing a single integration, because they all accept a URL.

```ts
gf.createFlow({ id: 'add-payment-method', targeting: { deepLink: true }, /* … */ })
createTargeting(gf).install()   // reads the URL before its `load` trigger
```

Opt-in per flow: a URL is attacker-controlled and the recipient is signed in, so the bounded
exposure is *which* of your own tours a link can start. A link overrides **delivery** policy —
frequency caps, `urlPattern`, and a previous completion or dismissal — but never **eligibility**
policy: `audience` and `schedule` still decide who a tour is for.

**`gf.start(flow, ctx, { force: true })`** is new and public. `start()` refuses a tour the user
completed or dismissed, silently, which would make a support link do nothing for exactly the people
it is sent to. `force` skips those two checks and writes nothing — deliberately not
`progress.clearCompleted()`, which would visibly un-tick `@guideflow/checklist`, since that projects
`getCompletedFlows()`. Replaying a tour must not cost someone progress they earned. A "Show me
again" button in your own UI wants the same thing.

Targeting subpath 2.75 → 3 kB, measured 2.83 kB (ADR-021). Core entry 15.3 / 15.5 kB — only `force`
touched it.

**`computeFunnel(events)` in `@guideflow/analytics`: per-step drop-off, as a pure function.**

```ts
const [funnel] = computeFunnel(events)
funnel.completionRate
funnel.steps.filter((s) => s.dropOffRate > 0.3)   // where the tour loses people
```

The collector already emits everything a funnel needs and leaves the arithmetic to the host — right
for a library with no backend, but it meant everyone wrote the same reduction. No storage, no
network, nothing reaches core. It counts `unfinished` apart from `abandoned` (a closed tab is not a
user giving up), sorts by timestamp first so a merged multi-transport stream is not mis-attributed,
and reports median dwell rather than mean so one idle tab cannot move it.

**Step events now carry `flow_id`.** `guideflow.step.viewed`, `.exited` and `.skipped` shipped with
`flow_id: undefined`, because the engine puts only a `stepId` on them. A step id is unique only
*within* a flow, so every dashboard had to infer the flow from surrounding `tour.started` events and
hope the stream was in order. The collector tracks the running flow now; a step with no tour open
still reports `undefined` rather than a guess.
