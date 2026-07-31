---
"@guideflow/analytics": patch
---

Widen the `@guideflow/core` peer range so it survives a 0.x minor.

The peer was pinned to `^0.1.9`. On a `0.x` version a caret range is confined to
`0.1.x`, so the very next core minor — `0.2.0` — fell outside it. Two things
followed from that.

Consumers on core `0.2.0` would have hit an unmet-peer error, which pnpm and
yarn treat as a hard failure rather than a warning.

And because Changesets bumps a peer dependent whenever the peer range goes out
of range, every core minor forced a **major** bump here: `0.1.9` → `1.0.0`, then
`2.0.0`, and so on, none of which described a real breaking change in this
package.

The range is now `>=0.1.9 <1.0.0` — every `0.x` core satisfies it, and core
`1.0.0` will not, which is the point at which the peer contract genuinely needs
revisiting. Paired with `onlyUpdatePeerDependentsWhenOutOfRange` in the
changesets config, a core minor now moves this package by a patch through the
normal dependency rule instead of majoring it.

No runtime behaviour changes: `@guideflow/core` is a types-only dependency here
— the built ESM and CJS bundles contain no import of it, only the emitted
`.d.ts` does.
