---
"@guideflow/analytics": minor
"@guideflow/core": minor
---

A/B variants can finally change a tour — and the bucketing that made them meaningless is fixed

## `startVariant()`

`ExperimentEngine` has always assigned variants, and `Variant<T>` has always been generic — so
`value` could always have been a whole `FlowDefinition`. What did not exist was any way to act on the
result and record that the user saw it. The module docstring showed `createGuideFlow({ theme })`,
which has never type-checked, and the A/B docs page then said applying the variant was "application
code" — which was true, and was the bug.

```ts
import { startVariant } from '@guideflow/analytics'

await startVariant(gf, engine, {
  id: 'onboarding-shape',
  variants: [
    { id: 'control',   value: shortFlow },
    { id: 'treatment', value: longFlow },
  ],
}, { collector })
```

Assigns, starts the flow the variant names, emits `guideflow.experiment.exposed`. The variant value
can also be a registered flow id — it is exactly `gf.start()`'s parameter type, so no map is needed.

Returns `null`, starting and emitting nothing, in two cases: a tour is **already running** (starting
a second ends the first, which emits `tour:abandon` and would be recorded as the user giving up), or
`gf.start()` **declined** — unknown id, dismissed, already completed. Exposure is recorded only for
users who actually saw a tour, or the experiment's denominator is wrong.

**Zero bytes reach `@guideflow/core`.** This package still imports core by type only.

## The bucketing was statistically broken

⚠️ **Assignments change.** An experiment already in flight will re-bucket its users; start a fresh
experiment id rather than reading results across the boundary.

Assignment was `djb2(userId + ':' + experimentId) % totalWeight` — for the common two-arm case,
`% 2`, which is the low bit of djb2. That bit is the parity of the XOR chain over the input, so
changing only the experiment id shifted it by a constant. Measured over 10 000 synthetic ids:

| pair | agreement |
|---|---|
| `exp-one` vs `exp-two` | **100.0%** |
| `tour-theme-2024` vs `cta-experiment` | **0.0%** |

Every experiment's *marginal* split was a clean 50/50, which is exactly why this survived — every
obvious test passes. Only the joint distribution was degenerate, and a user in the treatment arm of
every concurrent experiment makes the results of all of them uninterpretable.

Now FNV-1a with a murmur3 avalanche step, bucketed over a fixed 10 000-slot space rather than
`totalWeight`. Measured agreement is 49–50% across every pair tested, and a 9:1 weight split is now
expressible at all.

## `AnalyticsCollector.track()`

`send()` is private and is the only path through `PrivacyPolicy` — consent, Do-Not-Track, sampling,
URL scrubbing, key redaction. `track(event, properties)` is the public door onto it, so a custom
event goes *through* that pipeline rather than around it.

## `theme` on `GuideFlowConfig`

Five themes ship in `@guideflow/core/styles` and nothing in the library ever set the `data-gf-theme`
attribute they key on — a documented feature that did nothing.

```ts
createGuideFlow({ theme: 'bold' })   // or configure({ theme }) at any time
```

Set on `<html>`, not the popover: the spotlight overlay, hotspot beacons and hint badges are all
portalled to `document.body` and read the same custom properties, so only the root themes every
surface. An empty string removes it; leaving it `undefined` never touches the attribute, so a host
page that sets its own theme is not clobbered.

## `StepAction.action` accepts a custom event

It was typed `… | (string & object)`, and **no string literal satisfies `string & object`** — so
`{ action: 'my-custom-event' }` was a type error and core's own documented escape hatch could not be
expressed at all. `@guideflow/react`'s tests carried a cast to work around it. Now
`string & Record<never, never>`, and the cast is gone.

## Build fix

`packages/core/tsup.config.ts` grew to five configs across Phase 7, and the first still carried
`clean: true`. tsup runs them concurrently, so that clean raced the subpath builds and intermittently
deleted their `.d.ts` files — with no build error. `scripts/verify-pack.mjs` caught it, which is what
it exists for. `dist/` is now removed once, up front, by the build script.

`@guideflow/core` measures **14.96 kB against a 15 kB limit**.
