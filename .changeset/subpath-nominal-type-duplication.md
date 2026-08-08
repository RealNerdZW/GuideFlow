---
"@guideflow/core": patch
---

**`@guideflow/core/targeting` did not type-check for anyone outside this repository.**

```ts
import { createGuideFlow } from '@guideflow/core'
import { createTargeting } from '@guideflow/core/targeting'

const gf = createGuideFlow({})
createTargeting(gf)   // error TS2345 — since 0.1.9
```

The error chain ran `GuideFlowInstance → configure → GuideFlowConfig → renderer → RendererContract →
setI18n → I18nRegistry` and ended on the line that explains it: *"Types have separate declarations of
a private property `_locales`"*. There was no workaround short of `as never`.

**Cause.** `tsup.config.ts` is seven configs, each carrying `dts: true`, and rollup-dts bundles per
entry — it does not emit an import back into the main entry's declarations, it **inlines the entire
transitive type graph** into every subpath file. `dist/targeting/index.d.ts` contained zero `import`
statements and its own private copies of `I18nRegistry`, `ProgressStore` and `EventEmitter`.

Duplicated *interfaces* unify structurally and cost nothing, which is why six of the seven subpaths
were fine. A duplicated **class with a `private` member is nominally typed**, so the copy inlined
into the subpath and the copy in `dist/index.d.ts` can never be the same type — no matter that they
are character-for-character identical.

**Fix.** `createTargeting` now takes `TargetingHost<TContext>`, a structural interface naming only
what it actually calls: `listFlows`, `start`, `goTo`, `isActive`, `context`, `on`, and four methods
off `progress`. `loadCaps`/`saveCaps` take a two-method `CapStore` instead of `ProgressStore`. Both
are exported. This is strictly widening — a `GuideFlowInstance` still satisfies it, and a hand-built
host now does too — so no existing call changes, and `@guideflow/core/navigation` already had the
same shape in `AdvanceOnHost`. Type-only: all seven bundles measure byte-identical
(core 15.54 kB, targeting 2.83 kB, navigation 2.19 kB), and `dist/targeting/index.d.ts` drops from
48.6 kB to 25.8 kB with zero class declarations left in it.

**Why no test caught it.** Every caller in this repository — the demo app, the unit tests, the e2e
fixtures, the sibling packages — resolves `@guideflow/core` through tsconfig `paths` to `src`, so
they all share one copy of the type graph and unify trivially. `dist` is only ever type-checked by a
consumer, and this repository contains none. `pnpm type-check` could not have found this.

Two new guards, both verified to fail before the fix and pass after:

- `scripts/check-dist-types.mjs` builds a scratch package that resolves through the real `exports`
  map on `moduleResolution: node16`, and compiles one consumer per subpath under **both** module
  kinds — ESM against `dist/*.d.ts` and CJS against `dist/*.d.cts`, since tsup emits those
  separately and a fix landing in only one is not a fix. `skipLibCheck` is off. Wired into the
  existing `pack` CI job, which already builds everything.
- `packages/core/src/__tests__/subpath-type-isolation.test.ts` is the fast half: it fails at the
  source, in milliseconds, if anything under `src/targeting/` or `src/navigation/` imports a
  class-bearing module — including transitively via `../index.js`, which is how a subpath declaring
  no class of its own still reaches `I18nRegistry`. A companion test re-derives the class inventory
  from the source tree so the allow-list cannot rot.

The rule this leaves behind: **a subpath may reference core's interfaces and type aliases freely, and
must never reference one of its classes.**
