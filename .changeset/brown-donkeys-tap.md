---
"@guideflow/core": minor
"@guideflow/react": minor
"@guideflow/vue": minor
"@guideflow/svelte": minor
---

SPA route-change handling — a tour can finally span two routes

This was the last open P0 and the roadmap's highest single-item impact. A grep for `popstate`,
`pushState`, `hashchange`, the Navigation API or any router integration across the monorepo returned
zero hits: the engine resolved each step's target once with `querySelector`, waited 150 ms, and
rendered. A step whose target lived on `/settings` while the tour started on `/dashboard` resolved to
null and rendered as a centred modal with no spotlight — and said nothing about why.

```ts
import { createGuideFlow } from '@guideflow/core'
import { createNavigation } from '@guideflow/core/navigation'

const gf = createGuideFlow({ navigation: createNavigation() })

gf.start({
  id: 'onboarding',
  initial: 'dashboard',
  states: {
    dashboard: { route: '/dashboard', steps: [...], on: { NEXT: 'settings' } },
    settings:  { route: '/settings/**', steps: [...], final: true },
  },
})
```

**`route` goes on the state, not the step, and not on a transition.** The step counters walk the
flow's `NEXT` path; a `ROUTE` transition would put the target state off that path and revert the
counters to per-state numbering — which used to put a **Done** button on step one of a two-state
tour. On the state, `prevStep()` already crosses state boundaries via history, so Back across a route
works with no extra code.

**The page stays clickable while waiting.** The spotlight drops for the duration, which also drops
pointer capture. A user waiting to reach `/settings` has to be able to click the nav link — a modal
that blocks the navigation it is waiting for can never succeed. The popover is marked `aria-busy`
*without* unmounting, so focus and the live region survive, and it keeps showing the previous step
until the new one can be anchored properly.

**`isWaiting` is separate from `isPaused`.** Reusing pause would make `pause()` a silent no-op
mid-wait, let `resume()` start a second waiter, and kill Escape exactly when the user most wants out.
`isActive` stays true and `isPaused` stays false throughout. React, Vue and Svelte all expose it.

**The engine has no timeout policy.** On expiry it emits `step:timeout` and renders unanchored — it
does not skip and does not end. Compose yours: `gf.on('step:timeout', () => void gf.next())`.

**Router integration without patching anything.** Pass `subscribe` and GuideFlow never touches
`history` — the recommended path for React Router, Next, Vue Router and SvelteKit, all of which patch
it themselves. The built-in fallback prefers the Navigation API (so it patches nothing on Chromium),
wraps cooperatively where it must, and on teardown restores the original *only* if its own wrapper is
still outermost — ripping it out unconditionally would delete a patch installed on top of it.

Also in this release:

- **`waitForTarget`** per step, or a default via `createNavigation({ waitForTarget })`. A route
  change is only one of five reasons a selector misses; lazy chunks, Suspense, portals and drawers
  are the others, and one code path covers them all. `waitForElement` is exported standalone and
  needs no adapter — the shepherd.js `beforeShowPromise` equivalent.
- **`Step.target` accepts a function**, resolved lazily at render time and may be async. Its declared
  type also widens from `HTMLElement` to `Element` — the runtime guard has always been
  `instanceof Element`, so SVG targets already worked and the type was simply wrong.
- **`step:target-missing`** fires whenever a step declared a target and got nothing, with or without
  an adapter. That case used to be indistinguishable from a deliberate `target: null` step.
- **`rerender()`** and **`isWaiting`** are now declared on `GuideFlowInstance`. `rerender()` was
  always reachable; the interface just never said so.
- **Progress is saved when the machine moves, not when the render lands.** With a route wait the
  render can take seconds, and a tab closed mid-wait used to lose the advance entirely.
- **`configure({ navigation })`** replaces the adapter and destroys the old one — by identity, so
  passing the same adapter twice does not tear down the one still in use.

The `@guideflow/core` budget moves from 14.5 kB to 15 kB (measured: 14.72 kB). The seam is 590 B of
engine and cannot be opt-in — a `TourEngine` that cannot wait cannot be taught to from outside. What
*is* optional is the 1.55 kB of route matching, element polling and history watching, and that lives
in `@guideflow/core/navigation`. See ADR-010.
