---
description: Put runnable guides in your help centre — a ?gf_tour= deep link from a Zendesk, Intercom, GitBook or Mintlify article starts the real tour in the customer's own application, with a url targeting rule for the pages the tour belongs on.
keywords: help centre product tour, deep link tour, Zendesk in-app guide, support article walkthrough, gf_tour link, interactive documentation
---

# Recipe: guides in your help centre

A help article describes six clicks. The customer reads it in one tab and does
the clicks in another, translating screenshots into their own screen as they go.

The alternative is a link. They are already signed in to your product, so there
is nothing to clone and nothing to host — the article points at the application
the reader already has, and the tour runs there.

```
https://app.example.com/billing?gf_tour=add-payment-method
```

Every help-centre platform accepts a URL, which is the whole integration.

## Setup

### 1. Mark the flow linkable

Nothing is reachable by link until you say so, per flow:

```ts
gf.createFlow({
  id: 'add-payment-method',
  targeting: {
    deepLink: true,
    startTrigger: 'load',
    urlPattern: '/billing/**',
  },
  initial: 'card',
  states: { /* … */ },
})
```

The two targeting fields are doing different jobs, and both are worth having:

| Field | Job |
|---|---|
| `deepLink: true` | This tour may be started **by a link**, by anyone who has one |
| `startTrigger` + `urlPattern` | Where we would have **pushed** it without a link |

A link overrides `urlPattern` — a support agent sending someone to `/billing` on
purpose beats a rule about where we would have volunteered the tour. It does not
override `audience` or `schedule`. See
[what a link does and does not override](/guide/targeting#what-a-link-does-and-does-not-override).

### 2. Install targeting

```ts
import { createTargeting } from '@guideflow/core/targeting'

createTargeting(gf).install()
```

`install()` reads the URL before it arms its `load` trigger, so an explicit link
beats a tour that would have auto-started on that page anyway.

Without the targeting engine, call it yourself:

```ts
import { startFromUrl } from '@guideflow/core/targeting'

await startFromUrl(gf)
```

### 3. Register the flows first

If your flows arrive over the network — see [hosting flows](/guide/hosting-flows) —
`await` that fetch before installing targeting. A link naming a flow that is not
registered yet resolves to nothing, silently, and the parameter is not retried.

```ts
import { parseFlowFile } from '@guideflow/core/authoring'

const files = await fetch('/tours/index.json').then((r) => r.json())
for (const file of files) {
  const { flow, errors } = parseFlowFile(file)
  if (flow) gf.createFlow(flow)
  else console.warn('[tours] rejected a flow file', errors)
}

createTargeting(gf).install()
```

## Writing the links

```
?gf_tour=add-payment-method                          the whole tour
?gf_tour=add-payment-method&gf_tour_step=enter-card  jump to one step
```

**Point the link at the page the tour starts on.** The parameters are read on
whatever page they land on, and a tour whose first step targets `#card-number`
on `/billing` cannot find it from `/dashboard`. If you have configured a
[navigation adapter](/guide/routing) the engine will *wait* for the element
rather than fail — but the honest link is the one that includes the path.

The step parameter is always `<param>_step`, so renaming the parameter renames
both:

```ts
await startFromUrl(gf, { param: 'walkthrough' })
// ?walkthrough=add-payment-method&walkthrough_step=enter-card
```

A `gf_tour_step` naming a step that has since been renamed opens the tour at the
beginning rather than doing nothing.

::: warning `param` and `strip` are `startFromUrl` options, not targeting options
There is nowhere to put them on the path [§2](#_2-install-targeting) recommends.
`install()` calls `startFromUrl(gf)` with **no arguments**, so it always reads
`gf_tour` and always strips. `createTargeting()` takes no options for either.

To change one, call `startFromUrl` yourself with the options you want and skip
`install()` — accepting that you then also give up what `install()` adds around
it: the `load`, `event` and `selector` triggers, the frequency-cap bookkeeping,
and the re-check on every route change. If your app is a SPA and you go this
way, re-run `startFromUrl` after each navigation yourself, because an SPA can
navigate *to* a deep link internally.
:::

## What happens to the URL

Both parameters are removed once the tour starts, via `replaceState` — no history
entry, `history.state` preserved, and every other query parameter (your UTM tags,
your app's own state) left alone. `startFromUrl(gf, { strip: false })` keeps
them; as with `param`, that is an option on `startFromUrl` and there is no way to
reach it through `install()`.

This is not tidiness. `urlPattern` matching is anchored, so a full-href pattern
can never match a URL still carrying `?gf_tour=…`, and every such rule on the
page would go quietly dead for the rest of the session.

## Replaying costs the user nothing

`start()` normally refuses a tour the user completed or dismissed — no render, no
event. That is exactly the population support sends links to, so a deep link
starts with `{ force: true }`, which skips those two gates and **writes nothing**.

It deliberately does not clear the completion record: [`@guideflow/checklist`](/guide/checklist)
projects completed flows, so clearing one would visibly un-tick the customer's
checklist to make a link work. Replaying a tour must not cost someone progress
they earned.

`force` is public, so a "show me this again" button in your own UI can use it:

```ts
await gf.start('add-payment-method', undefined, { force: true })
```

## In the article

Nothing platform-specific is required — it is a link.

```md
Scheduled exports run from the billing screen.

[Walk me through it →](https://app.example.com/billing?gf_tour=add-payment-method)
```

Two things worth deciding before you publish:

- **Only mark flows you are content for any signed-in user to start by link.** A
  tour is authoritative-looking copy positioned over your real controls, and a
  URL is attacker-controlled. `deepLink` is opt-in for that reason.
- **A deep-linked start still counts toward your global frequency caps**, because
  the user really did see a tour.

## Why it does nothing

In order:

1. The flow id in the link is not registered — check the fetch resolved before
   `install()`.
2. The flow has no `targeting.deepLink: true`.
3. `audience` or `schedule` excludes this user. A link does not override either;
   `{ where: { plan: 'enterprise' } }` means *not this user*.
4. A tour is already running. `startFromUrl` returns `null` rather than
   interrupting.

All four are a silent `null`. That is deliberate — the parameter is
attacker-supplied and logging it back would be a small reflected-content surface
for no benefit — so diagnose with the evaluator instead:

```ts
console.table(await createTargeting(gf).evaluate())
```

## Related

- [Targeting & frequency](/guide/targeting#deep-links-—-gf-tour) — the reference for `?gf_tour=`
- [Hosting flows](/guide/hosting-flows) — serving flows over the network
- [Routing & SPAs](/guide/routing) — waiting for a target after a route change
- [An interactive changelog](/guide/feature-launch) — the same tour, announced rather than linked
