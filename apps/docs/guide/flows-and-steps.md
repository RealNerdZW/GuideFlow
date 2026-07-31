---
description: Learn how GuideFlow flows and steps work. A flow is a finite state machine; steps are the individual tooltips and spotlights users see during a tour.
keywords: GuideFlow flow definition, tour steps, product tour state machine, GuideFlow FSM
---

# Flows & Steps

A **flow** is a state machine that defines your tour. Each state contains an
array of **steps** — the individual tooltips and spotlights your users see.

## Flow Definition

`FlowDefinition` has exactly four fields you write by hand:

```ts
interface FlowDefinition<TContext = GuidanceContext> {
  id: string
  initial: string                            // must name a key of `states`
  states: Record<string, StateNode<TContext>>
  context?: TContext
  persistDismissal?: boolean                 // see Persistence
}
```

There is no flat `{ id, steps }` form. `initial` is validated in the
`FlowMachine` constructor, so a flow without `states` throws.

```ts
import { createGuideFlow, type GuidanceContext } from '@guideflow/core'

interface OnboardingContext extends GuidanceContext {
  completedSteps: number
}

const gf = createGuideFlow<OnboardingContext>()

const flow = gf.createFlow({
  id: 'onboarding',
  initial: 'setup',
  context: { completedSteps: 0 },
  states: {
    setup: {
      steps: [
        { id: 'profile', content: { title: 'Set up your profile' }, target: '#profile-form' },
        { id: 'avatar', content: { title: 'Add a photo' }, target: '#avatar-upload' },
      ],
      on: { NEXT: 'features' },
      onExit: (ctx) => { ctx.completedSteps++ },
    },
    features: {
      steps: [
        { id: 'dashboard', content: { title: 'Your dashboard' }, target: '#dashboard' },
      ],
      final: true,
    },
  },
})

await gf.start(flow)
// or, since createFlow registered it by id:
await gf.start('onboarding')
```

`createFlow()` does not start anything — it stores the definition on the
instance (retrievable with `gf.listFlows()`) and returns it unchanged.

## Step Configuration

Each step describes a single tooltip. Only `id` and `content` are required.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Step identifier. `gf.goTo(id)` finds it anywhere in the flow |
| `content` | `StepContent \| () => MaybePromise<StepContent>` | Title / body / HTML, or a (possibly async) function returning them |
| `target` | `string \| HTMLElement \| null` | CSS selector or element to anchor to. Omit or `null` for a floating step |
| `placement` | `PopoverPlacement` | Preferred popover position relative to the target |
| `showIf` | `(context) => boolean` | Skip this step when it returns `false` |
| `padding` | `number` | Spotlight padding for this step only (px) |
| `clickThrough` | `boolean` | Let clicks reach the page while this step is shown |
| `scrollIntoView` | `boolean` | Scroll the target into view first (default `true`) |
| `waitForTarget` | `number` | Wait this many ms for `target` to appear before rendering unanchored. Needs [`@guideflow/core/navigation`](/guide/routing) |
| `media` | `StepMediaOptions` | `{ type: 'image' \| 'video', src, alt? }` |
| `actions` | `StepAction[]` | Replace the default navigation buttons |
| `meta` | `Record<string, unknown>` | Free-form metadata for analytics / AI |

::: warning `media` is data, not UI
`StepMediaOptions` is part of the `Step` type and is passed through to the
renderer, but the built-in renderer does not display it. Only a custom
`RendererContract` can act on it today.
:::

## StepContent

```ts
interface StepContent {
  title?: string
  body?: string
  html?: string  // sanitised before insertion — see below
}
```

`title` and `body` are inserted as escaped text. `html` is only used when
`body` is absent; if both are set, `body` wins.

### `html` needs an opt-in import

The sanitiser is not in the default bundle. Pass it explicitly:

```ts
import { createGuideFlow } from '@guideflow/core'
import { sanitizeHTML } from '@guideflow/core/html'

const gf = createGuideFlow({ sanitizeHTML })
```

Without it, `content.html` is **escaped and rendered as text** — you see the
tags — and the renderer warns once telling you this. That is the safe
degradation: passing markup through unsanitised would be an XSS hole, and
dropping it would leave a blank popover with no clue why.

It works this way because the sanitiser is ~420 B gzip that every consumer was
paying for, including the majority who only ever set `content.body`. `body` is
plain text, escaped by the renderer, and never touches the sanitiser at all.

### What `html` may contain

With `sanitizeHTML` configured, `content.html` is parsed and filtered against an
**allowlist** before it reaches the DOM. Anything not on the list is dropped
silently, so do not rely on it:

- **Elements kept:** `a b blockquote br code div em h1`–`h6` `hr i img li ol p
  pre s small span strong sub sup table tbody td th thead tr u ul`
- **Removed entirely:** `script`, `style`, `iframe`, `object`, `embed`, `form`,
  `input`, `base`, `link`, `meta`, `svg`, `math`, `template`, and any custom
  element
- **Attributes kept:** `class dir lang title` on anything, plus `href target
  rel` on `<a>`, `src alt width height loading` on `<img>`, `colspan rowspan` on
  `<td>`/`<th>` (`scope` too), `start type` on `<ol>`. Everything else — every
  `on*` handler, `style=`, `id`, `data-*` — is stripped
- **URLs:** `href`/`src` must be relative or use `http:`, `https:`, `mailto:` or
  `tel:`. `javascript:`, `data:`, `blob:` and friends are rejected

### Dynamic content

`content` may be a function, sync or async. It is resolved on every render:

```ts
{
  id: 'user-greeting',
  content: async () => ({
    title: `Welcome back, ${await fetchUserName()}!`,
    body: 'Let\'s pick up where you left off.',
  }),
  target: '#header',
}
```

## Placements

`PopoverPlacement` values:

`top` `top-start` `top-end` `bottom` `bottom-start` `bottom-end` `left`
`left-start` `left-end` `right` `right-start` `right-end` `center`

If the preferred placement does not fit the viewport, GuideFlow falls back
through an ordered list ending at `center`.

## Conditional Steps

`showIf` receives the flow context and is evaluated at render time. A step whose
`showIf` returns `false` emits `step:skip` and the engine moves on — forwards
when you pressed Next, backwards when you pressed Back:

```ts
{
  id: 'admin-panel',
  content: { title: 'Admin Settings' },
  target: '#admin',
  showIf: (ctx) => ctx.roles?.includes('admin') ?? false,
}
```

## Custom Actions

`actions` replaces the Back/Next pair (the Skip and close buttons remain). Each
entry is `{ label, variant?, action }`:

| `action` | Effect |
|----------|--------|
| `'next'` | `gf.next()` — advances, crossing into the next state when the current one runs out of steps |
| `'prev'` | `gf.prev()` |
| `'skip'` | Dismisses the tour (`tour:dismiss` → `tour:abandon`) |
| `'end'` | `gf.stop()` — stops the tour without dismissing it |

```ts
{
  id: 'confirm',
  content: { title: 'Ready to continue?' },
  target: '#confirm',
  actions: [
    { label: 'Continue', action: 'next' },
    { label: 'Not now', variant: 'ghost', action: 'end' },
  ],
}
```

`variant` is `'primary'`, `'secondary'` or `'ghost'` and only affects styling.

::: warning Custom event names are not typed
At runtime an `action` string the engine does not recognise is forwarded to the
state machine as `gf.send(action)`. The published `StepAction['action']` type
does **not** admit those strings, so `{ action: 'DEVELOPER' }` fails to compile.
Until that type is widened, drive branching transitions from your own UI with
`gf.send('DEVELOPER')` — see [State Machine](/guide/state-machine#branching-flows).
:::
