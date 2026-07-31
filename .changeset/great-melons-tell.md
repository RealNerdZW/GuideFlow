---
"@guideflow/core": minor
---

Flow versioning, and targeting / scheduling / frequency capping

## Flow versioning

A stored `{ state, stepIndex }` is a coordinate into a structure. Rename a state, delete a step or
reorder two, redeploy — and every returning user was restored into a position that no longer meant
what it did when it was written. `restore()` did not check step identity at all.

Two independent gates now, cheapest first:

- **`stepId` is preferred over `stepIndex`** on every snapshot. An index means nothing once a step
  has been inserted above it. A stored id that no longer exists is a **rejection**, not something to
  clamp — there is no honest coordinate to fall back to.
- **`FlowDefinition.version`** catches everything else, including a renamed state. Set it by hand, or
  derive it from the flow's own shape:

  ```ts
  import { withFingerprint } from '@guideflow/core/versioning'
  const flow = withFingerprint({ id: 'onboarding', initial: 'intro', states: { … } })
  ```

  `flowFingerprint` hashes `initial`, state names, `final` flags, step ids **in order**, and the
  transition table. It ignores content, target, placement, padding, media, `showIf`,
  `onEntry`/`onExit`, `context`, `targeting` and the flow id — so fixing a typo does not restart
  anybody's tour.

A discarded snapshot emits `progress:discard` with `reason: 'version' | 'structure'`, so you can tell
"I changed the flow" from "the position did not survive".

`FlowMachine.restore` also now **refuses a state with no steps**. It used to return `true`, leaving
`isActive === true` with nothing painted.

Not closed, and worth knowing: `isCompleted` stays version-blind (keyed on flowId alone, with no
`clearCompleted`), so shipping v2 will never re-show a flow to anyone who completed v1.

## Targeting, scheduling and frequency capping

There was no `audience`, `urlPattern`, `trigger` or `priority` field anywhere on `FlowDefinition`, and
no rule evaluator. `ProgressStore` was strictly per-flow: no global "last shown at", no session
counter, no cooldown, no queue when two flows both wanted to start.

```ts
import { createTargeting } from '@guideflow/core/targeting'

gf.createFlow({
  id: 'billing-tour',
  targeting: {
    startTrigger: 'load',
    urlPattern: '/billing/**',
    audience: { where: { plan: 'pro' }, flags: ['billing-v2'] },
    schedule: { startsAt: '2026-08-01T00:00:00Z' },
    frequency: { maxPerSession: 1, cooldownMs: 7 * 24 * 3600_000 },
    priority: 10,
  },
  initial: 'main',
  states: { … },
})

createTargeting(gf, { globals: { maxPerSession: 1 } }).install()
```

**Data in core, policy in the subpath.** `FlowDefinition.targeting` is types only — zero runtime
bytes — so a flow stays a plain serialisable object a CMS can store. The rules that act on it live in
`@guideflow/core/targeting` and hook through existing public seams. The one core addition is
`ProgressStore.getRecord`/`setRecord`, which puts cap state under the same prefix `resetUser()`
already sweeps.

Targeting is the **third scope of a guard the state machine already has**: `FlowTransition.guard`
gates a transition, `Step.showIf` gates a step, `targeting.audience` gates entering the flow. Same
context, same predicate shape.

Because every rule compiles to the same shape, an evaluation names the guard that rejected:

```ts
await targeting.evaluate()
// [{ flow, eligible: false, priority: 10, blockedBy: ['url'] }, …]
```

Details that carry the design:

- **Guard order is load-bearing** — everything free is checked before anything that reads storage, so
  a `selector` trigger firing on every DOM mutation does not issue a storage read per mutation.
- **A throwing audience predicate means "not eligible"**, not a crash. Deliberately unlike
  `Step.showIf`, whose predicate throws outside the engine's error boundary: targeting evaluates
  *every* registered flow, so one bad rule must not take the rest down.
- **Shows are counted on `tour:start`**, not when `gf.start()` resolves — `start()` can return
  without starting, and a manual start elsewhere in your app should still count against a global cap.
- **A running tour is never interrupted.** `autoStart()` returns `null` when `gf.isActive`, because
  starting a second tour ends the first and emits `tour:abandon`.
- **A session is a 30-minute idle gap** derived from the show history. No `sessionStorage`, no stored
  session id — SSR-safe and shared across tabs for free.
- **`anonymousId` is off by default.** Turning it on makes GuideFlow persist a first-party
  identifier, and core cannot consult `@guideflow/analytics`'s consent and Do-Not-Track policy
  because core never imports a sibling. Without it, frequency caps are skipped and everything else
  still applies.

Known limitation, documented: the cap record is a read-modify-write over an async driver with no
lock, so two tabs starting tours in the same instant can lose one increment.

Also: `gf.context` is now on `GuideFlowInstance` — the running machine's context while a tour is
live, the configured default otherwise.

Sizes, each gated independently: `@guideflow/core` **14.93 kB / 15 kB**, `./targeting` 2.18 kB,
`./navigation` 1.55 kB, `./html` 767 B, `./versioning` 336 B.
