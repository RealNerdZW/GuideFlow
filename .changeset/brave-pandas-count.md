---
"@guideflow/checklist": minor
"@guideflow/core": patch
---

New package: `@guideflow/checklist` — an onboarding checklist that is a projection, not a copy

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
    { id: 'tour',    title: 'Take the tour',        flowId: 'welcome-tour' },
    { id: 'data',    title: 'Connect your data' },
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
