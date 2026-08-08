# CLAUDE.md — GuideFlow.js

Operating manual for Claude Code in this repository. Read this before touching anything.

> **Companion documents** live in [`.claude/docs/`](.claude/docs/). Start with
> [`AUDIT.md`](.claude/docs/AUDIT.md) (what is broken) and
> [`REMEDIATION-PLAN.md`](.claude/docs/REMEDIATION-PLAN.md) (the ordered work queue).
> [`.claude/README.md`](.claude/README.md) indexes everything.
>
> **`COMPETITOR-TEARDOWN.md` is not a plan for this repository.** It describes **guideflow.com**, a
> hosted demo-automation SaaS that captures a *clone* of an app for *prospects who do not have it*.
> This is an embedded library that guides an app's *own signed-in users*. Same name, different
> product. [`EXPANSION-PLAN.md`](.claude/docs/EXPANSION-PLAN.md) grades it and is Phase 8; read that
> first, and never implement the teardown literally — it needs a backend, against ADR-014.

---

## 1. What this project is

GuideFlow.js is a **framework-agnostic product-tour / user-onboarding library**, published as a
scoped npm monorepo. Tours are modelled as **finite state machines**, not linear step arrays —
that is the core architectural bet and the thing that differentiates it from `driver.js`,
`intro.js`, and `shepherd.js`.

The pitch is "AI-Powered Product Tours". Treat that as an *aspiration under construction*, not a
description of the current state — see `.claude/docs/AUDIT.md` §AI.

**Author / owner:** John Mugabe (GitHub `RealNerdZW`). Licence MIT.

---

## 2. Repository shape

```
packages/
  core/         @guideflow/core       FSM engine, spotlight, popover, renderer, persistence, i18n. ZERO runtime deps.
                                      Subpaths: /targeting /navigation /html /versioning /selector /authoring
  react/        @guideflow/react      TourProvider, useTour, useTourStep, useHotspot, GuidePopover, ConversationalPanel
  vue/          @guideflow/vue        GuideFlowPlugin + useTour composable (no components)
  svelte/       @guideflow/svelte     createTourStore (no components)
  ai/           @guideflow/ai         GuideBrain + OpenAI / Anthropic / Ollama / Mock providers
  analytics/    @guideflow/analytics  AnalyticsCollector, 5 transports, ExperimentEngine
  checklist/    @guideflow/checklist   createChecklist + docked mountChecklist widget. A projection of
                                      ProgressStore. Depends on core; core never imports it.
  banner/       @guideflow/banner      createBanners + docked mountBanner widget. One non-blocking
                                      announcement at a time, targeted with core's own rule matchers.
  survey/       @guideflow/survey      createSurveys + docked mountSurvey widget. NPS/CSAT as a card,
                                      with a cooldown and a host-wired answer seam.
  mcp/          @guideflow/mcp         guideflow-mcp, a read-only stdio MCP server over ./authoring.
                                      Holds no credentials, makes no network calls, writes no files.
  cli/          @guideflow/cli        init / export / validate
  devtools/     @guideflow/devtools   MV3 browser extension (private: not published). recorder.html is the
                                      authoring surface; the panel inspects. Tested in real Chromium by
                                      apps/e2e/tests-extension — the ONLY place it is exercised at all.
apps/
  demo/         Vite + React playground that exercises core/react/ai/analytics
  docs/         VitePress site — THIS IS THE CANONICAL DOCS SITE
  e2e/          Playwright suite — rebuilt in Phase 2; serve.mjs serves the repo root so the
                fixture loads the real dist/ artefacts. Flows live in fixtures/flows.js, which
                packages/core's e2e-fixture.test.ts imports so the two cannot drift.
  storybook/    Storybook 8 component explorer
docs/           Legacy hand-written HTML site — STALE. Do not add to it.
scripts/
  sync-repo-meta.mjs   Propagates repo.config.json into package manifests
.changeset/     Changesets config (release automation)
```

### Dependency direction

`core` depends on nothing. Everything else depends on `core` via `workspace:*`. **Never** introduce
a runtime dependency into `core`, and never make `core` import from a sibling package — the
zero-dependency, ~14 kB-gzip budget is a headline promise and is enforced by `size-limit`.

---

## 3. Commands

Run from the repo root. `turbo` orchestrates; `pnpm` is the only supported package manager.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Build everything publishable | `pnpm turbo run build --filter=!@guideflow/storybook --filter=!docs --filter=!e2e` |
| Build one package | `pnpm --filter @guideflow/core build` |
| Type-check | `pnpm type-check` |
| Lint (zero-warning policy) | `pnpm lint` |
| Unit tests | `pnpm test` |
| Watch tests for one package | `pnpm --filter @guideflow/core test:watch` |
| Bundle-size gate | `pnpm --filter @guideflow/core size` |
| Validate a flow file | `pnpm --filter @guideflow/cli exec guideflow validate <file>` |
| Demo app | `pnpm demo` |
| Docs site | `pnpm docs:dev` |
| Storybook | `pnpm storybook` |

**Full local verification before claiming done** — use the `/verify` command, or:

```bash
pnpm turbo run build type-check lint test --filter=!@guideflow/storybook --filter=!docs --filter=!e2e
```

### Known-good baseline (Phases 0–6 complete, Phase 7 through 7.11, Phase 8.1–8.7 + 8.9, 2026-08-08)

**The audit has no open P0s.** The last one — `no-spa-route-change-handling` — closed in Phase 7.1.

Build, type-check, lint and unit tests are **all green**: **1399 unit tests pass**, 1 skipped
(core 580, ai 153, analytics 118, react 114, checklist 88, survey 79, banner 62, devtools 54,
vue 47, mcp 37, svelte 34, cli 33).
**Seven** bundles, each gated independently: `@guideflow/core` **15.54 kB / 16 kB**, `./authoring`
**5.35 kB / 5.5 kB**, `./targeting` **2.83 kB / 3 kB**, `./navigation` **2.19 kB / 2.5 kB**,
`./selector` **1.76 kB / 2.5 kB**, `./html` **767 B / 1 kB**, `./versioning` **336 B / 500 B**.
`@guideflow/checklist` carries no size gate by design — see ADR-011.
If any of these regress, you broke it — do not paper over it.

**The Playwright e2e suite now actually runs: 527 passed, 3 conditionally skipped, across chromium,
firefox, webkit and Mobile Chrome.** It never had before. Phase 2 rebuilt the harness but every spec still called
`page.goto('/')`, and Playwright resolves that as `new URL('/', baseURL)` — the leading slash
discards the base path, so all three specs loaded the repo root and every `beforeEach` timed out
waiting for `__gfReady`. Verify with:

```bash
pnpm --filter e2e test:e2e
```

That suite is the only place in the repo where layout, tab order and `getComputedStyle` are real.
happy-dom reports `offsetParent === null` for every element and has no layout engine, so both
geometry P0s and every focus-order defect were structurally invisible to unit tests. It is also the
only place `clip-path` hit-testing is real, which is what `clickThrough` now depends on. **When you
touch positioning, focus, pointer capture or CSS, run the e2e suite — a green `pnpm test` proves
nothing about any of them.**

Every package has a real `test` script; `--passWithNoTests` has been removed everywhere. Six
packages carry coverage thresholds set as **ratchets** just below measured coverage — raise them as
coverage improves, never lower them to make a build pass. The one remaining hole is
`@guideflow/devtools`, which still has no tests (needs an extension harness).

**The Phase 3 devtools hardening has still not been exercised in a browser** — the nonce handshake,
the relay allowlist and `optional_host_permissions` were reasoned about by reading. A mismatch would
present as *silence*, not an error. Run `/gf-extension-dev` before trusting the extension.

**No manual screen-reader pass has been run.** Phase 6's a11y work is verified by axe, by
assertion, and now by an announcement audit — `apps/e2e/tests/a11y-announcements.spec.ts` captures
every live-region utterance in order with all four regions on one page, plus the real ARIA tree via
`ariaSnapshot()`. That found two defects axe cannot see (the survey scale exposed every value
twice; a tour step announced doubled punctuation) and measured a third it did not fix (two surfaces
release held announcements in the same millisecond when a tour ends).
It still is not a manual pass: pacing, verbosity and whether the result is pleasant need ears.
`.claude/docs/SCREEN-READER-PASS.md` is the session script. Do not restore the "accessible by
default" marketing claim until someone has run it.

> The size budget: 12 → 12.5 kB (Phase 1) → 13 kB (ADR-007, the sanitiser) → 14.5 kB (ADR-008,
> accessibility) → 15 kB (ADR-010, the navigation seam) → **15.5 kB** (ADR-014, version-scoped
> completion) → **16 kB** (ADR-026, `repaint`). Core measures **15.54 kB with ~460 B of headroom** — it got *smaller* while gaining
> the content pipeline, because ADR-022 minified the four injected CSS literals at build time
> (−570 B, for the gate **and** for a real consumer).
>
> **ADR-022 is the worked example of a real saving versus a fake one.** Moving the token-adapter
> and intro-compat re-exports off the entry drops the gate figure by ~1 kB and changes what an
> actual consumer downloads by **three bytes** — `sideEffects` is CSS-only, so every bundler
> already shakes them away, and `size-limit` has no `import` key so it over-measures the entry.
> A seventh raise was written, taken and withdrawn once the CSS saving landed. Measure what a
> consumer downloads, not what the gate prints.
>
> **ADR-020 did the same for the *navigation* subpath, 2 → 2.5 kB**, to land `advanceOn`: measured
> 2.19 kB, core entry unchanged. **ADR-021 took *targeting* 2.75 → 3 kB** for the deep-link start,
> measured 2.83 kB — the third raise on that one bundle, which is worth saying out loud. Three
> subpath raises now follow this shape; it is the one to copy.
>
> **ADR-016 raised the *targeting subpath* to 2.75 kB, not the core entry.** That is the pattern to
> copy: `install()` needed real route handling, `watchHistory` cost 380 B, and the cost landed on
> the opt-in subpath paid for by the people who asked for targeting. Duplicating `history.ts` into
> that bundle is safe *only* because its refcount lives on `Symbol.for('guideflow.navigation')`, so
> two module copies share one patch and one teardown.
>
> ADR-008's condition on the 15 kB raise — move `content.html` out of the default bundle first —
> was discharged by **ADR-009**, which deliberately did *not* raise the limit at the same time.
> ADR-014's ~200 B bought the difference between "republishing a tour works" and "republishing
> silently reaches nobody who finished it", which is the bar a raise has to clear.
>
> Seven bundles are gated independently. Any docs figure quoting a bundle size must say
> **~15.1 kB**.

## 4. Code conventions

These are enforced by ESLint + `tsconfig.base.json` and are non-negotiable.

- **TypeScript strict, plus** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`,
  `noImplicitOverride`.
  - `exactOptionalPropertyTypes` is why you see the conditional-spread idiom everywhere:
    ```ts
    ...(step.padding !== undefined && { padding: step.padding })
    ```
    Use it. Do not "fix" it into `padding: step.padding`.
  - `noPropertyAccessFromIndexSignature` is why index-signature reads use brackets:
    `process.env['OPENAI_API_KEY']`, `item['title']`.
- **`@typescript-eslint/no-explicit-any` is an error.** The two existing `any` casts
  ([packages/core/src/index.ts:213](packages/core/src/index.ts#L213),
  [packages/core/src/compat/intro-compat.ts:56](packages/core/src/compat/intro-compat.ts#L56)) carry
  explicit disable comments and a rationale. Match that bar or don't add the cast.
- **`no-console` is a warning, and `--max-warnings 0` turns warnings into failures.** Only
  `console.warn` and `console.error` are allowed. Debug logging goes through the internal `_log()`
  helpers gated on `config.debug`.
- **`import/order` with alphabetised groups and blank lines between groups.** `type` imports must
  use `import type` (`consistent-type-imports`).
- **ESM-first with explicit `.js` extensions on relative imports** (`./engine/tour.js`) even in
  TypeScript source. Required by `verbatimModuleSyntax` + node16-style resolution in consumers.
- 2-space indent, no semicolons in `core`/`react`/`vue`/`svelte`, **semicolons in `ai`/`analytics`**.
  This is inconsistent but intentional-by-accident: match the file you are editing, and let
  Prettier decide.
- Section banner comments (`// ── Public API ────`) are the house style for long modules. Keep them.

### SSR safety

Anything touching `document`/`window` must be guarded by `isBrowser()` from
`packages/core/src/utils/ssr.ts`, and must never run at module scope. `core` is imported by Nuxt,
Next and SvelteKit users.

### CSP

All injected `<style>` tags flow through `injectStyles(css, id, nonce)` in
`packages/core/src/utils/styles.ts` and must honour `config.nonce`. Never write a raw
`document.head.appendChild(style)`.

---

## 5. Architecture you must understand before editing `core`

### 5.1 The `Object.assign(engine, {...})` instance pattern

`createGuideFlow()` does **not** wrap a `TourEngine` — it *mutates* one:

```ts
const engine = new TourEngine<TContext>({ ... })
const instance = Object.assign(engine as any, { start(){...}, next(){...}, ... })
```

So `instance === engine`. Consequences that have already caused bugs:

1. Methods defined in the object literal **shadow** the `TourEngine` prototype methods of the same
   name. Any wrapper that wants the original must capture a bound reference *before* the
   `Object.assign` — that is what the `_engineStart` / `_engineNext` / … constants are for.
   Calling `engine.next()` inside the `next()` wrapper would recurse infinitely.
2. Prototype members **not** shadowed (`pause`, `resume`, `skip`, `isActive`, `isPaused`, `currentStepId`,
   `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`, `machine`, `flowId`) are
   reachable on the instance for free. That is why they appear in `GuideFlowInstance` without
   appearing in the literal.
3. Event forwarding between `engine` and `instance` would be self-referential. Do not add
   `engine.on(x, () => instance.emit(x))` — it loops.

If you refactor this, refactor it *deliberately* into explicit composition, update
`GuideFlowInstance`, and add tests. Do not partially untangle it.

### 5.2 Flow = state machine

```ts
interface FlowDefinition {
  id: string
  initial: string
  states: Record<string, { steps?: Step[]; on?: TransitionMap; onEntry?; onExit?; final?: boolean }>
  context?: GuidanceContext
}
```

`FlowMachine` tracks `(state, stepIndex)`. `next()` advances `stepIndex` within the current state;
when the state's steps are exhausted it follows the transition table.

**Correction (Phase 7.9).** This section used to say a flow with no `final: true` state "never
completes". **That was wrong**, and it was wrong for eight phases. Measured against the real engine:
such a flow emits `tour:complete` normally and `isActive` goes false. `machine.isFinal` is read by
no engine code at all; the single functional read of `final` is `_defaultSuccessor`
([machine.ts:121](packages/core/src/fsm/machine.ts#L121)), where it only stops the step-counter walk.
A tour ends when there is nothing left to render — which is exactly what §6's first bullet says. So a
missing `final: true` is an authoring slip worth a **warning**, not a broken flow, and
`@guideflow/core/authoring` grades it that way. `packages/core/src/__tests__/authoring-engine.test.ts`
pins the behaviour in both directions so this cannot rot again.

Flat `{ id, steps: [...] }` objects are **not** valid flows — that shape
appears in `apps/e2e/fixtures/index.html` and is one reason the e2e suite is broken.

### 5.3 Render pipeline

`TourEngine._renderCurrentStep()` is async and guarded by a monotonic `_renderGeneration` counter.
Every `await` boundary is followed by `if (gen !== this._renderGeneration) return`. **If you add an
`await` in that method you must add the generation check after it**, or a fast next/prev will render
a stale step.

Order: evaluate `showIf` → resolve async `content` → resolve `target` → scroll + 150 ms settle →
`spotlight.show()` → set `_currentStep`/`_currentContent` → emit `step:enter` →
`renderer.renderStep()`.

### 5.4 Renderer contract

`core` never assumes the default renderer. Adapters and userland implement `RendererContract`. The
default renderer builds a string and assigns `innerHTML` — **every interpolated value must be
escaped** (`_esc`) or sanitised. See `.claude/docs/AUDIT.md` §SEC for the currently-known holes in
`_sanitizeHTML`; when you fix it, fix it by parsing, not by adding another regex.

### 5.5 i18n is instance-scoped (since Phase 1)

`createGuideFlow()` builds its own `new I18nRegistry()`, exposes it as `instance.i18n`, and pushes it
into the renderer via `renderer.setI18n(i18n)`. `DefaultRenderer` uses `this._i18n ?? defaultI18n`,
so the module-level singleton is only a fallback.

If you write a custom `RendererContract`, implement the optional `setI18n(registry)` hook or your
strings will not respond to `gf.i18n.use(locale)`.

**Correction.** This section used to say `@guideflow/react`'s `GuidePopover` still reads the
`defaultI18n` singleton. **It does not** — it reads `gf.i18n`, the instance registry, at
[GuidePopover.tsx:206](packages/react/src/components/GuidePopover.tsx#L206). AUDIT
`react-guidepopover-ignores-instance-i18n` is fixed; the warning outlived the fix here and in
`apps/docs/guide/i18n.md`, which still carries a `::: warning React GuidePopover` block that is now
wrong. `I18nRegistry` covers **twelve chrome strings only** — `Locale` is a closed interface and it
does not reach step content, which is the real gap (`EXPANSION-PLAN.md` §8.4).

---

## 6. Traps and gotchas (learned the hard way)

- **A tour ends when there is nothing left to render, never because `isFinal` is true.** That
  distinction is the whole of AUDIT `final-state-steps-never-rendered`: checking `isFinal` right after
  a transition ended tours before their final state's steps had been shown, so the README quick-start
  displayed 1 of its 2 steps. `next()`, `send()` and the `showIf` skip loop all test
  `machine.currentStep === null` now. Keep it that way.
- **`_saveProgress` writes `completed: false`, always.** It only runs while a tour is live. It used to
  write `machine.isFinal`, which — now that final states render their steps — marked every mid-flow
  save as complete and made tours un-resumable. Completion is recorded by clearing the snapshot in the
  `tour:complete` handler.
- **Windows is fine now.** Package scripts call `node ../../scripts/fsx.mjs rm|cp` instead of
  `rm -rf` / `cp -r`, so they behave identically in PowerShell, cmd.exe and bash. Do not reintroduce a
  shell builtin into a package script.
- **Playwright's default headless Chromium cannot load an extension, and says nothing about it.**
  `chromium.launchPersistentContext(dir, { headless: true })` uses the *headless shell*, which has
  no extension support: `context.serviceWorkers()` is `[]` and every assertion silently has
  nothing to assert against. `channel: 'chromium'` selects the full build and it works. Measured
  0 vs 1. `apps/e2e/tests-extension/fixtures.ts` pins it; do not "simplify" it away.
- **The extension project must stay serial.** Each of its tests launches a full Chromium with a
  fresh profile. Nine in parallel exhausted the machine and produced nine "Tearing down context
  exceeded the test timeout" failures that read exactly like nine product bugs.
- **A service worker cannot `chrome.runtime.sendMessage` to itself.** Chrome does not deliver a
  message back to the sender's own context, so a worker asking itself gets "Could not establish
  connection. Receiving end does not exist." Assert on `chrome.storage` instead — which is also
  why the recording buffer is written through to `chrome.storage.session`.
- **`window.__guideflow` is set only when the host opts in.** `createGuideFlow({ exposeGlobal: true })`
  assigns it (Phase 8.2); nothing else in `packages/*` does. Until that option existed the library
  never set it at all, and only `apps/demo` did — which is why the extension detected essentially no
  real application. Any "the extension doesn't detect my app" report is now a missing `exposeGlobal`.
  It must stay opt-in: `instance` extends the emitter, so a third-party script can
  `emit('tour:complete', …)` and permanently mark a tour completed in storage.
- **`tsup.config.ts` is an array of five configs, and NONE of them may set `clean: true`.** tsup
  runs them concurrently, so a clean races the subpath builds and deletes `.d.ts` files they have
  already written — with no build error at all. `dist/` is removed once, up front, by the `build`
  script. `scripts/verify-pack.mjs` is what catches this; do not skip it.
- **`string & object` does not work.** No string literal satisfies it, so a union meant to accept
  "any string while keeping autocomplete" rejects every custom value. Use
  `string & Record<never, never>` — `StepAction.action` and `GuideFlowTheme` both do.
- **Assignment bucketing must never be `hash % smallNumber`.** `ExperimentEngine` used
  `hash % totalWeight`, i.e. one bit of djb2 for a two-arm test: marginal splits looked perfect
  while two concurrent experiments agreed 100% or 0% of the time. It now hashes with FNV-1a plus a
  murmur3 avalanche and buckets over a fixed 10 000-slot space.
- **`targeting` and `route` and `sanitizeHTML` are all inert without their subpath.** Core carries
  the *types* so a flow stays serialisable, and reads none of them. A `targeting` block with no
  `createTargeting()` silently does nothing, and core cannot afford a dev-mode warning to say so.
- **`FlowMachine.restore` prefers `stepId` and rejects a miss.** It does not clamp to a neighbour: a
  step id that no longer exists means there is no honest coordinate to resume to. It also refuses a
  state with zero steps, which used to return `true` and leave an active tour with nothing painted.
- **Targeting guard order is load-bearing.** trigger, url, audience, schedule (all free) before
  completed, dismissed and every frequency check (all storage reads). Reordering makes a `selector`
  trigger issue a storage read per DOM mutation, and no test will catch it.
- **A throwing audience predicate means "not eligible", not a crash** — deliberately unlike
  `Step.showIf`. Targeting evaluates every registered flow; one bad rule must not take down the rest.
- **`route` goes on `StateNode`, never on `Step` and never as a transition.**
  `FlowMachine._defaultPath` walks `NEXT` only, so a `ROUTE` transition puts the target state off
  that path and silently reverts `flowStepIndex`/`flowTotalSteps` to per-state numbering — the bug
  ADR-008 paid 1.3 kB to fix, which put a **Done** button on step one of a two-state tour.
- **A wait is not a pause.** `isWaiting` is its own flag. Reusing `_paused` breaks three ways:
  `pause()` early-returns when already true (a host pausing mid-wait silently no-ops), `resume()`
  clears the internal wait and starts a *second* waiter, and the keyboard handler gates on it —
  killing Escape exactly when the user most wants out.
- **The spotlight drops while waiting, on purpose.** That also drops pointer capture, so the page
  stays clickable. A modal that blocks the navigation it is waiting for can never succeed.
- **`setWaiting()` must never delegate to `hideStep()`.** `hideStep()` restores focus to
  `_previouslyFocused`, nulls it, and removes the live region — that is the Phase 6 focus work being
  undone. Mark busy; do not unmount.
- **Anything imported into `src/navigation/` as a *value* is inlined into that bundle**
  (`splitting: false`). Use `import type` for everything from core; only a two-line local
  `isBrowser` is worth duplicating.
- **`tsup.config.ts` is an array of three configs.** Only the first may set `clean: true` — a second
  would wipe what the first just wrote. Every subpath is declared in both tsup and `package.json`
  `exports`, and `scripts/verify-pack.mjs` fails CI if the two drift.
- **`content.html` needs an opt-in import; `content.body` does not.** The sanitiser lives in
  `@guideflow/core/html` and is passed as `createGuideFlow({ sanitizeHTML })` (ADR-009). Without it
  the markup is escaped and rendered as text with a one-time warning — safe, visible, debuggable.
  It is passed explicitly rather than registered by a side-effect import on purpose: a bundler
  handing the subpath its own copy of a registry module would break it *silently*.
- **Backticks inside a CSS template literal terminate the string.** `injectStyles` payloads in
  `spotlight.ts`, `hotspot.ts`, `hint.ts` and `default-renderer.ts` are template literals, so a
  comment like `/* sets `pointer-events` */` produces a wall of TS1005s that point at the wrong
  line. Write those comments without backticks.
- **Every entry point that starts a render must bump `_renderGeneration` first.** `next`, `prev`,
  `goTo` and `send` do; a no-op navigation deliberately does not, because bumping there would
  cancel a render that is legitimately in flight.
- **A detached target is not a null target.** `spotlight._update()` branches on
  `!this._currentTarget?.isConnected`, because a removed element is still a non-null `Element` that
  returns a zero rect — and a 0×0 cutout keeps its `box-shadow: 0 0 0 9999px`, i.e. a black
  click-blocking screen.
- **`clickThrough` carves a `clip-path` hole; it does not drop pointer capture.** The overlay stays
  `pointer-events: all` and excludes the target's rect. Setting `pointer-events: none` on it — the
  old implementation — makes the entire page interactive and throws away the tour's modality.
- **`history.pushState` does not move `location.href` in happy-dom.** So `watchHistory`'s
  href-coalescing correctly swallows it and any unit assertion about pushState is testing the mock.
  Setting `location.hash` *does* move it and dispatches `hashchange` — that is the only real route
  change the unit environment can produce. Anything else about routing belongs in `apps/e2e`, where
  `fixtures/index.html` drives an actual ten-line pushState router.
- **`evaluateFlow` is pure and has no document, so it cannot check a `selector` trigger's selector.**
  It marks a flow eligible on `startTrigger === 'selector'` alone. That is why `install()`'s
  `check()` passes an `only` predicate into `autoStart` — without it, an element appearing for one
  flow started whichever selector flow had the higher priority, including one whose own element was
  nowhere on the page.
- **A `selector` trigger must fire once per flow per page load.** The MutationObserver does not
  disconnect after a start (other flows may still be pending), so without the `selectorFired` set
  the first DOM mutation after the user closes the tour restarts it — and so does the next one. Add
  to that set only when `autoStart` actually returns a flow: a `null` means "a tour was already
  running", and burning the flow there suppresses it for the whole page load.
- **`page.goto('/')` in a Playwright spec does not go where you think.** Playwright resolves it as
  `new URL(url, baseURL)`, and a leading slash discards `baseURL`'s path. This repo's `baseURL` is
  `http://127.0.0.1:4173/apps/e2e/fixtures/`, so `'/'` lands on the repo root. Use `'index.html'`.
  This single character kept the entire e2e suite at a 0% pass rate through two phases.
- **Counters are flow-wide, not per-state.** `totalSteps` / `currentStepIndex` walk the `NEXT`-only
  path from `initial` (`FlowMachine.flowTotalSteps` / `flowStepIndex`, cached and cycle-guarded).
  `machine.totalSteps` is still the *current state's* count — do not confuse them. The renderer
  derives "Back" / "Next" / "Done" from index vs total, so per-state numbers put a Done button on
  step one of a multi-state tour.
- **The Done button dispatches `next`, not `end`.** `end` maps to `stop()`, which emits
  `tour:abandon`. Only `next()` past the last step takes the completed path that emits
  `tour:complete` and clears the saved snapshot. If you add a "finish" affordance anywhere, wire it
  to `next`.
- **`prefers-reduced-motion` has a JS half.** The smooth scroll in `scrollTargetIntoView()` and the
  spotlight cutout transition are both assigned from script, so `motion.css` cannot reach them.
  Both call `prefersReducedMotion()` from `utils/ssr.ts`. Add an animation from script and you must
  call it too.
- **Most "RTL fixes" are bugs.** Flexbox and block layout already follow the inherited `direction`.
  `rtl.css` is deliberately almost empty; it used to carry three rules that undid the browser's own
  correct mirroring. Only add a `[dir="rtl"]` rule for something genuinely direction-blind — a
  physical `transform`, or a JS-assigned offset. In `computePosition`, `-start`/`-end` mirror and
  `left`/`right` deliberately do not.
- **`forced-color-adjust: none` inside a `forced-colors` block is backwards.** It opts the element
  *out* of the palette the user asked the OS for. It sat on `.gf-popover` for exactly that reason.
  Declare system colour keywords instead.
- **De-emphasis goes through `--gf-muted-opacity`, not a literal.** `#111827` at `opacity: 0.5` over
  white is 3.4:1 and fails WCAG AA; the token is 0.72 (6.6:1) and the high-contrast theme resets it
  to 1. Same for `--gf-accent-color`: any override must clear 4.5:1 against `--gf-accent-fg`.
- **`page.addInitScript` runs before `document.documentElement` exists.** `observe(null, …)` throws
  and kills the whole init script silently — leaving instrumentation that is *defined* but forever
  empty, which reads as "the feature does nothing" rather than "the probe is broken". Observe
  `document` instead; it always exists. Cost an hour in the announcement audit.
- **A backtick inside a JS template literal terminates it too**, not just inside CSS. Walked into
  three times in one session: `spotlight.ts`-style CSS, `packages/banner/src/widget/styles.ts`, and
  the `RECORDER` string in `a11y-announcements.spec.ts`. Write those comments without backticks.
- **`page.accessibility` was removed from Playwright.** Use `locator.ariaSnapshot()`, which returns
  the ARIA tree as YAML and works on all three engines. It is also the only tool here that shows
  what an AT actually derives — the survey's duplicate-value defect was invisible in the DOM.
- **An icon named `icon-128.png` is not necessarily 128×128.** All three extension icons were a
  few pixels narrow (15×16, 46×48, 122×128) from the day they were added, and nothing measured
  them until the Chrome Web Store pack needed an exact 128×128. `store-readiness.test.ts` now reads
  the PNG IHDR and asserts each one matches its manifest key.
- **`packages/devtools` makes no network calls, and `no-network.test.ts` is what keeps that true.**
  It is not a style rule: "nothing leaves your machine" is a sentence in a published privacy
  policy, so a `fetch` added later would make that policy false. If the extension ever genuinely
  needs the network, change `store/PRIVACY.md` and the store's data disclosure in the same commit.
- **Anything an MCP server writes to stdout is framed as a JSON-RPC message.** One `console.log`
  corrupts the stream and the client appears to hang with no error anywhere. `packages/mcp` writes
  its startup banner to stderr, and the smoke test asserts every stdout line parses as JSON — which
  is the only way to catch this, because `InMemoryTransport` never sees the process.
- **`turbo` filters the environment, so `os.tmpdir()` is unreliable inside a task.** On Windows it
  reads `TEMP` then `TMP`; with neither passed through it returns the literal string
  `undefined	emp` and `mkdtempSync` fails with ENOENT — inside turbo only, which reads as a flaky
  test. `turbo.json`'s `test` task now passes `TEMP`, `TMP` and `TMPDIR` through.
- **`eslint-import-resolver-typescript` cannot follow the MCP SDK's `exports` subpaths**, which
  node, `tsc` and the built binary all resolve. That is a resolver gap, not a code defect, and it is
  scoped to `packages/mcp/.eslintrc.json` rather than weakened repo-wide. Verify with
  `createRequire(...).resolve(...)` before assuming an unresolved-import error is real.
- **A survey must never be a tour step type.** Submitting one would emit `tour:complete`, so
  `@guideflow/analytics` would count every NPS response as a completed tour and the abandonment
  rate would move whenever a survey ran. `PRODUCT-ROADMAP.md` proposed exactly that; ADR-018
  corrected it. The same argument rules out any other "form as a step".
- **`createLiveRegion` and `setTourActive` exist in THREE packages, and `dock-drift.test.ts` is what
  keeps them one implementation.** It compares brace-matched, comment-stripped function bodies
  across checklist, banner and survey. Edit one and you must edit all three — that is the deal that
  bought not having a shared `@guideflow/dock` package. The files are deliberately not identical
  (only the checklist needs `restoreFocus`), so the check is per-function, never per-file.
- **Firefox makes every radio in an UNCHECKED group its own tab stop; Chromium makes only the
  first.** Both are correct. A test that tabs out of an untouched radio group therefore needs one
  press in one browser and eleven in the other — check a radio first, or assert backwards.
- **Headless Firefox cannot test a forward Tab OUT of the last element in the document.** There is
  no browser chrome for focus to move into, so it stays put — measured as a trail ending
  `dismiss, dismiss, dismiss`. Assert `Shift+Tab` instead: the page before the surface is real in
  every browser.
- **`injectStyles` de-dupes by id, so `removeStyles` on teardown is a footgun.** A second mount of
  the same widget injects nothing; an unconditional `removeStyles(id)` in the first `destroy()` then
  strips the stylesheet from every survivor, silently. `@guideflow/checklist` shipped that bug and
  its own test mounted twice without checking. Both docked-surface packages now refcount mounts.
- **A backtick inside a CSS template literal terminates the string, and the error points elsewhere.**
  Documented since Phase 6, and still walked into while writing `packages/banner/src/widget/styles.ts`
  — whose own header warns about it. esbuild reported `Expected ";" but found "container"` twenty
  lines away from the backtick.
- **`apps/e2e/fixtures/index.html` loads `dist` as raw ES modules, so every bare specifier needs an
  import-map entry — INCLUDING subpaths.** A map entry for `@guideflow/core` does not cover
  `@guideflow/core/targeting`. The failure is a hard module-resolution error at load, before any
  assertion runs.
- **A `position: fixed` docked bar covers the page.** `dock: 'top'` in `@guideflow/banner` is
  `position: sticky` precisely so it reserves its own height and pushes content down instead. The
  alternative — publishing a measured height as a custom property — means writing to an element the
  library does not own. An e2e spec that could not click a covered button is what found this.
- **`ProgressStore.setRecord` suffixes `completed` and `caps` are taken.** `setRecord(userId,
  'completed', …)` overwrites core's completed-flows array byte for byte — `getRecord` and
  `getCompletedFlows` read the identical `{ value, expiresAt }` wrapper — and `@guideflow/ai` reads
  that key too. `caps` is targeting's, `checklist` is `@guideflow/checklist`'s. Use a fresh
  single-segment suffix.
- **A new `@guideflow/*` package must be scaffolded at the group's current version, never
  `1.0.0`.** The changesets `fixed` group is a glob, so it joins automatically, and
  `matchFixedConstraint` forces the group's highest version onto every member — `npm init`'s
  default would major all nine packages, and then major them again as every `>=0.1.9 <1.0.0` peer
  falls out of range. `scripts/verify-pack.mjs` now fails CI when the group's versions diverge.
- **`turbo`'s `^build` does not cover a package's own build.** `lint` and `type-check` run
  type-aware rules, which resolve imports through emitted `.d.ts`. `packages/core` has no workspace
  dependencies, so `^build` was empty for it — and its own `build` starts with `fsx rm dist`. The
  result was an *intermittent* `no-unsafe-member-access` on an "error typed value", in whichever file
  happened to be reading `dist` when it vanished (core's fixture-guard test imports
  `apps/e2e/fixtures/flows.d.ts`, which imports `@guideflow/core` by package name). Both tasks now
  declare `["^build", "build"]`. Reproduced 1-in-3 before, 0-in-3 after.
- **Two of core's subpaths are DIRECTORIES.** `targeting` and `navigation` are `src/<name>/index.ts`;
  `selector`, `authoring`, `html` and `versioning` are flat `src/<name>.ts`. `apps/demo`'s generic
  alias mapped every subpath to `src/$1.ts`, which was fine until a package importing
  `@guideflow/core/targeting` was added to the demo. Anchored entries for the two directories come
  first.
- **A bare string alias in Vite is a PREFIX match.** `apps/demo/vite.config.ts` aliased
  `'@guideflow/core'` to `…/src/index.ts`, so the first `@guideflow/core/selector` import in the tree
  resolved to `…/src/index.ts/selector` and the build died. Subpath-aware aliases must come first,
  as regex entries, with the exact-match entry after.
- **There is exactly one selector builder now: `@guideflow/core/selector`.** There used to be three,
  and all three were broken the same two ways — they trusted framework-generated ids, and none of
  them ever re-queried to check what they had built. Measured in real Chromium, the devtools copy
  pointed at the *wrong element* for two ordinary page shapes. If you need a selector anywhere, import
  it; do not write a fourth.
- **Completion is stored as `flowId@version`, and `getCompletedFlows` strips it.** The suffix must
  never leak out of `ProgressStore`: `@guideflow/checklist` projects that array by matching an
  item's `flowId`, and `@guideflow/ai` reads the same key — both would silently stop matching. A
  record written without a version suppresses *every* version, deliberately: there is no way to
  know which revision it meant.
- **`start()` checks `isCompleted` BEFORE the snapshot version gate** (`index.ts:390` vs `:399`).
  That ordering is why a version-blind completion record made republishing unreachable, and why the
  fix had to go in the completion record rather than in the gate.
- **A server that serves flows must never rewrite `flow.version`.** A CMS's instinct is a monotonic
  revision per publish; doing that discards every user's resume point on every copy edit.
  `flowFingerprint` ignores content precisely so a typo fix interrupts nobody.
- **Two documentation sites exist.** `.github/workflows/docs.yml` publishes
  `apps/docs/.vitepress/dist` to GitHub Pages. The root `docs/*.html` files are stale leftovers that
  nothing builds — yet `docs.yml` still *triggers* on `docs/**`. Edit `apps/docs/`, never `docs/`.
- **`repo.config.json` is the only source of identity truth.** Owner, author, and URLs are
  propagated by `scripts/sync-repo-meta.mjs`, which now also rewrites the `@author` / `@github` /
  copyright lines in `packages/*/src/**` and the `LICENSE` copyright holder. Never hand-edit those
  strings: change `repo.config.json` and run `pnpm sync-repo`. The script is idempotent — a second
  run must report `0 file(s) updated`. Headers carry no `@email`; the security contact is GitHub
  Security Advisories (see `SECURITY.md`).
- **Turbo is v1.** `turbo.json` uses the `pipeline` key. Do not rename it to `tasks` without also
  upgrading the `turbo` devDependency.
- **`--passWithNoTests` hides emptiness.** Adding it to a package makes a missing test suite look
  green. It has been removed from every package — do not put it back, and do not add it to new ones.
- **Never put a `workspace:` range in `peerDependencies`.** Whether it gets rewritten at publish time
  depends on which publisher runs; if it survives, every consumer install fails on an unresolvable
  peer. `scripts/verify-pack.mjs` now fails CI on this — it caught `@guideflow/analytics` doing it.
- **Vue composables clean up with `onScopeDispose`, not `onUnmounted`.** `onUnmounted` needs a
  component instance, so a composable called from a bare `effectScope()` (a Pinia store, a shared
  composable) registers no teardown at all and leaks every listener. `onScopeDispose` covers the
  component case too, because `setup()` runs inside its own effect scope.
- **The engine attaches exactly ONE listener** — `document.addEventListener('keydown', …)` at
  [tour.ts:655](packages/core/src/engine/tour.ts#L655) — and nothing on the target. The spotlight's
  only others are a backdrop-dismiss click and scroll/resize. That is why ADR-004's 1.3 kB
  `clip-path` hole was half a feature for five phases: the user acted, the app responded, and the
  step waited for **Next**. `advanceOn` on `@guideflow/core/navigation` is the other half (ADR-020),
  and it is a *helper* — the declarative `Step.advanceOn` a `.flow.json` could carry is still
  unbuilt, because that is core bytes.
  **Forgetting `clickThrough` on an `advanceOn` step does not no-op — it DISMISSES the tour.**
  `dismissOnBackdropClick` defaults true, so the click lands on the overlay and calls `skip()`; the
  user's first attempt to follow the instruction destroys the tour. The helper warns once.
  **A `clickThrough` step cuts the same hole in the TAB ORDER that it cuts in the overlay** — the
  trap widens to *popover ∪ target* and `aria-modal` is dropped, because on those steps the page
  provably is not inert (ADR-024). Exactly one element; everything else stays trapped. The widened
  scope is **discontiguous**, so Tab is driven explicitly there — wrapping only at the ends lets
  native Tab walk from the last popover control into the page, which is what the first version did.
  Still true: `Enter` synthesises a click on a native `<button>`/`<a href>` and NOT on a
  `<div role="button" tabindex="0">`, so those steps need an app-dispatched `CustomEvent`.
- **The renderer moves focus only when focus belongs to it, and restores only when it had it.**
  `renderStep` used to focus the popover's first control on EVERY render, so advancing while the
  user typed sent their next space keystroke to the header close button and ended the tour; and
  `hideStep` used to restore unconditionally, so a tour ending because the user acted ripped focus
  out of whatever the app had just opened. Both guards read `document.activeElement` **before** the
  DOM changes — replacing `innerHTML`, or removing the popover, resets it to `body` and destroys the
  distinction. `body` deliberately counts as "the tour had it". ADR-025.
- **`repaint()` is for "the content changed"; `rerender()` is for "the DOM changed".** `rerender()`
  re-emits `step:enter`, which `@guideflow/analytics` counts as a step view — so using it for a
  locale switch or a `configure({ context })` inflates that step's `reached` in `computeFunnel`.
  `repaint()` emits nothing. It deliberately does NOT bump `_renderGeneration` (that would cancel a
  render legitimately in flight) and defers to one instead, and its `catch` does NOT end the tour,
  because a bad translation must not destroy a running one. ADR-026.
- **`hideStep(reason?)` is called on pause and on every ending, so an announcement there needs the
  reason.** Only `'complete'` is passed. The live region is kept alive ~1 s afterwards, because
  `_announce` writes on the next frame and removing it in the same tick — which is what used to
  happen — dropped the utterance into a detached node. `_liveRegionEl` stays set while that removal
  is pending, or a tour restarting inside the window builds a SECOND region and the stale one keeps
  saying "Tour complete" under the new step.
- **The content pipeline is `content → locale catalogue → {{token}} → renderer`, in that order,
  in `_resolveContent`.** The order is the whole reason 8.3 and 8.4 shipped together: a *translated*
  string containing `{{firstName}}` only resolves if the catalogue is applied first. It lives in the
  engine, not `DefaultRenderer`, because core never assumes the default renderer.
  **`content.html` is deliberately NOT interpolated** — "interpolate then sanitise" is safe for
  element content and not for attribute context (`<a href="/r?next={{to}}">` with a quote in the
  value closes the attribute before the sanitiser parses anything), and `sanitizeHTML` being opt-in
  would make the exposed configuration the one a developer chose believing it was hardened. The
  catalogue MAY set `html`: the rule is about where the data came from, not which field it is in.
  See ADR-022.
- **Do NOT assert escaping through `innerHTML` in happy-dom.** MEASURED: it parses `&lt;img&gt;`
  into a text node correctly and then hands `innerHTML` back with the entities **decoded**, so a
  string check there tests happy-dom's serialiser and reads as a vulnerability that is not present.
  Assert `querySelector` and `textContent`; `apps/e2e` is where serialisation is real.
- **`step:exit` is NOT emitted on every terminal path, so "subscribe to it, it covers every ending"
  is false.** `send()` moves the machine *before* calling `_emitStepExit()`, which reads the
  machine's *current* step — for an ordinary `done: { final: true }` state carrying no steps that is
  `null`, so the emit is skipped while `_stepExitEmitted` is still set to true. `_doEnd(true)` then
  early-returns on that flag and only `tour:complete` fires.
  `next()` is safe (it exits *before* moving); `send()`, `prev()` and `goTo()` are not. Anything
  releasing a resource on `step:exit` must also take `tour:complete` and `tour:abandon` —
  `advanceOn` does, and `advance-on.test.ts` pins it by counting the listener rather than the
  behaviour, because a leaked listener still bails on `!isActive` and looks fine.
  Related: on those same three methods `step:exit`'s `stepId` names the step being **entered**.
- **A deep link must never get past a gate by DELETING the record behind it.** `start()` refuses a
  completed or dismissed flow silently, so `?gf_tour=` has to step over both — but
  `progress.clearCompleted()` would also un-tick `@guideflow/checklist`, which projects
  `getCompletedFlows()`, and perturb `@guideflow/ai`, which reads the same key. A URL destroying
  progress the user earned, unrecoverably (there is no public read of the raw `flowId@version`
  entries) is a much worse bug than the one being fixed. `start(flow, ctx, { force: true })` skips
  the gates and writes nothing. Same rule anywhere else: prefer a read-time override to a write.
- **A link overrides *delivery* policy, never *eligibility* policy.** `frequency` and `urlPattern`
  describe how often and where we would have **pushed** a tour, and a human sent the link. `audience`
  and `schedule` describe who it is **for** — `{ where: { plan: 'enterprise' } }` means "not this
  user", and a URL does not overrule it. See ADR-021.
- **`history.replaceState` does not move `location.href` in happy-dom either**, not just
  `pushState` — measured. Assigning `window.location.href` does. So anything that *writes* the
  address bar can only be asserted on the call in a unit test; `apps/e2e` is where the URL is real.
- **`@guideflow/cli` no longer imports `vite` or `ora`.** `studio.ts` imported `vite` at module
  scope, so every spec that re-imported the entry point paid for it; `push.ts` pulled in `ora`. Both
  commands are deleted (7.9a, 7.10) and so are the dependencies. The CLI is `init`, `export`,
  `validate` — three commands, none of which touches the network.

---

## 7. Working agreements for Claude

1. **Verify, don't assume.** This repo's tests pass while real features are broken. Before reporting
   a fix as done, run the relevant command and paste real output. `/verify` exists for this.
2. **Respect the size budget.** Any change to `core` must keep `pnpm --filter @guideflow/core size`
   under 12 kB gzip. If a fix needs more, say so explicitly rather than silently raising the limit.
3. **One concern per changeset.** Run `pnpm changeset` for every user-visible change to a published
   package. Releases are automated from changesets; a change without one ships silently.
4. **Add a test with every bug fix.** The audit findings each name the missing test. Fixing a bug
   without pinning it is how it came back the first time.
5. **Do not add features to `docs/*.html`.** Do not add a runtime dep to `core`. Do not weaken a
   tsconfig or ESLint rule to make an error go away — fix the code.
6. **When a documented feature does not exist,** either implement it or correct the docs in the same
   change. Leaving the claim standing is worse than either.
7. **Prefer fixing the audit queue in order.** `.claude/docs/REMEDIATION-PLAN.md` is sequenced so
   that earlier phases unblock later ones (e.g. the e2e harness must work before a11y fixes can be
   verified).

---

## 8. Release process

```bash
pnpm changeset            # describe the change, pick affected packages + bump type
pnpm version-packages     # apply bumps, write CHANGELOGs
pnpm publish-packages     # build then `changeset publish`
```

CI (`.github/workflows/release.yml`) runs this automatically on `master` via
`changesets/action@v1`. `docs`, `e2e`, `storybook` and `@guideflow/demo` are in the changesets
`ignore` list, so they are never versioned or published.

### Every package shares one version

`fixed: [["@guideflow/*", "!@guideflow/demo", "!@guideflow/storybook"]]` puts all nine real
packages — `core`, `react`, `vue`, `svelte`, `ai`, `analytics`, `checklist`, `cli`, `devtools` — in
one fixed group. They
always carry the same version number, and the group takes the largest bump any member was given.
**A changeset against a single package releases all nine.** That is the intended trade-off: a
matched set is easier to reason about than eight independently drifting versions, and it removes
the question of which `core` a given `react` was built against.

`@guideflow/demo` is excluded because it is a private example app sitting on its own `0.1.0`;
adding it would drag it into the shared version for no benefit. Note the group is a glob, so a new
`@guideflow/*` package joins automatically — that is deliberate.

This also keeps the peer ranges honest. Every package declares `@guideflow/core` as a peer at
`>=0.1.9 <1.0.0`, and fixed versioning means the matching core is always released alongside.
**Do not "tighten" those peers to `workspace:^`.** A caret publishes as `^0.2.0`, which the next
minor falls outside of; Changesets majors a peer dependent whose range goes out of range, and a
fixed group takes the largest bump — so one caret would take all nine packages to `1.0.0`.

`@guideflow/devtools` is deliberately **not** in that list. `private: true` already stops
`changeset publish` from pushing it to npm, but it does *not* stop versioning — `privatePackages.version`
defaults to `true`, so `ignore` is the only thing that would freeze the version. The extension needs
its version bumped, because `packages/devtools/package.json` is the single source of truth for it:
the Vite build injects that value into `dist/manifest.json` and into the panel and popup UIs via
`__GF_VERSION__`. Un-ignored, it gets a version bump and a CHANGELOG entry but is neither published
(`private: true`) nor git-tagged (`privatePackages.tag` defaults to `false`).
