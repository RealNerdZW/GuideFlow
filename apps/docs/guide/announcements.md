# Announcements

A one-off announcement — "we shipped v2", "maintenance on Friday" — is a **single-step flow with
`target: null`**. That is not a workaround: the renderer has a dedicated unanchored path, and the
result is a centred, fully accessible modal.

```ts
await gf.start({
  id: 'v2-announcement',
  initial: 'main',
  states: {
    main: {
      final: true,
      steps: [
        {
          id: 'only',
          target: null,
          content: { title: 'We shipped v2', body: 'Faster exports and a new dashboard.' },
          actions: [{ label: 'Take a look', variant: 'primary', action: 'next' }],
        },
      ],
    },
  },
})
```

## What you get

- `role="dialog"` and `aria-modal="true"`, with `aria-labelledby` pointing at the title.
- Centred in the viewport, no arrow, no spotlight hole — the overlay dims the whole page.
- **No progress bar and no step counter.** Both are gated on `total > 1`, which is what makes a
  single-step flow read as an announcement rather than a truncated tour.
- Focus moved into the dialog, trapped while it is up, and restored to whatever was focused
  before — guarded on the element still being connected.
- The title and body announced through the polite live region.
- `Escape` dismisses it; `prefers-reduced-motion` and `forced-colors` are both honoured.

## Show it once

An announcement that reappears on every page load is worse than none. Two ways, and they compose:

```ts
// Persist "completed" so it never shows again for this user.
const gf = createGuideFlow({ context: { userId: currentUser.id } })
```

`gf.start()` returns silently for a flow this user has already completed, so a `final: true`
single-step flow shows exactly once — as long as a `userId` is set. Without one, nothing is
persisted and it shows every load.

For time-boxed or audience-scoped announcements, use
[targeting](/guide/targeting) rather than hand-rolling the check:

```ts
gf.createFlow({
  id: 'v2-announcement',
  targeting: {
    startTrigger: 'load',
    schedule: { startsAt: '2026-08-01T00:00:00Z', endsAt: '2026-08-15T00:00:00Z' },
    audience: { where: { plan: 'pro' } },
    frequency: { maxPerSession: 1 },
  },
  initial: 'main',
  states: { /* … */ },
})

createTargeting(gf).install()
```

## Honest limits

- **The overlay blocks the page.** This is a modal. There is no docked, non-blocking banner
  variant — that is tracked as a separate surface and is not built yet.
- **Only one can be up at a time.** `gf.start()` ends any running tour first, and starting an
  announcement over a live tour emits `tour:abandon`, which analytics records as the user giving
  up. Guard on `gf.isActive`.
- **Dismissal lands in the tour funnel.** Closing it emits `tour:dismiss` followed by
  `tour:abandon`, so `@guideflow/analytics` counts it alongside abandoned tours. Filter by flow id
  if you report on the two separately.
- **The × and the Skip button cannot be removed** without supplying a custom `RendererContract`.
  `actions` replaces the Next/Back pair, not the chrome around it.
- **It is not a step type.** There is no `type: 'announcement'`; it is an ordinary flow, which is
  why it inherits every fix the tour path gets.

## Related

- [Checklist](/guide/checklist) — the persistent, non-blocking surface.
- [Targeting](/guide/targeting) — who sees it and when.
- [Accessibility](/guide/accessibility) — what is verified, and by what.
