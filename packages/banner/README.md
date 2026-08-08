# @guideflow/banner

A docked, non-blocking announcement surface for [GuideFlow.js](https://github.com/RealNerdZW/GuideFlow).

"We shipped v2." "Maintenance on Friday." A bar at the top of the page that does
not dim it, does not trap focus, and does not end whatever tour is running.

```bash
npm install @guideflow/banner
```

## Usage

```ts
import { createGuideFlow } from '@guideflow/core'
import { createBanners } from '@guideflow/banner'
import { mountBanner } from '@guideflow/banner/widget'

const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })

const banners = createBanners(gf, [
  {
    id: 'v2',
    title: 'We shipped v2',
    body: 'Faster exports and a new dashboard.',
    actions: [{ label: 'Take a look', variant: 'primary', flowId: 'v2-tour' }],
    targeting: {
      urlPattern: '/app/**',
      audience: { where: { plan: 'pro' } },
      schedule: { endsAt: '2026-09-01T00:00:00Z' },
    },
  },
])

mountBanner(banners, { dock: 'top' })
```

## What it is

**One banner shows at a time**, chosen by derivation rather than pushed: the
highest-priority eligible undismissed one. Register as many as you like; the
rest queue behind it and appear as each is dismissed. The visible banner is a
function of state, never a queue you mutate.

**Targeting is core's**, not a second implementation — `urlPattern`, `audience`
and `schedule` are evaluated by the same `matchUrl` / `matchAudience` /
`matchSchedule` that decide which tour starts.

**Dismissal is permanent by default.** Set `version` and change it to bring a
banner back to people who dismissed the previous revision — you assert the
content is genuinely new, because only you can know that.

**Headless if you want it.** The controller is `subscribe` / `getSnapshot` /
`getServerSnapshot`, so React, Vue and Svelte consume it directly. `mountBanner`
is one possible view, in a separate subpath, so rendering your own bar costs you
no stylesheet.

## Accessibility

A landmark, not a dialog: `role="region"` with an accessible name, no
`aria-modal`, and **no focus trap** — a persistent docked surface that swallows
Tab is a keyboard trap under WCAG 2.1.2.

Announcements go through the widget's own visually-hidden polite live region,
which is a separate element from the bar. `role="status"` on the bar itself
would re-announce the whole thing on every change, including the queue advancing
after a dismissal. `role="alert"` is not offered at any tone: it is assertive
and would cut a running tour's step announcement in half.

While a tour is running the bar is `visibility: hidden` and `inert`, and any
pending announcement is held until the tour ends.

## Not in v1

- **Auto-dismiss timers**, and with them corner toasts. A self-closing
  announcement needs WCAG 2.2.1 pause/stop/extend, and a reader working at their
  own pace loses the text mid-sentence. Corners go with it: a corner card that
  never goes away is worse than a bar, and `mountChecklist`'s default dock is
  the same corner.
- **Stacking.** One slot, priority-selected.
- **Overlay for the bottom dock.** `dock: 'top'` is `position: sticky`, so it
  reserves its own height instead of covering the page. `dock: 'bottom'` is
  fixed.
- **Schedule boundaries mid-session.** A `startsAt` that passes while the page
  is open is picked up on the next derive — a route change, a dismissal, a tour
  ending, or `refresh()`.

## Documentation

Full guide: <https://realnerdzw.github.io/GuideFlow/guide/banners>

Licence MIT.
