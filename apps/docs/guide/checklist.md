# Checklist

An onboarding checklist is a **projection of data GuideFlow already has**, not a second list to
keep in sync. `@guideflow/checklist` reads `ProgressStore`'s completed-flows array for items that
name a `flowId`, and keeps its own small record for items that no tour backs.

```bash
pnpm add @guideflow/core @guideflow/checklist
```

Zero bytes reach `@guideflow/core` — this is a separate package, and core never imports it.

## Quick start

```ts
import { createGuideFlow } from '@guideflow/core'
import { createChecklist } from '@guideflow/checklist'
import { mountChecklist } from '@guideflow/checklist/widget'
import '@guideflow/core/styles'

const gf = createGuideFlow({ context: { userId: currentUser.id } })
gf.createFlow(welcomeTour)

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

mountChecklist(checklist, { dock: 'bottom-end' })
```

The `tour` item ticks itself when `welcome-tour` completes, and clicking its row starts that tour.
The other two are ticked by your app.

## Two tiers of truth, split by provenance

| Item kind | Where "done" lives | Written by the checklist? |
|---|---|---|
| has a `flowId` | `gf.progress.getCompletedFlows(userId)` | **never** |
| everything else | the checklist's own record | yes |

An item is done if **either** source says so — a union, never an override. `source` reports which
won, and `'flow'` wins the label when both are true.

::: danger complete() does not record a flow completion
`checklist.complete('tour')` on a flow-backed item writes a **manual** tick. It deliberately does
**not** call `progress.markCompleted`.

`gf.start()` gates on `isCompleted` and returns silently for a completed flow, with no error and
no return value to inspect. Recording flow completion as a side effect of ticking a checkbox would
therefore permanently suppress the very tour that item launches.
:::

Because the flow-backed side is a pure projection, it is re-derived on every mount and cannot lose
a tick — which is what makes the rest of the design survivable.

## Dependencies between items

`requires` names item ids that must be done first. A blocked item renders `aria-disabled="true"`
(never `disabled`, which would remove it from the tab order), stays focusable, and describes which
item unblocks it. Chains are followed transitively — "complete B first" is useless when B is
itself unreachable — and a cycle terminates rather than hanging.

```ts
{ id: 'billing', title: 'Add a payment method', requires: ['data'] }
```

## Headless, or with the widget

`createChecklist()` is headless. The widget is a separate entry point, so a host that renders its
own list pays none of its bytes.

```ts
import { createChecklist } from '@guideflow/checklist'          // no DOM
import { mountChecklist } from '@guideflow/checklist/widget'    // the docked UI
```

The controller is shaped for `useSyncExternalStore` and is referentially stable — item objects are
reused field by field, so an unchanged row does not invalidate the snapshot above it.

```tsx
function Checklist({ controller }: { controller: ChecklistController }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  )
  if (!state.hydrated || state.hidden) return null
  return <ul>{state.items.map((item) => <Row key={item.id} item={item} />)}</ul>
}
```

`getServerSnapshot()` returns a frozen idle state with `hydrated: false`, so the server and the
first client paint agree on rendering nothing. Every `ProgressStore` method is async, so without
that flag the widget would render "0 of 5", jump to "3 of 5", and announce the flash.

## Strings

Checklist strings are **options, not `gf.i18n`**. Core's `Locale` is a closed interface and `t()`
is typed against its keys, so checklist copy cannot go through the instance registry without
editing core.

```ts
mountChecklist(checklist, {
  strings: {
    launcher: 'Erste Schritte',
    progressText: '{done} von {total} erledigt',
    dismiss: 'Ausblenden',
  },
})
```

`gf.i18n.use('de')` does **not** move these. Use `gf.i18n.activeLocale` as the signal for which
bundle to pass.

## Analytics

The package does not depend on `@guideflow/analytics` — that would make analytics mandatory. Route
the callback yourself. Analytics is **host-wired**; the package covers none of it for you.

```ts
createChecklist(gf, definition, {
  onEvent: (e) => {
    if (e.type === 'item-complete') {
      collector.track('guideflow.checklist.item_completed', {
        checklist_id: definition.id,
        item_id: e.itemId,
        source: e.source,
      })
    }
  },
})
```

`collector.track` is the only public path through the collector's private `send()`, so consent,
Do-Not-Track, sampling, URL scrubbing and key redaction all still apply.

The checklist emits **nothing** on the `TourEvents` bus. Seven hardcoded event-name arrays across
the adapters, analytics, devtools and the demo already disagree with each other about which events
exist; `subscribe()` delivers the same observability with no edit sites.

## Persistence

One record per user, at the **single-segment** key suffix `checklist` on the same prefix
`resetUser()` sweeps — so every checklist on the page costs one driver read, not one per list.
See [Persistence](/guide/persistence#reserved-key-suffixes).

Bump `version` when you rename, reorder or replace items. A stored record carrying a different
value is **discarded, not migrated**, with a `console.warn` naming the list.

::: warning Manual ticks expire with the instance TTL — 30 days by default
`ProgressStore` wraps every write with the configured TTL and there is no per-record override. A
user who does not return within 30 days finds their manual ticks gone.

```ts
createGuideFlow({ persistence: { ttl: 0 } })   // 0 means never expire
```

Flow-backed ticks share the completed-flows array's single expiry, and `markCompleted` skips the
write when the id is already present — so a repeat completion does not refresh it, while adding a
*new* id refreshes it for everything.
:::

**Cross-tab writes are last-write-wins.** Within a tab every write re-reads and merges through one
promise chain, so two ticks in the same instant both survive. Across tabs the record has no
compare-and-swap — no driver exposes one — so two tabs ticking different items in the same instant
can lose one. This is the same class of race as `markCompleted` itself.

**No cross-tab sync in v1.** A tick in one tab is not pushed to another; both converge on the next
`refresh()` or reload.

## Things it deliberately does not do

- **A manually ticked item cannot be re-run.** There is no flow behind it, so that row keeps its
  "Completed" marker and stays non-actionable rather than becoming a button that silently refuses.
  A **flow-backed** done row is operable — selecting it replays the tour via
  `start(…, { force: true })`, which writes nothing and so cannot un-tick the row you just used.
- **The widget is hidden and inert while a tour runs.** Its z-index sits deliberately *below*
  `--gf-z-overlay`, so a running tour dims and covers it. The decisive reason is the renderer's
  capture-phase focus trap: a Tab-reachable checklist mid-tour is a keyboard user being yanked
  back with no explanation.
- **It is a disclosure, not a dialog.** No `role="dialog"`, no `aria-modal`, no focus trap. A
  persistent docked surface that swallows Tab is a keyboard trap under WCAG 2.1.2.
- **Rows are not checkboxes.** The *app* ticks these, not the user, and `role="checkbox"` promises
  interactivity that does not exist.

## API

Full reference: [`@guideflow/checklist`](/packages/checklist).
