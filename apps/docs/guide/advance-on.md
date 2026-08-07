---
description: Advance a GuideFlow tour when the user actually interacts with the highlighted element, instead of only when they press Next. Covers clickThrough, branching with send(), and the keyboard limitation.
keywords: GuideFlow advanceOn, advance tour on click, interactive product tour, clickThrough, driver.js onNextClick, Shepherd advanceOn
---

# Advancing on interaction

By default a tour moves when the user presses **Next**. `advanceOn` moves it when the user does the
thing the step is asking for.

```ts
import { createGuideFlow } from '@guideflow/core'
import { advanceOn } from '@guideflow/core/navigation'

const gf = createGuideFlow()

const stop = advanceOn(gf, {
  save: 'click',
  plan: { event: 'change', action: 'CHOSE_PLAN' },
})
```

Keys are step ids, values are DOM event names or a rule object. It returns a teardown function.

It lives on the `@guideflow/core/navigation` subpath, so it costs the main bundle nothing.

## The step needs `clickThrough: true`

::: danger Without it, the click dismisses the tour
The overlay is `pointer-events: all` across the viewport. `clickThrough` carves a `clip-path` hole
in it so pointer events reach the target — without that hole the click lands on the **overlay**,
whose default handler skips the tour.

So a step that tells the user to click something, without `clickThrough`, punishes them for
following the instruction. `advanceOn` warns once per step id when it sees this.
:::

```ts
{ id: 'save', target: '#save', clickThrough: true, content: { title: 'Save your work' } }
```

## Keyboard and screen-reader users

::: warning A `click` rule is currently mouse-only
The renderer traps focus inside the popover and sets `aria-modal="true"` on every step, including
`clickThrough` ones, so <kbd>Tab</kbd> never reaches the highlighted element. A keyboard user cannot
perform the action the step is asking for.

Widening the focus trap for `clickThrough` steps is tracked as Phase 8.1b. Until it lands, **use the
custom-event form below for anything that has to be accessible** — it fires whatever the input
modality, so mouse, keyboard and assistive-technology users all advance the same way.
:::

```ts
// In your app, wherever the work actually completes:
await saveDocument()
document.dispatchEvent(new CustomEvent('app:saved'))

// In your tour:
advanceOn(gf, { save: { event: 'app:saved', selector: 'body' } })
```

This is the more robust integration in general: it advances on real application state rather than on
a guess about which DOM node the user poked.

## Rules

| Field | Type | Default | What it does |
|---|---|---|---|
| `event` | `string \| string[]` | `'click'` | DOM event name(s), listened for in the **capture** phase |
| `selector` | `string` | the step's own `target`, if that is a string | What counts as a hit, matched with `closest()` |
| `when` | `(event, element) => boolean` | — | Final say. Return `false` to ignore and stay armed |
| `delay` | `number` | `0` | Wait this long before advancing, ms |
| `action` | `'next' \| string` | `'next'` | Any other string is dispatched through `gf.send()` |

A bare string is shorthand for `{ event: name }`.

### `when` — the gate that makes `input` usable

Advancing on the first keystroke yanks the popover away mid-word:

```ts
advanceOn(gf, {
  name: {
    event: 'input',
    when: (e) => (e.target as HTMLInputElement).value.length >= 3,
  },
})
```

A `when` that throws means "not a match", never a crash — one bad rule must not take down the tour.

::: tip `keydown` needs a `when`
The engine's own keyboard handler advances on <kbd>→</kbd> and <kbd>↓</kbd> for a non-editable
target. A bare `keydown` rule therefore fires alongside it and skips two steps. Exclude the arrows
in `when`.
:::

### `action` — branching

`next()` only walks the default `NEXT` path, so a branching state needs `send()`:

```ts
states: {
  pick: {
    steps: [{ id: 'plan', target: '#plans', clickThrough: true, content: { title: 'Pick a plan' } }],
    on: { CHOSE_PRO: 'pro-setup', CHOSE_TEAM: 'team-setup' },
  },
}
```

```ts
advanceOn(gf, { plan: { event: 'click', selector: '[data-plan="pro"]', action: 'CHOSE_PRO' } })
advanceOn(gf, { plan: { event: 'click', selector: '[data-plan="team"]', action: 'CHOSE_TEAM' } })
```

There is deliberately no `'end'` or `'skip'` action. `end` maps to `stop()`, which emits
`tour:abandon` — only `next()` past the last step emits `tour:complete`. Wiring a final step to
`end` would file every successful finish as an abandonment in your analytics.

### `delay` — let the user see their action land

```ts
advanceOn(gf, { save: { event: 'click', delay: 400 } })
```

Without it the popover moves in the same frame as the click and the toast the user just caused is
never read. A pending delayed advance is cancelled if the step exits first.

## Next always still works

`advanceOn` is additive. The Next button stays, and a rule that can never fire degrades to "the user
presses Next" rather than to a stuck tour. That is deliberate: a tour that can only be completed by
guessing the right gesture is worse than one with a button.

## Lifecycle

At most one set of listeners exists at any moment, and it is always the current step's. The helper
releases on every step change, on pause, while the engine is waiting for a route or a target, and on
every way a tour can end.

Two of those are less obvious and both are load-bearing:

- **`pause()` emits no `step:exit`**, and it drops the spotlight — which releases pointer capture, so
  the whole page becomes clickable. A rule left armed there would advance a tour the user has paused.
- **`step:exit` is not emitted on every ending.** `send()` into a state with no steps completes the
  tour without it, so the helper also listens for `tour:complete` and `tour:abandon`.

```ts
const stop = advanceOn(gf, { save: 'click' })
stop()          // idempotent, and safe after gf.destroy()
```

You do not have to call it: `gf.destroy()` releases everything the helper holds.

## Compared to other libraries

| | GuideFlow | Shepherd | driver.js |
|---|---|---|---|
| Advance on interaction | `advanceOn` | `advanceOn` | `onNextClick` |
| Event delegation | capture phase, `stopPropagation`-proof | element listener | element listener |
| Branch on the interaction | ✅ via `send()` | ❌ | ❌ |
| Gate with a predicate | ✅ `when` | ❌ | manual |
