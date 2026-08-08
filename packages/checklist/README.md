# @guideflow/checklist

**A docked onboarding checklist for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/checklist.svg)](https://www.npmjs.com/package/@guideflow/checklist)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

A checklist for [GuideFlow](https://github.com/RealNerdZW/GuideFlow) is a **projection of data
that already exists**. An item backed by a flow reads `ProgressStore`'s completed-flows array and
is never written to it, so completing the tour ticks the box and there is no second source of
truth to drift. Items that no flow backs live in the checklist's own record, under the same key
prefix `resetUser()` already sweeps.

**Zero bytes reach `@guideflow/core`.** This package imports core by type plus three public
helpers, and core never imports it.

## Installation

```bash
npm install @guideflow/core @guideflow/checklist
```

## Quick start

```ts
import { createGuideFlow } from '@guideflow/core'
import { createChecklist } from '@guideflow/checklist'
import { mountChecklist } from '@guideflow/checklist/widget'
import '@guideflow/core/styles'

const gf = createGuideFlow({ context: { userId: currentUser.id } })

const checklist = createChecklist(gf, {
  id: 'getting-started',
  title: 'Getting started',
  version: 1,
  items: [
    { id: 'tour',    title: 'Take the tour',      flowId: 'welcome-tour' },
    { id: 'data',    title: 'Connect your data' },
    { id: 'billing', title: 'Add a payment method', requires: ['data'] },
  ],
})

mountChecklist(checklist)
```

`flowId` items tick themselves when the tour completes. Everything else is ticked by your app:

```ts
await checklist.complete('data')
```

## Headless

The widget is a separate entry point, so a host rendering its own list pays none of its bytes.
`subscribe` / `getSnapshot` / `getServerSnapshot` are shaped for `useSyncExternalStore` and are
referentially stable — item objects are reused field by field.

```ts
const state = useSyncExternalStore(
  checklist.subscribe,
  checklist.getSnapshot,
  checklist.getServerSnapshot,
)
```

## Analytics

The package deliberately does not depend on `@guideflow/analytics`. Route the callback yourself:

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

## Known limits

- **Manual ticks expire with the instance TTL — 30 days by default.** Set
  `createGuideFlow({ persistence: { ttl: 0 } })` to disable expiry. Flow-backed ticks share the
  completed-flows array's own expiry.
- **Cross-tab writes are last-write-wins.** Two tabs ticking different items in the same instant
  can lose one. Closing this needs a storage-level compare-and-swap no driver exposes.
- **A manually ticked item cannot be re-run**, because there is no flow behind it — that row stays
  non-actionable rather than becoming a button that does nothing. A **flow-backed** done row is
  operable: selecting it replays the tour through `start(…, { force: true })`, which writes nothing
  and so cannot un-tick the row that launched it.
- **The widget is hidden and inert while a tour runs**, by design — a Tab-reachable checklist
  competing with the renderer's focus trap is a keyboard deadlock.
- **Strings are options, not `gf.i18n`.** Core's `Locale` is a closed interface; `gf.i18n.use()`
  does not move checklist strings.
- **No size budget in v1.** Unlike `@guideflow/core`, whose gzip number is a headline promise,
  this is opt-in weight in a package you choose to install. There is no `size` script and no CI
  gate, because no number has been agreed.

Full documentation: [guideflow docs → Checklist](https://realnerdzw.github.io/GuideFlow/guide/checklist).

## Licence

MIT © John Mugabe
