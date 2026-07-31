# CLAUDE.md — GuideFlow.js

Operating manual for Claude Code in this repository. Read this before touching anything.

> **Companion documents** live in [`.claude/docs/`](.claude/docs/). Start with
> [`AUDIT.md`](.claude/docs/AUDIT.md) (what is broken) and
> [`REMEDIATION-PLAN.md`](.claude/docs/REMEDIATION-PLAN.md) (the ordered work queue).
> [`.claude/README.md`](.claude/README.md) indexes everything.

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
  react/        @guideflow/react      TourProvider, useTour, useTourStep, useHotspot, GuidePopover, ConversationalPanel
  vue/          @guideflow/vue        GuideFlowPlugin + useTour composable (no components)
  svelte/       @guideflow/svelte     createTourStore (no components)
  ai/           @guideflow/ai         GuideBrain + OpenAI / Anthropic / Ollama / Mock providers
  analytics/    @guideflow/analytics  AnalyticsCollector, 5 transports, ExperimentEngine
  cli/          @guideflow/cli        init / studio / export / push
  devtools/     @guideflow/devtools   MV3 browser extension (private: not published)
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
zero-dependency, 13 kB-gzip budget is a headline promise and is enforced by `size-limit`.

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
| Demo app | `pnpm demo` |
| Docs site | `pnpm docs:dev` |
| Storybook | `pnpm storybook` |

**Full local verification before claiming done** — use the `/verify` command, or:

```bash
pnpm turbo run build type-check lint test --filter=!@guideflow/storybook --filter=!docs --filter=!e2e
```

### Known-good baseline (after Phases 0–3, 2026-07-31)

Build, type-check, lint and unit tests are **all green**: **443 unit tests pass**, 6 skipped
(core 201, ai 90, analytics 78, cli 30, vue 18, react 14, svelte 12). `@guideflow/core` measures
**12.62 kB gzip against a 13 kB limit**. If any of these regress, you broke it — do not paper
over it.

Every package now has a real `test` script; `--passWithNoTests` has been removed everywhere, so a
package with no tests fails rather than reporting green. Six packages carry coverage thresholds,
set as **ratchets** just below measured coverage — raise them as coverage improves, never lower
them to make a build pass. The one remaining hole is `@guideflow/devtools`, which still has no
tests (needs an extension harness; tracked in Phase 5.3).

Six skipped tests remain, each tagged with the audit finding that un-skips it. The eleven that
encoded the sanitiser bypasses are now ACTIVE and passing — see ADR-007.

**The Playwright e2e suite has been rebuilt and wired into CI, but has not yet been executed** —
browsers could not launch in the environment it was written in. Run
`pnpm --filter e2e test:e2e` on a machine with browsers before trusting that job. See
`.claude/docs/REMEDIATION-PLAN.md` 2.1 for exactly what was and was not verified.

**The Phase 3 devtools hardening has also not been exercised in a browser** — the nonce handshake,
the relay allowlist and `optional_host_permissions` were reasoned about by reading. A mismatch would
present as *silence*, not an error. Run `/gf-extension-dev` before trusting the extension.

> The size budget has been raised twice: 12 kB to 12.5 kB in Phase 1 (seven correctness fixes),
> and 12.5 kB to 13 kB in Phase 3 (the parse-and-allowlist sanitiser — see ADR-007). ~380 B of
> headroom remains. **Do not raise it a third time** without first moving `content.html` support
> out of the default bundle into an opt-in subpath export.

---

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
2. Prototype members **not** shadowed (`pause`, `resume`, `skip`, `isActive`, `currentStepId`,
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
when the state's steps are exhausted it follows the transition table. A flow with **no `final: true`
state never completes**. Flat `{ id, steps: [...] }` objects are **not** valid flows — that shape
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
strings will not respond to `gf.i18n.use(locale)`. Note that `@guideflow/react`'s `GuidePopover`
still reads the `defaultI18n` singleton directly — that is AUDIT
`react-guidepopover-ignores-instance-i18n`, scheduled for Phase 5.

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
- **`window.__guideflow` is never set by the library.** The devtools extension detects tours through
  that global, but only `apps/demo/src/main.tsx` assigns it. Any "the extension doesn't detect my
  app" report is this.
- **Two documentation sites exist.** `.github/workflows/docs.yml` publishes
  `apps/docs/.vitepress/dist` to GitHub Pages. The root `docs/*.html` files are stale leftovers that
  nothing builds — yet `docs.yml` still *triggers* on `docs/**`. Edit `apps/docs/`, never `docs/`.
- **Identity strings are inconsistent.** Source-file headers in `core`, `react`, `vue`, `svelte`,
  `ai` claim `github.com/johnmugabe` and a `@263tickets.co.zw` email; `repo.config.json` and the
  manifests say `RealNerdZW`. `scripts/sync-repo-meta.mjs` does not rewrite source headers.
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
- **Importing `packages/cli/src/index.ts` pulls in `vite`,** because `studio.ts` imports it at module
  scope. In tests, `vi.mock('vite', …)` — without it, a spec that re-imports the entry point with a
  reset module registry takes seconds per test.

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

`fixed: [["@guideflow/*", "!@guideflow/demo"]]` puts all eight real packages —
`core`, `react`, `vue`, `svelte`, `ai`, `analytics`, `cli`, `devtools` — in one fixed group. They
always carry the same version number, and the group takes the largest bump any member was given.
**A changeset against a single package releases all eight.** That is the intended trade-off: a
matched set is easier to reason about than eight independently drifting versions, and it removes
the question of which `core` a given `react` was built against.

`@guideflow/demo` is excluded because it is a private example app sitting on its own `0.1.0`;
adding it would drag it into the shared version for no benefit. Note the group is a glob, so a new
`@guideflow/*` package joins automatically — that is deliberate.

This also keeps the peer ranges honest. Every package declares `@guideflow/core` as a peer at
`>=0.1.9 <1.0.0`, and fixed versioning means the matching core is always released alongside.
**Do not "tighten" those peers to `workspace:^`.** A caret publishes as `^0.2.0`, which the next
minor falls outside of; Changesets majors a peer dependent whose range goes out of range, and a
fixed group takes the largest bump — so one caret would take all eight packages to `1.0.0`.

`@guideflow/devtools` is deliberately **not** in that list. `private: true` already stops
`changeset publish` from pushing it to npm, but it does *not* stop versioning — `privatePackages.version`
defaults to `true`, so `ignore` is the only thing that would freeze the version. The extension needs
its version bumped, because `packages/devtools/package.json` is the single source of truth for it:
the Vite build injects that value into `dist/manifest.json` and into the panel and popup UIs via
`__GF_VERSION__`. Un-ignored, it gets a version bump and a CHANGELOG entry but is neither published
(`private: true`) nor git-tagged (`privatePackages.tag` defaults to `false`).
