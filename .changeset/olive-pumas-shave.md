---
"@guideflow/core": minor
---

Target-only interaction, and `content.html` sanitisation moves to an opt-in subpath

**`clickThrough` now exposes the target, not the whole page.** ADR-004 recorded this as a known
limitation: the overlay was a single full-viewport div, so `clickThrough: true` dropped pointer
capture entirely and made everything interactive. "Let the user actually click the button I am
pointing at" — the one thing the option is named for — was unimplementable. The overlay now carves a
real hole with `clip-path`, and clipping affects hit-testing, so a click inside the hole reaches the
page while everything outside stays captured. One element and one style assignment; the four-panel
arrangement other libraries use costs several hundred bytes more and buys nothing here.

The square corners of the hole do not follow the cutout's `border-radius`, so a few pixels at each
corner are interactive but visually dimmed. Rounding them needs `clip-path: path()` with arcs, which
costs more than the mismatch is worth at a 4px default radius.

**`content.html` needs an opt-in import.** This is a **breaking change** if you use it:

```ts
import { createGuideFlow } from '@guideflow/core'
import { sanitizeHTML } from '@guideflow/core/html'

const gf = createGuideFlow({ sanitizeHTML })
```

Without it, `content.html` is escaped and rendered as **text**, and the renderer warns once telling
you why. Passing it through unsanitised would be an XSS hole; dropping it would be a blank popover
with no explanation. `content.body` is unaffected — it is plain text, escaped by the renderer, and
never touched the sanitiser.

The sanitiser is ~420 B gzip that every consumer was paying for, including the majority who only use
`content.body`. ADR-008 named moving it out as the precondition for any further budget raise; this
discharges that condition. `@guideflow/core` measures **14.13 kB** against an unchanged 14.5 kB
limit, and `@guideflow/core/html` is a further 767 B only if you import it.

Also: `flowId` is now declared on `GuideFlowInstance`, and the dead `.gf-clickthrough` and
`[data-gf-overlay] svg` rules are gone (the latter was left over from an SVG-mask implementation
that has not existed for some time).
