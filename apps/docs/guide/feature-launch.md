---
description: Ship an interactive changelog — a non-blocking banner that announces a new feature, an action that starts a tour of it, and the three separate rules that keep it away from people who have already seen it.
keywords: interactive changelog, feature announcement tour, product launch onboarding, in-app changelog, what's new banner, guideflow banner tour
---

# Recipe: an interactive changelog

You shipped something. The people who would use it are already signed in and
have no idea it exists. A changelog entry nobody reads is the usual answer; this
is the other one — announce it where they are, and let anyone curious walk
through it in the real product.

Two pieces, both of which already exist:

1. a [banner](/guide/banners) that says the feature shipped, and
2. a [flow](/guide/flows-and-steps) that shows it, started from the banner's action.

Nothing here needs a hosted "what's new" service, and nothing here interrupts.

## The whole thing

```ts
import { createGuideFlow } from '@guideflow/core'
import { createBanners } from '@guideflow/banner'
import { mountBanner } from '@guideflow/banner/widget'

const gf = createGuideFlow({
  context: { userId: currentUser.id, plan: currentUser.plan },
})

// The tour of the new thing.
gf.createFlow({
  id: 'scheduled-exports-tour',
  version: '2026-08-01',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'menu',
          target: '#export-menu',
          content: { title: 'Exports can run on a schedule now' },
          clickThrough: true,
        },
        {
          id: 'cadence',
          target: '#export-cadence',
          content: { title: 'Pick a cadence', body: 'Daily, weekly, or the first of the month.' },
        },
      ],
      on: { NEXT: 'done' },
    },
    done: { final: true },
  },
})

// The announcement.
const banners = createBanners(
  gf,
  [
    {
      id: 'scheduled-exports',
      title: 'Scheduled exports are live',
      body: 'Set an export to run daily and stop remembering to click the button.',
      tone: 'info',
      actions: [
        { label: 'Show me', variant: 'primary', flowId: 'scheduled-exports-tour', dismisses: true },
        { label: 'Not now', dismisses: true },
      ],
      targeting: { urlPattern: '/app/**' },
    },
  ],
  { onEvent: (event) => collector.track(`guideflow.banner.${event.type}`, event) },
)

mountBanner(banners, { dock: 'top' })
```

`dismisses: true` on **both** actions is the part people leave off. Without it,
someone who took the tour is shown the same bar again on their next page load —
they answered the question and it asked anyway.

## "Only people who have not seen it"

There is no single flag for this, because "seen it" means four different things
and they are stored separately. Pick the ones you actually mean.

| You mean | Mechanism | Where it lives |
|---|---|---|
| They already closed the bar | Banner dismissal, permanent per user | `@guideflow/banner`'s own storage key |
| They already took the tour | `start()` refuses a flow this user completed | `ProgressStore`, as <code>flowId@version</code> |
| They are not the audience at all | `targeting.audience` | Evaluated, never stored |
| Cap it however it starts | `targeting.frequency` | The `caps` record |

The second one is free and automatic: [`start()` returns without rendering and
without emitting](/guide/persistence) for a flow the user completed, so a banner
action they already followed cannot replay the tour. You do not have to write
that check.

### The auto-start variant

If you would rather not wait for a click, the same flow can start itself on the
pages where the feature lives:

```ts
import { createTargeting } from '@guideflow/core/targeting'

gf.createFlow({
  id: 'scheduled-exports-tour',
  version: '2026-08-01',
  targeting: {
    startTrigger: 'load',
    urlPattern: '/app/exports/**',
    audience: { where: { existingUser: true } },
    frequency: { maxTotal: 1 },
    priority: 5,
  },
  // …
})

createTargeting(gf).install()
```

::: warning `audience.where` compares, it does not evaluate
`where` is `===` per key, or any-of when the value is an array. There is no
`before`, no `<`, no date arithmetic — so "signed up before we shipped this"
is something **your** code decides and puts in the context as a plain value:

```ts
createGuideFlow({
  context: { userId: user.id, existingUser: user.createdAt < RELEASE_DATE },
})
```

A predicate can express the comparison directly — `audience: (ctx) => …` — but a
predicate does not survive `JSON.stringify`, so a flow carrying one cannot be
written to a [`.flow.json`](/reference/flow-file). See
[targeting](/guide/targeting#audience).
:::

## Announcing the *next* feature

Both surfaces treat a dismissal as permanent, and both give you one deliberate
override. They are not the same override, and confusing them is the mistake
worth naming.

```ts
{ id: 'scheduled-exports', title: '…', version: 2 }   // banner: re-show to people who dismissed v1
```

```ts
gf.createFlow({ id: 'scheduled-exports-tour', version: '2026-09-01' /* … */ })
```

- **Banner `version`** re-shows the bar. It costs nothing else.
- **Flow `version`** un-completes the tour for everyone *and* discards every
  saved resume point, because a snapshot whose version no longer matches is
  thrown away rather than restored into a flow that may have changed shape. It
  emits `progress:discard`.

So: bump the banner's version to re-announce. Bump the flow's version only when
the tour itself genuinely changed — never for a typo fix, which would interrupt
everyone mid-tour to fix a comma.

Both surfaces share one rule at the bottom: a record written *before* you added a
`version` — a dismissal, or a completion — suppresses **every** version. There is
no way to know which revision it meant, so bumping the version does not reach the
people who were there first. Add the field before you need it.

## What the numbers look like

The two surfaces report through different channels, on purpose:

- The banner's `show` / `action` / `dismiss` go to **its own `onEvent`**, never
  the tour bus. A dismissed announcement is not an abandoned tour, and putting
  it in the tour funnel would move your abandonment rate every time you shipped
  something.
- The tour's `tour:start` / `step:enter` / `tour:complete` go through
  [`@guideflow/analytics`](/guide/analytics) as normal, so `computeFunnel` tells
  you which step of the feature tour people quit on.

The launch question — "how many of the people who saw the bar took the tour, and
how many finished it" — is `guideflow.banner.action` over
`guideflow.banner.show`, then `guideflow.tour.completed` over
`guideflow.tour.started`. Two ratios, two sources.

## Caveats worth knowing before you ship it

- **No `context.userId`, no memory.** The dismissal lasts the session and the
  bar comes back on reload. `anonymousId: true` mints a first-party identifier
  instead; it is off by default because this package cannot consult your consent
  policy.
- **The banner is inert while a tour is running** — hidden and `inert`, with its
  announcement held until the tour ends. A banner action also refuses to start a
  tour over a running one, because `gf.start()` ends the current tour first and
  that emits `tour:abandon`.
- **One bar at a time.** Register a second announcement and the higher
  `priority` wins; the other waits for a dismissal. There is deliberately no
  stacking.
- **A `clickThrough` step needs a selector string**, not a function target. With
  a function the mouse works and the keyboard does not, silently — see
  [use a selector string for the target](/guide/advance-on#use-a-selector-string-for-the-target).

## Related

- [Banners](/guide/banners) — the surface, in full
- [Targeting & frequency](/guide/targeting) — audience, schedule and caps
- [Guides in your help centre](/guide/help-centre) — the same tour, reachable from a link
- [Persistence](/guide/persistence) — what completion and dismissal actually store
