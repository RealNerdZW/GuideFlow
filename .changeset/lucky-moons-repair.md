---
'@guideflow/react': minor
---

Fix the React adapter: one popover instead of two, real cleanup, and a peer-range change.

**BREAKING — React 17 is no longer a supported peer.** The range is now
`^18.0.0 || ^19.0.0`. `<GuidePopover>` already called `useId()`, which does not
exist in React 17, so `react@17` threw `useId is not a function` on the first
render — the declared support was never real, and nothing in CI ever installed
React 17 to catch it. The hooks now also use `useSyncExternalStore`, another
React 18 API.

**`<GuidePopover>` no longer stacks a second dialog on top of core's.** Core's
`DefaultRenderer` draws its own `role="dialog" aria-modal="true"` popover, so
following `<GuidePopover>`'s own documented example painted two of them at the
same position, with focus landing in one and the click handlers in the other.
`@guideflow/react` now ships a **headless renderer** — a `RendererContract`
implementation that publishes each step into a subscribable store instead of
touching the DOM — and `<TourProvider>` gained a `renderer` prop to choose who
draws:

- `renderer="core"` (**the default — existing apps are unaffected**): core draws
  the popover and `<GuidePopover>` renders nothing, warning once in development.
- `renderer="react"`: the provider passes the headless renderer to
  `createGuideFlow()`, so only `<GuidePopover>` draws. **It must be mounted in
  this mode**, or the tour shows a spotlight and no popover.

A renderer can only be set when the instance is created, so combining
`renderer="react"` with your own `instance` warns and falls back to core rather
than silently doing the wrong thing. Build the instance with the new
`createHeadlessRenderer()` and pass that object as `renderer` instead.

**`<TourProvider>` now destroys the instance it created** when it unmounts,
releasing core's document-level `keydown` listener and its popover DOM. An
instance passed via the `instance` prop is left alone — the caller owns it.
React 18 StrictMode's mount/unmount/remount is handled: the replacement instance
is live.

**`<GuidePopover>` rewritten.** It now renders `step.actions` (so custom FSM
event buttons work), renders `step.media`, reads the instance's `gf.i18n`
registry rather than the `defaultI18n` singleton, measures and positions in a
layout effect before the first paint instead of flashing at the top-left corner,
follows the target on capture-phase `scroll` as well as `resize`, moves focus
into the dialog and restores it on close, and disappears while the tour is
paused. Its final button dispatches `next`, which completes the tour, rather
than `end`, which reports it abandoned. `content.html` is rendered as plain
text: core's sanitiser is not part of its public API, and this component will
not ship an unsanitised `dangerouslySetInnerHTML` path.

**Hooks moved to `useSyncExternalStore`.** `useTour`, `useTourStep` and
`<TourStep>` now share one subscription per instance, cannot tear under
concurrent rendering, and provide a server snapshot. `useTour` gained
`isPaused`, `pause()`, `resume()` and `skip()`, and `<TourStep>` /
`useTourStep` now report a paused tour as inactive.

**`useHotspot` returns a usable id.** It was written into a ref during an
effect, so the caller only ever saw `null`.

**`<ConversationalPanel>` no longer swallows failures.** In-flight answers are
discarded when the panel unmounts, errors are logged with `console.error` and
surfaced in the transcript, and the `highlights` the model returns are rendered
as buttons that scroll the element into view instead of being stored and
ignored. It also stops claiming `aria-modal="true"` for a panel that traps
nothing.

**`'use client'` is emitted** at the top of both bundles, so the package can be
imported from a Next.js App Router Server Component boundary.
