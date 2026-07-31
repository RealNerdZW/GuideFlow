---
"@guideflow/react": minor
"@guideflow/svelte": minor
"@guideflow/vue": minor
"@guideflow/ai": minor
---

`@guideflow/core` is now a peer dependency rather than a bundled one.

All four packages listed `@guideflow/core` under `dependencies`. Because the
documented install is `pnpm add @guideflow/core @guideflow/react`, core is
already a direct dependency of your app — and npm and yarn are then free to
resolve a second, differently-versioned copy under
`node_modules/@guideflow/react/node_modules/@guideflow/core`.

Two copies of the engine both evaluate, and each carries its own module state.
Anything that compares identity across the boundary — `instanceof` checks
against `DefaultRenderer`, a renderer built from one copy handed to
`createGuideFlow` from the other — silently takes the wrong branch. These
packages import real values from core (`createGuideFlow`, `computePosition`,
`getViewportRect`, `defaultI18n`, `isBrowser`) and several re-export its public
API, so a split is not theoretical.

Core now sits in `peerDependencies` as `>=0.1.9 <1.0.0`, which every `0.x`
release satisfies. Package managers resolve a peer to the copy already in your
app instead of nesting a private one. `@guideflow/analytics` already did this.

**This is breaking if you installed an adapter without core.** `pnpm add
@guideflow/react` alone now reports an unmet peer — pnpm and yarn fail on that
rather than warn. Install both:

```bash
pnpm add @guideflow/core @guideflow/react
```

No build or runtime change: every one of these packages already listed
`@guideflow/core` in its tsup `external` array, so core was never inlined into
the published bundles.
