---
name: gf-flow-authoring
description: Author or review a GuideFlow FlowDefinition — state-machine shape, transitions, guards, final states, step targets, async content, and showIf conditions. Use when writing a tour, debugging a tour that will not advance or complete, reviewing a flow JSON from the CLI or devtools recorder, or when asked why a tour shows the wrong step or never fires tour:complete.
---

# /gf-flow-authoring — writing correct GuideFlow flows

GuideFlow flows are **finite state machines**, not step arrays. Most "my tour is broken" reports are
a flow-shape mistake, not an engine bug.

## The shape

```ts
interface FlowDefinition<TContext = GuidanceContext> {
  id: string                       // unique; used as the persistence key
  initial: string                  // must be a key of `states`
  states: Record<string, {
    steps?: Step[]                 // rendered in order while in this state
    on?: Record<string, string | { target: string; guard?: (ctx) => boolean; actions?: string[] }>
    onEntry?: (ctx: TContext) => void
    onExit?: (ctx: TContext) => void
    final?: boolean                // reaching this state completes the tour
  }>
  context?: TContext
}
```

```ts
interface Step<TContext> {
  id: string
  target?: string | HTMLElement | null      // CSS selector, element, or null for a centred modal
  content: StepContent | (() => MaybePromise<StepContent>)   // { title?, body?, html? }
  placement?: PopoverPlacement              // 13 values incl. 'center'
  showIf?: (ctx: TContext) => boolean       // false ⇒ step is skipped
  padding?: number
  clickThrough?: boolean
  scrollIntoView?: boolean                  // default true
  media?: { type: 'image' | 'video'; src: string; alt?: string }
  actions?: StepAction[]                    // overrides the default Back/Next buttons
  meta?: Record<string, unknown>
}
```

## Non-negotiable rules

1. **`initial` must name a real state.** No validation exists; a typo yields an inert tour.
2. **At least one reachable state must have `final: true`.** Without it `tour:complete` never fires,
   `markCompleted` never runs, and the flow replays on every visit.
3. **A flat `{ id, steps: [...] }` object is not a flow.** It must be
   `{ id, initial, states: { main: { steps, final: true } } }`. The broken fixture at
   `apps/e2e/fixtures/index.html:29` is exactly this mistake — do not copy it.
4. **`content` is an object, not loose fields.** `{ content: { title, body } }`, never
   `{ title, body }` at the step level.
5. **`next()` advances within a state first,** then follows the transition table. `send('EVENT')`
   jumps states directly. Mixing both in one flow is fine but be explicit about which drives it.
6. **`target` selectors are resolved at render time** with `document.querySelector`. If the element
   is not mounted yet the step renders as a centred modal instead — anchor to something stable, or
   gate the step with `showIf`.
7. **`showIf` returning false for every remaining step ends the tour.** The engine's skip loop has
   cycle detection, but a flow where everything is conditioned off simply completes.
8. **Do not put anything unserialisable in a flow you intend to export.** `showIf`, function
   `content`, and `HTMLElement` targets cannot survive `guideflow export` to JSON. Use string
   selectors and `meta` flags plus a runtime `showIf` supplied in code.

## Review checklist

- [ ] `initial` names an existing state
- [ ] a `final: true` state is reachable from `initial`
- [ ] every `on` transition target exists in `states`
- [ ] no unreachable states (dead branches)
- [ ] every step `id` is unique across the whole flow (persistence and analytics key on it)
- [ ] every `target` selector is specific and stable — not a generated Tailwind/CSS-module class
- [ ] `content` uses the `{ title, body }` object form
- [ ] async `content` functions handle their own errors (a throw is caught by the engine, which then
      emits `tour:error` and **ends the tour**)
- [ ] guards and `showIf` are pure and cheap — they run on every render pass
- [ ] `onEntry`/`onExit` do not start or stop tours (re-entrancy)
- [ ] if the flow should not replay, `context.userId` is set so persistence can record completion

## Worked example

```ts
const gf = createGuideFlow({ context: { userId: 'u1', roles: ['admin'] } })

const onboarding = gf.createFlow({
  id: 'onboarding-v1',
  initial: 'setup',
  context: { completedSteps: 0 },
  states: {
    setup: {
      steps: [
        { id: 'profile', target: '#profile-form', content: { title: 'Set up your profile' } },
        { id: 'avatar',  target: '#avatar-upload', content: { title: 'Add a photo' } },
      ],
      on: { NEXT: 'features', SKIP_SETUP: 'done' },
      onExit: (ctx) => { ctx.completedSteps++ },
    },
    features: {
      steps: [
        {
          id: 'admin-panel',
          target: '#admin',
          content: { title: 'Admin tools' },
          showIf: (ctx) => ctx.roles?.includes('admin') ?? false,
        },
      ],
      on: { NEXT: 'done' },
    },
    done: { final: true },
  },
})

await gf.start(onboarding)
```

## Debugging a stuck tour

| Symptom | Look at |
|---|---|
| Nothing renders | `initial` typo; `start()` was given an unregistered flow id (logs a warning); a `dismissed` record exists for this `userId`+`flowId` |
| Popover appears centred, not anchored | `target` selector matched nothing at render time |
| `tour:complete` never fires | no reachable `final: true` state |
| Tour restarts from step 0 after a reload | the resume path restores FSM state *after* the first render — known bug, AUDIT `resume-renders-step-zero` |
| Tour replays every visit | `context.userId` is unset, so no progress is persisted |
| Step skipped unexpectedly | a `showIf` returned false; subscribe to `step:skip` to see which |

Enable `createGuideFlow({ debug: true })` to get `[GuideFlow]` traces (they go through
`console.warn` by design — `no-console` forbids `console.log`).
