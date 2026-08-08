---
description: A docked, non-blocking announcement bar — targeted, dismissible, accessible, and never part of the tour funnel.
keywords: product announcement banner, notification bar, onboarding banner, in-app announcement, guideflow banner
---

# Banners

An announcement that does not stop the user. A bar at the top of the page that
does not dim it, does not trap focus, and does not end whatever tour is running.

```bash
npm install @guideflow/banner
```

```ts
import { createGuideFlow } from '@guideflow/core'
import { createBanners } from '@guideflow/banner'
import { mountBanner } from '@guideflow/banner/widget'

const gf = createGuideFlow({ context: { userId: currentUser.id, plan: 'pro' } })

const banners = createBanners(gf, [
  {
    id: 'v2',
    title: 'We shipped v2',
    body: 'Faster exports and a new dashboard.',
    actions: [{ label: 'Take a look', variant: 'primary', flowId: 'v2-tour' }],
  },
])

mountBanner(banners, { dock: 'top' })
```

## Banner or announcement modal?

Both exist, and they are different tools.

| | Banner | [`target: null` modal](/guide/announcements) |
|---|---|---|
| Blocks the page | **No** | Yes — the overlay dims everything |
| While a tour is running | Waits, inert | Cannot: `gf.start()` abandons the tour |
| Dismissal shows up as | `onEvent` on this package | `tour:dismiss` + `tour:abandon`, in the tour funnel |
| Focus | Left alone | Moved in and trapped |
| Chrome you can remove | × is optional, no Skip | Needs a custom renderer |
| Demands attention | No | Yes |

Use the modal when the user genuinely must read it before continuing. Use a
banner for everything else, which is most things.

## One at a time

Register as many as you like. The **highest-priority eligible undismissed** one
shows; the rest wait. Dismissing the visible one reveals the next.

```ts
const banners = createBanners(gf, [
  { id: 'maintenance', title: 'Maintenance on Friday', targeting: { priority: 10 } },
  { id: 'v2', title: 'We shipped v2' },
])

banners.getSnapshot().current?.id // 'maintenance'
banners.getSnapshot().queued      // 1
```

Ties keep registration order — the same rule [targeting](/guide/targeting) uses,
so `priority` means one thing across the library.

There is deliberately no way to show two at once. Two bars competing for the top
of the viewport is where a third of a phone screen goes.

## Who sees it, where, and when

`urlPattern`, `audience` and `schedule` are evaluated by the *same* matchers
that decide which tour starts — not a second implementation.

```ts
{
  id: 'billing-nudge',
  title: 'Your trial ends in 3 days',
  targeting: {
    urlPattern: '/billing/**',
    audience: { where: { plan: 'trial' } },
    schedule: { startsAt: '2026-08-01', endsAt: '2026-08-15' },
    priority: 5,
  },
}
```

A url-scoped banner appears and disappears as the user navigates, including on
`pushState` — no reload needed.

::: tip Why isn't my banner showing?
```ts
console.table(banners.evaluate())
// [{ banner: {…}, eligible: false, priority: 0, blockedBy: ['audience'] }]
```
`blockedBy` uses the same vocabulary as targeting's, so this reads the same way
as "why didn't my tour start".
:::

## Dismissal

Closing a banner is permanent for that user, and **nothing is written unless a
banner is actually dismissed**.

```ts
{ id: 'v2', title: 'We shipped v2' }               // dismissed once, gone forever
{ id: 'v2', title: 'We shipped v2', version: 2 }   // bump it, and it comes back
```

That default is [ADR-015](https://github.com/RealNerdZW/GuideFlow/blob/master/.claude/docs/DECISIONS.md)'s
rule, the same one tours follow: *don't show me this again* is about
interruption, and editing the copy does not answer it. Setting `version` is you
asserting the content is genuinely new — the library cannot tell a rewrite from
a typo fix.

A dismissal stored before you added a `version` still suppresses every version.
There is no way to know which revision it meant.

Dismissals live under their own storage key. `progress.resetUser(userId)` sweeps
them along with everything else; `banners.reset()` clears only these.

::: warning No `userId`, no persistence
Without `context.userId` a dismissal lasts the session and the banner returns on
reload. `anonymousId: true` mints a first-party identifier instead — off by
default, because this package cannot consult your consent policy.
:::

## Actions

```ts
actions: [
  { label: 'Take a look', variant: 'primary', flowId: 'v2-tour' },
  { label: 'Not now', dismisses: true },
]
```

`flowId` starts a tour — but never over a running one, because `gf.start()` ends
the current tour first and that emits `tour:abandon`, which analytics reads as
the user giving up. `onSelect` runs your own code and wins when both are set.
`dismisses: true` records the dismissal first, so it survives the handler
navigating away.

## Analytics

A plain callback, deliberately not the tour event bus — a banner dismissal must
not land in the tour funnel:

```ts
createBanners(gf, definitions, {
  onEvent: (event) => collector.track(`guideflow.banner.${event.type}`, event),
})
```

`show`, `action` and `dismiss`.

## Accessibility

- `role="region"` with an accessible name — a **landmark**, so it can be reached
  with a screen reader's rotor after it appears, and escaped once found.
- **No focus trap, no `aria-modal`.** A persistent docked surface that swallows
  Tab is a keyboard trap under WCAG 2.1.2.
- Announced once through the widget's own visually-hidden polite region — a
  separate element from the bar, because `role="status"` on the bar itself
  re-announces the whole thing every time the queue advances.
- `role="alert"` is not offered at any `tone`. It is assertive and would cut a
  running tour's step announcement in half. Tone is a colour, never a politeness
  level, which is also why there is no `'error'` tone.
- While a tour runs the bar is `visibility: hidden` and `inert`, and a pending
  announcement is held until the tour ends.
- `dock: 'top'` inserts the bar **first** in the DOM so reading order matches
  visual order (WCAG 1.3.2). If your page has a skip link, pass `container` and
  mount the bar inside your own layout instead.

::: warning Verified by axe and by assertion, not by ear
No manual NVDA or VoiceOver pass has been run against GuideFlow, and a banner
adds a third polite live region to a page that already has the tour renderer's
and the [checklist](/guide/checklist)'s. The structure above is correct; how the
three sound together has not been heard by anyone.
:::

## Theming

Reads the same [tokens](/themes/#custom-themes) as everything else, so
`data-gf-theme` on the document element themes it for free. Its own z-index
token sits **below** the checklist and the hint/hotspot band, so a banner never
covers a control the user needs:

```css
:root { --gf-z-banner: 99995; }
```

## What it will not do

- **No auto-dismiss timers**, and therefore no corner toasts. A self-closing
  announcement needs WCAG 2.2.1 pause/stop/extend, and a reader working at their
  own pace loses the text mid-sentence.
- **No stacking.** One slot.
- **A `bottom` dock overlays.** `dock: 'top'` is `position: sticky`, so it
  reserves its own height and pushes the page down rather than covering it, then
  sticks as you scroll. `dock: 'bottom'` is fixed, the cookie-notice shape.
  Mounting into a `container` with `overflow` or a `transform` changes what
  sticky sticks to.
- **No mid-session schedule boundary.** A `startsAt` that passes while the page
  is open is picked up on the next derive — a route change, a dismissal, a tour
  ending, or `refresh()`.

## Related

- [Announcements](/guide/announcements) — the modal variant, for when it must be read
- [Checklist](/guide/checklist) — the other docked surface
- [Targeting](/guide/targeting) — the rules this shares
