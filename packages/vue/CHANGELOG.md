# @guideflow/vue

## 0.2.0

### Minor Changes

- 2a80b4b: `@guideflow/core` is now a peer dependency rather than a bundled one.

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

- 4981071: Close the adapter parity gaps: Vue and Svelte now reach the whole `GuideFlowInstance` surface.

  **`pause`, `resume` and `skip` are reachable from an adapter for the first time.** They have
  existed on the core instance for a while but no adapter forwarded them, so a Vue or Svelte app
  could not pause a tour without reaching for the raw instance. Both adapters also expose a
  reactive `isPaused` (Vue: a ref, Svelte: a store), tracking core's `tour:pause` / `tour:resume`
  events.

  **The rest of the surface follows.** `currentStep`, `currentContent`, `createFlow`, `listFlows`,
  `configure`, `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints`, `i18n`, `progress`
  and the raw `instance` are now on `useTour()` and `TourStore`, plus a reactive `locale` with a
  `setLocale()` that keeps it in sync (the i18n registry emits no events, so calling `i18n.use()`
  directly still bypasses the ref/store).

  **New: scope-bound hotspots, idiomatic per framework.** Vue gains `useHotspot(target, options?)`,
  which accepts a template ref or a selector and removes the beacon on `onScopeDispose`. Svelte
  gains `hotspotAction(instance)`, a `use:` directive whose beacon lives exactly as long as the
  node it is applied to. Neither package ships components — Svelte components would need
  `svelte-package`, which `tsup` cannot do.

  **Fixed: step state was stale after a tour ended.** Core emits `tour:complete` / `tour:abandon`
  from inside `_doEnd()`, _before_ it nulls the machine, so both adapters latched the last live
  step and a progress indicator stayed on "2 of 2" for the rest of the page's life. Both now reset
  to the idle values on those events.

  **Fixed: `TourStore.destroy()` tore down an instance it did not create.** `createTourStore(gf)`
  adopts an instance the caller owns, but `destroy()` called `gf.destroy()` regardless — so
  disposing one component's store killed a shared instance along with every listener the host had
  registered on it. `destroy()` now disposes the instance only when the store created it, and the
  new `ownsInstance` boolean says which case you are in. Listener detachment is unchanged.

  **Fixed: `this.$guideflow` was untyped.** `@guideflow/vue` now augments Vue's
  `ComponentCustomProperties`, so Options API TypeScript users get `GuideFlowInstance` without
  writing their own `.d.ts`.

  **Breaking for CJS consumers of `@guideflow/svelte`: the package is now ESM only.** The `require`
  entry point it advertised never worked — Svelte is ESM-only in both 4 and 5, so
  `require('svelte/store')` threw `ERR_REQUIRE_ESM` on every Node in the declared `>=18` range
  below 22.12. Rather than keep publishing a bundle that cannot load, `main` now points at the ESM
  build and the `require` condition is gone. Import it from ESM, or from a bundler that resolves
  the `import` condition.

### Patch Changes

- 8dc6621: Documentation only: the Vue and Svelte adapters now describe what they actually
  ship.
  - **Neither package contains components.** Both `package.json` descriptions
    advertised them ("composables and components", "stores and components"), and
    `@guideflow/svelte` carried a `tour-component` keyword. The descriptions now
    say plugin/composables and store, the keyword is replaced with `sveltekit`,
    and every README and docs page states plainly that the tour UI is drawn by
    `@guideflow/core`'s renderer.
  - **The headline Svelte example did not compile.** It read `$tour.isActive`,
    but `createTourStore()` returns a plain object whose _fields_ are stores —
    Svelte's `$` auto-subscription only applies to an identifier that is itself a
    store. Every example now destructures first (`const { isActive } = tour`) and
    writes `$isActive`. The same broken snippet in the `createTourStore` JSDoc is
    fixed too, along with its unbalanced `</>` in place of `{/if}`.
  - **`theme` is not a config option.** Doc examples passed `theme: 'bold'` and
    `theme: 'minimal'` to `createGuideFlow()`, `createTourStore()` and
    `GuideFlowPlugin`; `GuideFlowConfig` has no such field, so those snippets were
    type errors. Replaced with real options.
  - **`TourStore.destroy()` destroys the wrapped instance**, including one that
    was passed in, rather than only detaching its own listeners. The interface
    JSDoc, README and API reference now say so, and warn against calling it on a
    shared instance.
  - **The step stores/refs do not reset when a tour ends.** `isActive` returns to
    `false`, but `currentStepId`, `currentStepIndex` and `totalSteps` retain their
    last rendered values in both adapters. Documented in the Vue and Svelte guides
    and references.
  - Vue: cleanup is `onScopeDispose()`, not `onUnmounted()` — the reference said
    the latter, which understates that a bare `effectScope()` (a Pinia store) is
    covered. `goTo`, `send`, `currentStepId`, `GUIDEFLOW_KEY` and the fact that
    `GuideFlowPluginOptions` extends the whole of `GuideFlowConfig` (and that
    `instance` overrides it) were missing from the tables.
  - The plugin reference no longer constructs `OpenAIProvider` with an API key in
    browser code; it uses `ProxyProvider`.

- 8dc6621: Documentation and metadata corrections.

  `@guideflow/core` exposes the IIFE build as a supported `./global` export, with
  `unpkg`/`jsdelivr` fields, so script-tag and CDN usage is a documented entry
  point rather than a file that happened to be inside `dist`.

  `@guideflow/vue` and `@guideflow/svelte` no longer advertise "components" in
  their package description and keywords — neither ships any.

  `@guideflow/cli`: `studio` and `push` no longer describe themselves in `--help`
  as "a local visual tour editor" and "GuideFlow Cloud". No editor exists, and
  the default push endpoint is a placeholder; both are marked experimental.

  Source-file headers across the packages carried a GitHub URL and email that
  disagreed with every manifest. They now match `repo.config.json`, and
  `scripts/sync-repo-meta.mjs` rewrites them so they cannot drift again. These
  headers ship to npm, because the `files` field includes `src`.

- 8dc6621: Correct the author identity shipped inside every package.

  The header block at the top of each package entry point named
  `github.com/johnmugabe` and a `@263tickets.co.zw` address, neither of which owns
  the repository or reads mail for it. Because `"files"` ships `src`, both strings
  went out inside the published tarballs. The headers now carry the owner from
  `repo.config.json` (`github.com/RealNerdZW`), and the `@email` line is gone —
  vulnerabilities are reported through GitHub Security Advisories, as `SECURITY.md`
  says.

  No runtime code changed.

- 4981071: CLI safety fixes and packaging corrections.

  **`guideflow export` no longer destroys your input file.** The implicit output
  path was `src.replace(/\.(ts|js)$/, '.flow.json')`, which does not match a
  `.json` input — so `guideflow export flow.json` resolved the output to the
  input and overwrote it, minified unless `--pretty` was passed. The extension is
  now stripped whatever it is, writing to the input path is refused outright, and
  an existing output requires `--force`.

  **`guideflow init` no longer clobbers your work.** Every file was written
  unconditionally, so running `init` twice destroyed whatever you had put in
  those files. It now skips files that exist, reports what it skipped, and takes
  `--force`.

  **`guideflow init` can run unattended.** The output-directory question had no
  `when:` guard, so it always prompted and could never run in CI even with every
  flag supplied. It now skips prompts whose answer is already known, and `--yes`
  suppresses prompting entirely (as does a non-TTY stdout).

  **`guideflow init --framework vue|svelte` now scaffolds something.** Only
  `react` had a template; the other two wrote no framework file at all and still
  printed success. Vue gets a plugin-install file, Svelte a store file.

  **`guideflow push` honours `GUIDEFLOW_API_KEY`.** `--api-key` was a
  `requiredOption`, so commander rejected the invocation before the action body
  ran — making the documented env-var fallback unreachable. The env var is now
  the preferred route; a key on the command line lands in shell history and
  process listings.

  **`@guideflow/cli` ships type declarations.** `package.json` advertised a
  programmatic `exports` entry while tsup ran with `dts: false`.

  **Packaging, all published packages.** `sideEffects: false` told bundlers
  nothing in the package has side effects, so webpack was free to tree-shake
  `import '@guideflow/core/styles'` away entirely — it is now
  `sideEffects: ["**/*.css"]`. The `exports` map also declared a single top-level
  `types` pointing at ESM declarations while the `require` condition resolved to
  `.cjs`; types are now declared per condition, so a `node16`/`nodenext` CommonJS
  consumer resolves `index.d.cts`.

- 4981071: **`@guideflow/core` exposes `isPaused`.** `TourEngine` kept `_paused` private and offered no way
  to read it, so a consumer holding a `GuideFlowInstance` could call `pause()` and `resume()` but
  never ask whether a tour was paused. `isPaused` is now a getter on `TourEngine` and a `readonly`
  field on the `GuideFlowInstance` interface, alongside `isActive`. It reports `false` once the tour
  ends, so a paused tour that is stopped does not leave a stale `true` behind.

  **Fixed: Vue and Svelte reported an already-paused tour as running.** Both adapters derived
  paused-ness purely from core's `tour:pause` / `tour:resume` events and seeded their state with a
  literal `false`, because there was nothing to read. A `useTour()` mounted — or a
  `createTourStore(gf)` created — while a tour was already paused therefore started out claiming the
  tour was running, and stayed wrong until the next pause or resume. Both now seed from
  `gf.isPaused` and read the getter in their pause/resume handlers.

  **Fixed: React had the same bug, plus one of its own.** `useTour().isPaused` came from a mirror
  inside the `useSyncExternalStore` store, seeded `false` for the same reason. That store's engine
  subscription is also ref-counted, and unmounting the last consumer both reset the mirror and
  stopped observing `tour:pause` / `tour:resume` — so a component remounting into a tour that was
  still paused reported it as running, even though an earlier consumer had seen the pause. The
  snapshot now reads `gf.isPaused` directly and keeps no mirror, so it cannot drift.

- 26164ec: Fix a listener leak in `useTour()` when called outside a component.

  `useTour()` registered its teardown with `onUnmounted`, which only fires for a
  component instance. Called from a bare `effectScope()` — the normal shape for a
  Pinia store or a shared composable — the teardown was never registered and all
  five GuideFlow event listeners stayed attached for the lifetime of the page.
  It now uses `onScopeDispose`, which also covers the component case because
  `setup()` runs inside its own effect scope.

  `@guideflow/core` additionally exports `getAbsoluteRect`, the page-coordinate
  counterpart to `getViewportRect` (which is client-relative). It was referenced
  in the 0.1.9 release notes but never actually exported.
