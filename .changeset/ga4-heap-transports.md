---
"@guideflow/analytics": minor
---

**`GA4Transport` and `HeapTransport` — the two sinks that cannot take a GuideFlow event verbatim.**

Four vendor transports already shipped, and all four forward `event.event` unchanged because their
backends accept it. Google Analytics 4 and Heap do not, and both fail the same way: they accept the
call and store nothing, with no error, no console message and no failed request. The symptom arrives
days later as an event or a column that is simply not in the report.

```ts
import { GA4Transport, HeapTransport } from '@guideflow/analytics'

collector
  .addTransport(new GA4Transport())                          // window.gtag
  .addTransport(new GA4Transport({ measurementId: 'G-…' }))  // …or one specific stream
  .addTransport(new HeapTransport())                         // window.heap
```

**GA4.** A dot is illegal in a GA4 event name and every GuideFlow event name has two, so
`guideflow.tour.completed` would have been silently discarded. The mapping: every character outside
`[A-Za-z0-9_]` becomes one underscore, a name not starting with a letter is prefixed `gf_` (GA4
reserves the `_` prefix for Google), and the result is truncated to 40 characters last — so the six
collector events arrive as `guideflow_tour_completed` and friends. Parameter names take the same
rule, string values are cut to 100 characters, and anything that is not a string, a finite number or
a boolean is dropped, because one unsupported value invalidates the whole hit rather than the one
parameter. `measurementId` is forwarded as gtag's `send_to`, unsanitised, for pages with more than
one GA4 destination — and `send_to` is **reserved**, so a property of that name is dropped whether or
not one is configured. It is a gtag control parameter naming the hit's destination, not event data;
leaving it writable would let a tour author or a `globalProperties` entry redirect events to a GA4
property you do not control, and with no `measurementId` set there is nothing to overwrite a forged
value with. The reservation is checked after name sanitising, so `send.to` cannot launder into it.

**Heap.** Heap stores primitives; a nested object is not rejected and not stringified, the property
just never exists. So the bag is flattened to dotted keys first — `{ user: { plan: 'pro' } }` becomes
`user.plan` — with arrays indexed; `Date`, `Map` and `Set` serialised (none of the three has
enumerable keys to walk); and values with no primitive form dropped. The brand checks go through
`Object.prototype.toString`, never `instanceof`, so a `Date` or `Map` that crossed a realm boundary —
an iframe, a cross-document bridge — is recognised rather than silently lost. A top-level property
that produces no key at all is reported once per transport with a `console.warn` naming it, because
a column that is simply absent is the failure mode nobody can debug. Nesting stops at four segments,
which is also what makes a cyclic `globalProperties` terminate instead of hanging the page.

Both read their global lazily on every event, so the vendor snippet may load before or after
GuideFlow; both are inert when it never loads, and inert under SSR. Both also shape-check what they
find rather than trusting that a present global is a usable one: a non-callable `gtag` counts as
absent, and so does a `heap` with no callable `track` — which is the state Heap's own snippet leaves
behind for the whole of page load, since it opens `window.heap = window.heap || []`.

Neither reads its global through a `declare global` block, unlike the other vendor transports. For
`gtag` a `Window.gtag` declaration would ship in the published `.d.ts` and merge with
`@types/gtag.js` — which any app calling `gtag()` from TypeScript already has, and which types it
differently. That is a compile error in the consumer's build caused by our types, and nothing in this
repo could have caught it. For `heap` the objection is sharper: the declaration asserted that a
present `window.heap` has a callable `track`, which is false for exactly the window described above.

The analytics branch-coverage ratchet goes 98 → 99; both new files measure 100% on every metric.
