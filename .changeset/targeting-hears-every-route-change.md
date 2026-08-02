---
'@guideflow/core': minor
'@guideflow/devtools': patch
---

Targeting now hears every route change; `clearCompleted` lands; the DevTools event list can no longer rot

**`startTrigger: 'load'` only ever fired on the back button.** `install()` wired
a bare `popstate` listener, so a `history.pushState` navigation — how React
Router, Vue Router in history mode and Next.js move between routes — re-evaluated
nothing at all. The documentation said "on every route change". It now uses the
same `watchHistory` the routing seam does: the Navigation API where the browser
has it (no patching), a cooperative wrapper where it does not, and coalescing so
a router calling `replaceState` three times notifies once. Costs 380 B on the
opt-in targeting subpath, whose gate moves 2.5 → 2.75 kB (ADR-016). **The core
entry is untouched.**

**A flow registered after `install()` was invisible to the `selector` trigger.**
The candidate list was filtered exactly once, and the observer was only created
if a selector flow already existed — so the recipe in `guide/hosting-flows.md`,
where flows arrive from a `fetch`, could not use selector triggers at all. Both
halves are fixed; there is no ordering rule left to remember.

Two further defects found by the same probe:

- **The `selector` trigger could start the wrong flow.** `evaluateFlow` marks a
  flow eligible on `startTrigger === 'selector'` alone — it has no document and
  never asks whether *that* flow's selector matches. So an element appearing for
  one flow started whichever selector flow had the higher priority. A tour whose
  own selector matched nothing would run.
- **The observer never stopped.** Closing a selector-started tour and then
  mutating the DOM restarted it, and would again on the next mutation, forever,
  unless a frequency cap happened to be configured. A `selector` trigger now
  fires once per flow per page load.

**New: `ProgressStore.clearCompleted(userId, flowId?)`** — "let this user see
that tour again". It clears every version of the flow, and leaves dismissals,
resume points, targeting caps and checklist state alone. Previously the only
option was `resetUser()`, which takes all of them.

**Decided, not drifted: dismissal stays keyed on the flow id** while completion
is `flowId@version` (ADR-015). Completing a tour says *I have seen this content*,
so a republish is worth showing; dismissing one says *do not interrupt me*, which
editing the tour does not answer. It is opt-in per flow, and `clearDismissed` is
public for an author who disagrees. Pinned by tests in both directions.

**DevTools**: both event-name lists are now `Object.keys({…} satisfies
Record<keyof TourEvents, true>)`, so an event added to or renamed in core fails
to compile instead of silently going unreported. They had already rotted —
`tour:dismiss` shipped in Phase 6 and reached neither, so the panel could not
show a dismissal.
