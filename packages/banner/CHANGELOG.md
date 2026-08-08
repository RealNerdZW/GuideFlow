# @guideflow/banner

## 0.2.0

### Minor Changes

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
