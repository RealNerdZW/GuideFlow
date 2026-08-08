# @guideflow/checklist

## 0.2.0

### Minor Changes

- 93214ff: New package: `@guideflow/checklist` — an onboarding checklist that is a projection, not a copy

  ```bash
  pnpm add @guideflow/core @guideflow/checklist
  ```

  ```ts
  import { createChecklist } from '@guideflow/checklist'
  import { mountChecklist } from '@guideflow/checklist/widget'

  const checklist = createChecklist(gf, {
    id: 'getting-started',
    title: 'Getting started',
    version: 1,
    items: [
      { id: 'tour', title: 'Take the tour', flowId: 'welcome-tour' },
      { id: 'data', title: 'Connect your data' },
      { id: 'billing', title: 'Add a payment method', requires: ['data'] },
    ],
  })

  mountChecklist(checklist)
  ```

  An item that names a `flowId` ticks itself when that tour completes, because it **reads**
  `ProgressStore`'s completed-flows array rather than keeping a copy of it. There is no second source
  of truth to drift.

  ## `complete()` never records a flow completion

  The trap this design exists to avoid: `gf.start()` gates on `isCompleted` and returns silently for
  a completed flow — no error, and a `Promise<void>` with nothing to inspect. Writing to that array
  because a checkbox was ticked would **permanently suppress the tour the item launches**. So
  `complete()` on a flow-backed item writes a manual tick in the checklist's own record and nothing
  else. A test asserts `markCompleted` is never called.

  ## Headless, or with the widget

  `@guideflow/checklist` touches no DOM. `@guideflow/checklist/widget` is a separate entry point, so
  a host rendering its own list never bundles it. The controller is shaped for
  `useSyncExternalStore` and is referentially stable — item objects are reused field by field, and
  `getServerSnapshot()` returns a frozen `hydrated: false` state so SSR and the first client paint
  agree on rendering nothing.

  ## The widget is a disclosure, not a dialog

  No `role="dialog"`, no `aria-modal`, no focus trap — a persistent docked surface that swallows Tab
  is a keyboard trap under WCAG 2.1.2, and a second capture-phase trap competing with the renderer's
  would deadlock the keyboard. A running tour wins instead, three ways at once: z-index below
  `--gf-z-overlay`, `visibility: hidden`, and `inert`.

  Blocked rows are `aria-disabled`, never `disabled`, so they stay focusable and name the item that
  unblocks them. Progress is a count (`aria-valuetext: "3 of 5 complete"`), done is a glyph plus
  visually-hidden text, RTL is `inset-inline-end` with no `[dir="rtl"]` rules, and the reduced-motion
  and forced-colors blocks ship inside the widget's own stylesheet.

  ## Known limits, documented rather than hidden

  Manual ticks expire with the instance TTL — 30 days by default; `persistence: { ttl: 0 }` disables
  expiry. Cross-tab writes are last-write-wins. A manually ticked item cannot be re-run, because
  there is no flow behind it — a flow-backed one can, via `start(…, { force: true })`.

  ## Core

  One CSS custom property, `--gf-z-checklist: 99999`, and a docblock naming the reserved
  `ProgressStore` record suffixes. **No JavaScript, and no size-budget change** — `@guideflow/core`
  still measures 14.96 kB against 15 kB.

  Also documented, not built: the `target: null` single-step modal announcement, which already ships
  and is fully accessible. `apps/docs/guide/announcements.md` covers the recipe and its real limits.

- 19ada78: **A finished tour can be replayed from the checklist.**

  A done row used to be inert, and the reason was true when it was written: _"core has no
  `clearCompleted`, so a completed flow cannot be replayed, and rendering an inert control would
  promise an action that silently does nothing."_

  Both halves have since stopped being true. `progress.clearCompleted()` landed in 7.10b — and
  `start(flow, ctx, { force: true })` is the better mechanism, because it skips the completed and
  dismissed gates and **writes nothing**. Clearing the record instead would un-tick the very row the
  user just selected, so their reward for re-reading a guide would be losing the tick they earned.

  A **flow-backed** done row is an operable control again, announced as "Completed — select to do it
  again". A **manually ticked** one stays inert: there is no flow to re-run, and that is the dead
  button the original reasoning was right about.

- 48e60ff: **The checklist can now be a help centre, so there is no separate package for one.**

  Four additions, which with the existing `hideWhenComplete: false` make a permanent, grouped,
  link-carrying resource launcher:
  - **`ChecklistItem.href`** renders a real `<a>` instead of a button. `onActivate` could always open
    a page and it still would not be a link — no middle-click, no ctrl-click, no "copy link address",
    no `link` role. Only `http:`, `https:` and `mailto:` survive; anything else renders as plain text,
    because the item list may be author-supplied content.
  - **`ChecklistItem.group`** derives section headings from the values present, ungrouped rows first.
    The heading `<li>` carries `role="presentation"` so it does not inflate the list's item count.
  - **`ChecklistDefinition.dismissible`** — a help launcher the user summoned has nothing to get out
    of the way.
  - **`ChecklistDefinition.showProgress`** — `role="progressbar"` over a list of help articles is a
    lie an assistive technology reads out as a percentage.

  ```ts
  createChecklist(gf, {
    id: 'help',
    title: 'Help & guides',
    hideWhenComplete: false,
    dismissible: false,
    showProgress: false,
    items: [
      { id: 'tour', title: 'Product tour', flowId: 'onboarding', group: 'Guided' },
      { id: 'docs', title: 'Documentation', href: 'https://example.com/docs', group: 'Reading' },
    ],
  })
  ```

  A separate `@guideflow/resource-centre` was designed and deliberately not built: ~1,500 of its
  ~1,900 lines would have been a near-copy of this widget, and the audit finding it was meant to close
  asks for _one_ adjacent primitive, not four. See ADR-023.

### Patch Changes

- 7c72cb2: New package `@guideflow/banner` — a docked, non-blocking announcement surface

  "We shipped v2." "Maintenance on Friday." A bar that does not dim the page, does
  not trap focus, waits politely while a tour is running, and keeps its dismissal
  out of the tour funnel.

  `apps/docs/guide/announcements.md` has recorded four honest limits of the
  `target: null` modal announcement since Phase 7.8: the overlay blocks the page,
  only one can be up at a time, dismissal lands as `tour:dismiss` + `tour:abandon`
  where analytics counts it alongside users giving up, and the × / Skip chrome
  needs a custom renderer to remove. This closes all four, and that page now
  points at it instead of saying the variant is not built.

  **One shows at a time, derived rather than pushed.** Register as many as you
  like; `state.current` is the highest-priority eligible undismissed one and
  `queued` counts the rest. Ties keep registration order — the same rule targeting
  uses, so `priority` means one thing across the library.

  **Targeting is core's, not a second copy.** `urlPattern`, `audience` and
  `schedule` are evaluated by the same `matchUrl` / `matchAudience` /
  `matchSchedule` that decide which tour starts, so a throwing audience predicate
  means "not eligible" rather than a crash and an unparseable date bound is
  ignored rather than blocking forever. `evaluate()` reports `blockedBy` in core's
  own `BlockReason` vocabulary: "why isn't my banner showing" answers the same
  shape as "why didn't my tour start".

  **Dismissal is permanent unless you say otherwise.** Omit `version` and closing
  a banner suppresses it forever — ADR-015's rule, that "don't show me this again"
  is about interruption and editing the copy does not answer it. Set `version` and
  change it to bring it back, which is you asserting the content is genuinely new.
  Deliberately not an auto-derived content hash: that would make every dismissal
  carry a version, so nothing could ever mean "forever", and a typo fix would
  re-interrupt everyone.

  **A landmark, not a dialog.** `role="region"` with an accessible name, no
  `aria-modal`, no focus trap — a persistent docked surface that swallows Tab is a
  keyboard trap under WCAG 2.1.2. Announcements go through a _separate_
  visually-hidden polite region, because `role="status"` on the bar re-announces
  the whole thing every time the queue advances. `role="alert"` is not offered at
  any tone; it is assertive and would cut a running tour's step announcement in
  half.

  Headless if you want it: `subscribe` / `getSnapshot` / `getServerSnapshot`, with
  the widget in a separate `/widget` subpath so rendering your own bar costs no
  stylesheet.

  **`@guideflow/core`** gains one CSS custom property, `--gf-z-banner: 99995` —
  below the hint/hotspot band and below the checklist, because a banner must never
  cover a control the user needs. No JavaScript, no budget change.

  **`@guideflow/checklist` fixes a stylesheet teardown bug** found while copying
  its widget. `injectStyles` de-dupes by id, so a second `mountChecklist` injects
  nothing — and `destroy()` then called `removeStyles` unconditionally, stripping
  the stylesheet out from under every surviving mount. Silently: no error, just an
  unstyled widget. Its own test mounted twice and never checked. Both packages now
  refcount.

  Not in v1, each because it drags in more than it looks like: auto-dismiss timers
  and with them corner toasts, stacking, layout reservation, and mid-session
  schedule boundaries. See ADR-017.
