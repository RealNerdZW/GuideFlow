---
"@guideflow/core": minor
---

**`advanceOn`: let a tour advance when the user actually does the thing.**

ADR-004 spent ~1.3 kB carving a `clip-path` hole in the overlay so a `clickThrough` step lets the
user click the control it highlights — and the engine attached exactly one listener, `keydown` on
`document`, and nothing on the target. So the user clicked, the app responded, and the step waited
for **Next**. Shepherd ships `advanceOn`; driver.js ships `onNextClick`; this had neither.

```ts
import { advanceOn } from '@guideflow/core/navigation'

const stop = advanceOn(gf, {
  save: 'click',
  name: { event: 'input', when: (e) => (e.target as HTMLInputElement).value.length >= 3 },
  plan: { event: 'change', action: 'CHOSE_PLAN' },   // send(), so a branching state can route
})
```

Capture-phase delegation, so an app handler calling `stopPropagation()` cannot silently kill it. One
rule fires once. `next()` and `send()` only — never `end`, which would file every successful finish
as an abandonment in analytics.

Zero bytes in the core entry (measured unchanged at 15.29 kB). The navigation subpath gate moves
2 → 2.5 kB, measured 2.19 kB — ADR-020, following ADR-016's pattern of charging an opt-in bundle.

**Known limitation:** the renderer traps focus in the popover and sets `aria-modal` on every step, so
a `click` rule is mouse-only today. For anything that must be accessible, have your app dispatch its
own event and match on that. Widening the trap for `clickThrough` steps is tracked separately.

**`exposeGlobal`: let the devtools extension find your app.**

The panel detects a page through `window.__guideflow`, and no package ever set it — only the demo
did, so the extension reached essentially no real application.

```ts
const gf = createGuideFlow({ exposeGlobal: import.meta.env.DEV })
```

Off by default and it must stay that way: the global hands any script on the page a driveable tour
instance, and because the instance is an event emitter, one line of third-party script can mark a
tour completed in storage permanently. `configure({ exposeGlobal: false })` is a real kill switch,
and `destroy()` clears the global only if it still points at that instance.
