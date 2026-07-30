# Testing strategy

## 1. Where we actually are

Measured 2026-07-30. **197 unit tests pass.** That number is real, and it is also misleading.

| Package | Test script | Test files | Tests | Reality |
|---|---|---|---|---|
| `core` | `vitest run` | 15 | **114** | Genuinely covered. The strongest package. |
| `ai` | `vitest run --passWithNoTests` | 3 | 37 | `brain`, `dom-context`, `validation` covered. **No provider has a test.** |
| `analytics` | `vitest run --passWithNoTests` | 3 | 32 | `collector`, `experiments`, `webhook` covered. **Four of five transports untested.** |
| `react` | `vitest run --passWithNoTests` | 1 | 14 | Hooks and provider only. `GuidePopover`, `ConversationalPanel`, `HotspotBeacon`, `TourStep` untested. |
| `vue` | `vitest run --passWithNoTests` | **0** | **0** | Declares `@vue/test-utils`, ships no tests. Reports green. |
| `svelte` | **none** | 0 | 0 | No test script at all — `turbo run test` silently skips it. |
| `cli` | **none** | 0 | 0 | Same. Four commands, zero coverage. |
| `devtools` | **none** | 0 | 0 | ~2 400 lines of extension code, zero coverage. |
| `e2e` | `playwright test` | 3 | — | **Has never run.** Not in CI, and broken three ways (below). |
| `storybook` | `test-storybook` | 1 story | — | Not in CI. |

### Untested source modules

`core`: `engine/tour.ts` is covered indirectly but has no test for the render-generation race, pause/
resume, or the `tour:error` path. `persistence/drivers.ts` (IndexedDB path), `utils/emitter.ts`
removal semantics, `tokens/index.ts` beyond smoke.
`ai`: all four providers, `index.ts::createAI`.
`analytics`: `transports/{posthog,mixpanel,amplitude,segment}.ts`.
`react`: all four components.
`vue`, `svelte`, `cli`, `devtools`: everything.

### Why the e2e suite has never run

Three independent breakages, all in `apps/e2e`:

1. **It points at the wrong server.** `playwright.config.ts` sets
   `baseURL: 'http://localhost:6006'` and boots Storybook, then every test does `page.goto('/')` and
   looks for `#start-btn`, `#step-one`, `.gf-popover`. Storybook's index has none of those. The
   intended target is `fixtures/index.html`, which nothing serves. (A comment in `tour-flow.spec.ts`
   says port 5173, contradicting the config.)
2. **The fixture defines an invalid flow.** `fixtures/index.html` calls
   `gf.start({ id, steps: [...] })` with top-level `title`/`body` on each step. A `FlowDefinition`
   requires `initial` + `states`, and step text lives in `content: { title, body }`. Even if served,
   no tour would start.
3. **The a11y test imports an API that does not exist.** `accessibility.spec.ts` does
   `import AxeBuilder from 'axe-playwright'` and then `new AxeBuilder({ page })`. `axe-playwright`
   exports `injectAxe` / `checkA11y` / `getViolations` — the `AxeBuilder` class belongs to
   **`@axe-core/playwright`**, which is not installed.

And it is not in `.github/workflows/ci.yml` at all, so none of this ever surfaced.

---

## 2. Target

```
                 ▲  few, slow, high confidence
     E2E         │  Playwright — real browser, real geometry, real focus
   (~25 specs)   │  spotlight position · popover flip · focus trap · keyboard · persistence · a11y
                 │
   Component     │  Storybook + @storybook/test — adapter components in isolation
   (~20 stories) │  React/Vue/Svelte parity · themes · RTL · reduced motion
                 │
     Unit        │  Vitest + happy-dom — logic, contracts, error paths
   (400+ tests)  │  FSM · persistence · sanitizer · position maths · providers · transports
                 ▼  many, fast, cheap
```

**Coverage gates** (none configured today — add per package in `vitest.config.ts`):

| Package | Statements | Rationale |
|---|---|---|
| `core` | 90 % | everything depends on it |
| `ai`, `analytics` | 80 % | network-facing, lots of fallback branches |
| `react`, `vue`, `svelte` | 75 % | thin wrappers, but lifecycle bugs are expensive |
| `cli` | 60 % | I/O-heavy; test the pure parts and the argument parsing |

---

## 3. What to test, by risk

Ordered by (likelihood of breaking × cost when it breaks). This is the backlog.

### Highest risk — untested today

1. **HTML sanitiser.** Every known bypass class becomes a test case, and each stays as a regression
   test after the sanitiser is rewritten: unquoted `src=javascript:`, unclosed `<iframe>`, entity-
   encoded schemes, `srcdoc`, SVG/MathML vectors, `on*` handler variants. Also: every value
   interpolated into the popover template is escaped — assert on `step.actions[].action`.
2. **FSM edge cases.** `prevStep()` at index 0 of a non-initial state; `goToStepById` across states;
   `restore()` into a state with fewer steps than the saved index; guard rejection on `send()`;
   `onEntry`/`onExit` firing exactly once per transition; a flow with no `final` state.
3. **Resume path.** Save a snapshot mid-flow, restart, assert the *rendered* step matches the restored
   position — the currently-suspected bug is that step 0 renders first.
4. **Render-generation race.** Fire `next()` twice while an async `content` promise is pending; assert
   only the last step renders and `step:enter` fires once.
5. **Persistence.** TTL expiry on read; corrupted JSON in storage; `localStorage` quota exceeded;
   IndexedDB upgrade and error events; `keys()`-less driver falling back in `resetUser`.
6. **AI providers.** Mock the SDK. Assert: markdown-fenced JSON is handled, malformed JSON falls back
   without throwing, an oversized DOM is truncated, an abort signal actually cancels, an API error
   surfaces as an `error` event and not an unhandled rejection.
7. **Analytics transports.** Assert each one either delivers or *reports* that it cannot — the
   window-global sniffing pattern currently no-ops silently. Assert `flow_id` is present on step-level
   events.
8. **Adapter lifecycle.** React: provider destroys the instance it created, survives StrictMode double
   mount, no listener leak across remounts. Vue: `onScopeDispose` cleanup. Svelte: unsubscribe.

### Should exist but lower risk

Popover placement maths for all 13 placements plus clamping; i18n interpolation with repeated tokens;
`intro-compat` attribute parsing and the `show-if` path validator; `ExperimentEngine` bucket
distribution over 10 000 synthetic ids; emitter removal during emit.

---

## 4. Rebuilding the e2e harness

This unblocks everything visual, including a11y verification. Do it early.

1. **Serve the fixture.** Replace the Storybook `webServer` with a static server over
   `apps/e2e/fixtures`, or point `baseURL` at the demo app (`pnpm demo`, port 5173) and add stable
   test ids there. A dedicated fixture is preferable — the demo changes for product reasons.
2. **Fix the fixture flow** to a valid `FlowDefinition`, and import `@guideflow/core` from the built
   `dist` rather than a hand-written `/node_modules/...` path.
3. **Swap the a11y dependency** to `@axe-core/playwright` (which provides `AxeBuilder`), or rewrite
   the tests against `axe-playwright`'s actual `injectAxe`/`checkA11y` API. Pick one; do not keep both.
4. **Add the missing coverage**: focus trap and restore, keyboard navigation including the
   "arrow keys must not hijack an input" case, spotlight tracking through scroll, popover flip at a
   viewport edge, persistence across reload, cross-tab sync, RTL, reduced motion, mobile viewport.
5. **Wire it into CI** as a separate job so it can be non-blocking at first, then required once green.

Verify each new test actually *fails* against the unfixed code before you trust it.

---

## 5. CI gaps to close

`.github/workflows/ci.yml` runs build, type-check, lint and unit tests on Node 22 only.

- [ ] Node matrix 18 / 20 / 22 — `engines` claims `>=18`; nothing tests it
- [ ] e2e job (Playwright, with browser caching)
- [ ] size-limit gate — `pnpm --filter @guideflow/core size`
- [ ] coverage upload + per-package thresholds
- [ ] `npm pack --dry-run` artifact check per publishable package
- [ ] changeset-presence check on PRs
- [ ] dependency review / `npm audit`
- [ ] Storybook build (it is built for size checks today but never verified)

---

## 6. Conventions

- Tests live in `packages/<pkg>/src/__tests__/`, named `<module>.test.ts`.
- Environment is `happy-dom` (see each `vitest.config.ts`). It has real gaps — no layout engine, so
  `getBoundingClientRect()` returns zeros. Geometry belongs in e2e, not unit tests. Stub rects
  explicitly when a unit test needs them.
- Test behaviour through the public API, not private fields. If a test needs `_privateThing`, the
  public surface is probably wrong.
- Assert on **events**, not just return values — the event contract is what `analytics` and the
  devtools extension depend on.
- Every bug fix ships with a test that fails without the fix. State that in the PR.
- Do not add `--passWithNoTests` to a package. It converts "no tests" into "green".
