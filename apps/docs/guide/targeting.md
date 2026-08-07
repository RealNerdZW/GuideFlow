---
description: Decide who sees a GuideFlow tour, on which pages, and how often — audience rules, URL patterns, schedules, frequency caps and auto-start triggers.
keywords: product tour targeting, audience rules, frequency capping, onboarding scheduling, tour orchestration
---

# Targeting & frequency

Deciding *who* sees a tour, *where*, and *how often* used to be entirely your problem, hand-written
at every call site. There was no `audience`, `urlPattern`, `trigger` or `priority` field anywhere,
and no way to say "show this at most once a week" or "never show two tours in one session".

## Setup

Targeting rules live on the flow; the runtime that enforces them is an opt-in subpath:

```ts
import { createGuideFlow } from '@guideflow/core'
import { createTargeting } from '@guideflow/core/targeting'

const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })

gf.createFlow({
  id: 'billing-tour',
  targeting: {
    startTrigger: 'load',
    urlPattern: '/billing/**',
    audience: { where: { plan: 'pro' } },
    frequency: { maxPerSession: 1, cooldownMs: 7 * 24 * 3600_000 },
    priority: 10,
  },
  initial: 'main',
  states: { /* … */ },
})

const targeting = createTargeting(gf, { globals: { maxPerSession: 1 } })
targeting.install()
```

::: warning `targeting` does nothing on its own
`@guideflow/core` never reads the field. Without `createTargeting()` a flow with a full targeting
block behaves exactly like one with none. That is the price of keeping the rules out of the
size-gated bundle, and it is the single most likely thing to catch you out.
:::

## Why the rules look like `showIf`

Targeting is the **third scope of a guard the state machine already has**:

| Scope | Field | Gates |
|---|---|---|
| Transition | `FlowTransition.guard` | Moving between states |
| Step | `Step.showIf` | Showing one step |
| Flow | `targeting.audience` | Entering the flow at all |

Same `GuidanceContext`, same predicate shape. There is nothing new to learn.

## Audience

Prefer the declarative form — it survives `JSON.stringify`, so a flow stored in a CMS or written to
a `.flow.json` keeps its rules. A predicate does not: `stringifyFlowFile` refuses to write a flow
that contains one.

```ts
audience: {
  roles: ['admin', 'owner'],           // any-of against context.roles
  flags: ['billing-v2', 'invoices'],   // ALL-of against context.featureFlags
  where: {
    plan: ['pro', 'team'],             // an array is any-of
    seats: 5,                          // a primitive is ===, with no coercion
  },
}
```

`flags` is deliberately all-of: a feature gate that only needs one of several flags is not a gate.

The predicate form is available when you need it, and **a predicate that throws means "not
eligible"** rather than crashing the evaluation:

```ts
audience: (ctx) => ctx.seats > 10 && ctx.trialEndsAt > Date.now()
```

That is deliberately unlike `Step.showIf`, whose predicate throws outside the engine's error
boundary. Targeting evaluates *every* registered flow, so one bad rule must not take the rest down
with it.

## URL patterns

```ts
urlPattern: '/billing/**'
```

| Pattern | Matches | Does not match |
|---|---|---|
| `/billing` | `/billing` | `/billing/invoices` |
| `/billing/*` | `/billing/invoices` | `/billing/invoices/42` |
| `/billing/**` | both | `/settings` |
| `https://app.example.com/**` | any path on that host | another host |

Patterns starting with `/` match `location.pathname`; anything else matches the full href. They are
**anchored**, so `/user` does not match `/users/42`, and metacharacters are literal — `/v1.0/docs`
means exactly that. A `RegExp` is tested against the full href and does not serialise.

## Schedules

```ts
schedule: { startsAt: '2026-08-01T00:00:00Z', endsAt: 1788220800000 }
```

ISO-8601 strings and epoch milliseconds are interchangeable. Never a `Date` — that does not
round-trip through JSON. An **unparseable** bound is ignored rather than treated as blocking
forever: a typo in a date should not silently disable a tour with no diagnostic.

## Frequency

```ts
frequency: {
  maxPerSession: 1,                    // once per session
  maxTotal: 3,                         // three times, ever
  cooldownMs: 7 * 24 * 3600_000,       // and never twice in a week
}
```

Plus caps that apply across **every** flow — the knob that stops someone being shown four tours in a
row:

```ts
createTargeting(gf, { globals: { maxPerSession: 1, cooldownMs: 3600_000 } })
```

A **session** is a 30-minute idle gap, derived by walking the show history newest-first. No
`sessionStorage`, no stored session id — which makes it SSR-safe and shared across tabs for free.
Adjust with `sessionGapMs`.

`maxTotal: 0` blocks a flow outright. That is not a special case (`0 >= 0`), and it is a legitimate
way to disable a flow without deleting it.

### Caps need an identity

Frequency caps are stored per user, under the same key prefix `progress.resetUser()` sweeps. With no
`context.userId` they are **skipped entirely** — url, audience and schedule rules still apply.

`anonymousId: true` mints and persists a first-party identifier instead. It is **off by default**:
turning it on makes GuideFlow store an identifier, and `@guideflow/core` cannot consult
`@guideflow/analytics`'s consent and Do-Not-Track policy, because core never imports a sibling
package. That decision is yours to make explicitly.

## Triggers

| `startTrigger` | When it fires |
|---|---|
| `'manual'` *(default)* | Never auto-starts. `gf.start(flow)` only |
| `'load'` | On `install()`, and on every route change |
| `'selector'` | The first time `selector` matches something in the DOM |
| `'event'` | When you call `targeting.send('name')` |

"Every route change" means every one: `pushState` and `replaceState` (how React
Router, Vue Router and Next.js navigate), the back button, and hash changes.
`install()` uses the same watcher the [routing](/guide/routing) seam does — it
prefers the Navigation API where the browser has it and patches nothing at all,
and where it does not, it wraps whatever is installed rather than replacing it.

A `selector` trigger fires **once per flow per page load**. It will not re-arm
after the user closes the tour; use `frequency` if you want to bound it across
sessions too.

::: tip Flows can arrive whenever they like
`install()` re-reads `gf.listFlows()` on every check, so a flow registered later
— fetched from a CDN, added by a lazy route — is picked up with no ordering rule
to remember. See [Hosting flows](/guide/hosting-flows).
:::

```ts
{ startTrigger: 'selector', selector: '#empty-state' }
{ startTrigger: 'event', event: 'first-invoice-created' }
```

```ts
await targeting.send('first-invoice-created')
```

A flow with no `targeting` block is `'manual'`, so **nothing auto-starts unless you ask for it**.

## Deep links — `?gf_tour=`

A link that starts a named tour in the application the recipient already has. A support agent pastes
it into a reply; the customer opens it and lands in their own app with the guide running.

```
https://app.example.com/billing?gf_tour=add-payment-method
https://app.example.com/billing?gf_tour=add-payment-method&gf_tour_step=enter-card
```

**Opt in per flow.** A URL is attacker-controlled and the recipient is signed in, so nothing is
linkable until you say so:

```ts
gf.createFlow({
  id: 'add-payment-method',
  targeting: { deepLink: true },
  // …
})
```

`createTargeting(gf).install()` handles the rest, before its `load` trigger — someone clicked the
link on purpose, so it beats a tour that would have auto-started anyway. Without the targeting
engine, call it yourself:

```ts
import { startFromUrl } from '@guideflow/core/targeting'

await startFromUrl(gf)
```

### What a link does and does not override

| | Overridden by a link? | Why |
|---|---|---|
| `frequency` caps | ✅ yes | *How often* we would have pushed it. A human sent it and a human clicked it |
| `urlPattern` | ✅ yes | *Where* we would have pushed it |
| Already completed | ✅ yes | See below |
| Already dismissed | ✅ yes | See below |
| `audience` | ❌ **no** | *Who the tour is for.* `{ where: { plan: 'enterprise' } }` means "not this user" |
| `schedule` | ❌ **no** | Same — a tour that has ended has ended |

::: tip Replaying does not cost the user anything
`start()` normally refuses a tour the user completed or dismissed, silently — no render, no event —
which would make a support link do nothing for exactly the people support sends it to.

A deep link uses `gf.start(flow, undefined, { force: true })`, which skips those two checks and
**writes nothing**. It deliberately does *not* clear the completion record, because
[`@guideflow/checklist`](./checklist) projects completed flows: clearing one would visibly un-tick
the user's checklist. Replaying a tour must not cost someone progress they earned.

`force` is public, so a "Show me this again" button in your own UI can use it too.
:::

### The parameters are removed once the tour starts

Via `replaceState`, after the start resolves, preserving `history.state` and every other query
parameter — your UTM tags and your app's own state survive. Pass `{ strip: false }` to
`startFromUrl` if you would rather keep them.

Leaving them would break more than tidiness: `urlPattern` matching is anchored, so a full-href
pattern can never match a URL still carrying `?gf_tour=`, and every such rule would go quietly dead
for the rest of the session.

### Notes

- **Register your flows first.** If they arrive from a `fetch` (see [Hosting flows](./hosting-flows)),
  await it before installing targeting, or the link matches nothing.
- A stale `gf_tour_step` — a step that has since been renamed — opens the tour at the beginning
  rather than doing nothing.
- A deep-linked start still counts toward your global frequency caps, because the user really did
  see a tour.
- Only mark flows you are content for **any** user to start by link. A tour is authoritative-looking
  copy positioned over your real controls.

## Finding out why a tour did not show

Every rule compiles to the same shape, so an evaluation can name the guard that rejected:

```ts
const results = await targeting.evaluate()
// [{ flow, eligible: false, priority: 10, blockedBy: ['url'] }, …]
```

`blockedBy` values, in evaluation order:

`trigger` · `url` · `audience` · `schedule` · `completed` · `dismissed` · `cooldown` · `session` ·
`total` · `global-cooldown` · `global-session` · `active`

That order is load-bearing, not cosmetic: everything free is checked before anything that reads
storage, so a `selector` trigger firing on every DOM mutation does not issue a storage read per
mutation.

## Behaviour worth knowing

**A running tour is never interrupted.** `autoStart()` returns `null` when `gf.isActive`, because
starting a second tour ends the first — which emits `tour:abandon` and would be logged as the user
giving up.

**Shows are counted on `tour:start`, not when `gf.start()` resolves.** `start()` can return without
starting (a dismissed flow, a completed one), and a manual `gf.start()` elsewhere in your app should
still count against a global session cap. The consequence: a tour opened and instantly dismissed has
consumed its slot. Correct for capping attention, surprising if you read the count as "completed".

**Two `autoStart()` calls in the same tick start one tour.** The second returns the first's promise.

**The cap record is read-modify-write with no lock.** Two tabs starting tours in the same instant can
lose one increment. That is the same shape as the existing `markCompleted`, and closing it properly
needs a storage primitive none of the drivers expose.

## API

```ts
targeting.evaluate(trigger?)   // score everything; never starts, never writes
targeting.autoStart(trigger?)  // start the highest-priority eligible flow
targeting.send(event)          // consider 'event' flows matching this name
targeting.install()            // arm the 'load' and 'selector' triggers
targeting.resetCaps()          // clear this user's frequency history
targeting.destroy()            // release every listener and observer
```

Ties on `priority` keep registration order.
