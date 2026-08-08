---
description: Advance a GuideFlow tour when the user actually interacts with the highlighted element, instead of only when they press Next. Covers clickThrough, branching with send(), and keyboard access.
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

### Use a selector string for the target

`Step.target` also accepts an `Element` and a `(context) => Element | Promise<Element>` function.
A **function** target and `clickThrough` do not currently work together, and the failure is silent.

The engine resolves a function target and hands the element to the spotlight, so the `clip-path`
hole is cut and the mouse works. The renderer is handed the raw `step` and re-resolves `target`
itself, as `string | Element` only — a function resolves to `null` there. So the widened focus
trap below never engages: <kbd>Tab</kbd> cannot reach the highlighted element, `aria-modal="true"`
stays on the popover claiming the page is inert, and a keyboard user cannot perform the interaction
`advanceOn` is waiting for.

A selector string and an `Element` are both fine. Prefer the string — it also survives
`JSON.stringify`, so the step can live in a [`.flow.json`](/reference/flow-file).

```ts
{ id: 'save', target: '#save', clickThrough: true }              // ✅ reachable
{ id: 'save', target: () => findSaveButton(), clickThrough: true } // ❌ mouse only
```

Fixing this properly means handing the renderer the element the engine already resolved, which
changes the `RendererContract.renderStep` signature — a deliberate decision rather than a patch.
`@guideflow/react`'s `GuidePopover` has the same shape and the same gap. Both are pinned by test so
the behaviour cannot drift unnoticed.

## Keyboard and screen-reader users

On a `clickThrough` step the focus trap widens to include the highlighted element, so
<kbd>Tab</kbd> reaches it and <kbd>Shift</kbd>+<kbd>Tab</kbd> comes back — the same hole the
`clip-path` cuts for the mouse, cut in the tab order. `aria-modal` is dropped on those steps too,
because the page provably is not inert.

Everything else stays trapped: the widening is exactly one element, not an escape hatch.

::: tip For a custom control, dispatch your own event
<kbd>Enter</kbd> on a native `<button>` or `<a href>` synthesises a `click`, so those work from the
keyboard for free. A `<div role="button" tabindex="0">` with an `onKeyDown` handler does **not** —
the app saves and the tour never notices.

The robust integration for those is the custom-event form below: it fires whatever the input
modality, and it advances on real application state rather than on a guess about which node the user
poked.
:::

```ts
// In your app, wherever the work actually completes:
await saveDocument()
document.dispatchEvent(new CustomEvent('app:saved'))

// In your tour:
advanceOn(gf, { save: { event: 'app:saved', selector: 'body' } })
```

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
