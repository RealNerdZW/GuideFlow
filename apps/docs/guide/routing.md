---
description: Run a GuideFlow tour across multiple SPA routes — declare a route per state, wait for targets that mount late, and integrate with React Router, Next, Vue Router or SvelteKit.
keywords: SPA product tour, multi-page onboarding, React Router tour, Next.js product tour, waitForTarget, route-aware tour
---

# Routing

A tour that spans two routes is the most common real onboarding requirement, and until now GuideFlow
could not do it. The engine resolved each step's target once with `querySelector` and rendered
whatever it found — so a step pointing at something on `/settings` while the user was on `/dashboard`
rendered as a centred modal with no spotlight, and said nothing about why.

## Setup

Route handling is an opt-in subpath, because it is ~1.5 kB that a single-page tour does not need:

```ts
import { createGuideFlow } from '@guideflow/core'
import { createNavigation } from '@guideflow/core/navigation'

const gf = createGuideFlow({
  navigation: createNavigation(),
})
```

Then declare which route each **state** lives on:

```ts
gf.start({
  id: 'onboarding',
  initial: 'dashboard',
  states: {
    dashboard: {
      route: '/dashboard',
      steps: [{ id: 'd1', target: '#chart', content: { title: 'Your numbers' } }],
      on: { NEXT: 'settings' },
    },
    settings: {
      route: '/settings/**',
      steps: [{ id: 's1', target: '#api-key', content: { title: 'Your API key' } }],
      final: true,
    },
  },
})
```

## Why `route` is on the state

Not on the step, and not as a transition. GuideFlow's step counters walk the flow's `NEXT` path to
work out "step 3 of 7"; a `ROUTE` transition would put the target state *off* that path, and the
counter would silently revert to per-state numbering — which used to put a **Done** button on step
one of a two-state tour.

Putting `route` on the state also means Back across a route boundary works with no extra
configuration: the state machine already tracks state history.

## What the user sees while waiting

When a state's route does not match, the engine:

1. **Drops the spotlight**, so the page stays fully clickable. This is deliberate and important — a
   user waiting to reach `/settings` has to be able to click the nav link. A modal that blocks the
   navigation it is waiting for can never succeed.
2. **Marks the popover busy** (`aria-busy="true"`, `data-gf-waiting`) without unmounting it. The
   popover keeps showing the *previous* step until the new one can be anchored properly.
3. **Emits `step:waiting`** after a short grace period, so a 60 ms route change does not flash a
   spinner.

`Escape` keeps working throughout — `isWaiting` is a separate flag from `isPaused` precisely so the
keyboard handler stays live.

```ts
gf.on('step:waiting', ({ stepId, reason }) => {
  // reason: 'route' | 'target'
})
```

::: warning A cross-route *first* step has no popover yet
`setWaiting()` needs a popover to mark busy, and the first step has not rendered one. If your tour
opens on a different route than the user is on, render your own affordance from `step:waiting`.
:::

## Router integration

Pass `subscribe` and **GuideFlow never touches `history`**. This is the recommended integration for
every framework router, all of which patch history themselves:

::: code-group

```ts [React Router]
import { createNavigation } from '@guideflow/core/navigation'

const navigation = createNavigation({
  subscribe: (onChange) =>
    router.subscribe(() => onChange(new URL(window.location.href))),
  navigate: (url) => router.navigate(url),
})
```

```ts [Next.js]
// In a client component, wired to the App Router.
const navigation = createNavigation({
  subscribe: (onChange) => {
    const handler = () => onChange(new URL(window.location.href))
    // usePathname()/useSearchParams() in an effect is the idiomatic source.
    return subscribeToRouteChange(handler)
  },
  navigate: (url) => router.push(url),
})
```

```ts [Vue Router]
const navigation = createNavigation({
  subscribe: (onChange) =>
    router.afterEach(() => onChange(new URL(window.location.href))),
  navigate: (url) => void router.push(url),
})
```

```ts [SvelteKit]
import { goto } from '$app/navigation'
import { page } from '$app/stores'

const navigation = createNavigation({
  subscribe: (onChange) => page.subscribe((p) => onChange(new URL(p.url))),
  navigate: (url) => void goto(url),
})
```

:::

Omit `subscribe` and the built-in watcher is used. It prefers the Navigation API — on Chromium it
subscribes to `navigatesuccess` and **patches nothing at all**. Where it has to fall back, it wraps
`pushState`/`replaceState` cooperatively (calling through to whatever is already installed) and on
teardown restores the original only if its own wrapper is still the outermost one. Ripping it out
unconditionally would delete a patch somebody installed on top of it.

### `navigate` is optional

Omit it and the tour waits for the user to navigate — which is the right default for a tour that is
*teaching* navigation ("click Settings in the sidebar"). Supply it and the tour drives the router
itself.

## Waiting for elements, not just routes

A route change is only one of five reasons a selector misses. Lazy chunks, Suspense boundaries,
portals and drawers are the others, and one option covers all of them:

```ts
{ id: 'save', target: '#save-button', waitForTarget: 3000 }
```

Or set a default for every step:

```ts
createNavigation({ waitForTarget: 3000 })
```

`waitForElement` is also exported standalone and needs **no adapter at all** — the equivalent of
shepherd.js's `beforeShowPromise`:

```ts
import { waitForElement } from '@guideflow/core/navigation'

{ id: 'save', target: () => waitForElement('#save', { timeoutMs: 5000 }) }
```

## When a wait expires

The engine emits `step:timeout` and **renders the step unanchored**. It does not skip, and it does
not end the tour — there is no timeout policy in the engine, because the right one differs per
product. Compose yours in a line:

```ts
gf.on('step:timeout', ({ stepId, reason }) => {
  analytics.track('tour_step_timeout', { stepId, reason })
  void gf.next()   // or gf.stop(), or nothing at all
})
```

There is also `step:target-missing`, which fires whenever a step declared a target and got nothing —
with or without a navigation adapter. It used to render a silent full-screen modal, indistinguishable
from a deliberate `target: null` step.

## Route pattern syntax

| Pattern | Matches | Does not match |
|---|---|---|
| `/settings` | `/settings` | `/settings/billing`, `/settings-old` |
| `/app/*` | `/app/billing` | `/app/billing/invoices` |
| `/app/**` | `/app/billing`, `/app/billing/invoices` | `/other` |
| `/#/settings/*` | `/#/settings/profile` | `/#/billing` |

Patterns are **anchored**, so `/user` does not match `/users/42`. Metacharacters are literal:
`/v1.0/docs` matches only `/v1.0/docs`.

A pattern containing `?` or `#` is matched against `pathname + search + hash`, which is what makes
hash routers work with no special case. Everything else is matched against `pathname`.

`RegExp` and predicate patterns are also accepted:

```ts
{ route: /^\/app\/\d+$/ }
{ route: (url) => url.searchParams.get('view') === 'settings' }
```

::: warning String patterns are the portable form
`RegExp` and function patterns are dropped by `JSON.stringify`, so a flow that round-trips through
`guideflow export` or the devtools panel silently loses them. The same applies to the function form
of `Step.target`.
:::

## Configuration

| Option | Default | What it does |
|---|---|---|
| `subscribe` | built-in watcher | Where route changes come from. Supply it and history is never patched |
| `navigate` | — | Drive the router when a state declares a route the app is not on |
| `waitForTarget` | `5000` | Default per-step wait for a target element, ms |
| `waitForRoute` | `15_000` | Max wait for a state's `route` to match, ms |
| `indicatorDelay` | `400` | Grace period before the busy affordance appears, ms |

Deadlines are **absolute**. A navigation re-checks whether the route matches; it never resets the
timer, because resetting on every navigation means a redirect bounce waits forever.

## Reading the state

```ts
gf.isWaiting   // waiting for a route or a target
gf.isActive    // still true throughout a wait
gf.isPaused    // still false throughout a wait — a wait is not a pause
```

React, Vue and Svelte all expose `isWaiting` on their store or composable.
