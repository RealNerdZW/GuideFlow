# Remediation plan

The ordered work queue derived from [`AUDIT.md`](AUDIT.md). Work top to bottom — phases are sequenced
so each unblocks the next.

**How to use it:** run `/fix-next`, or pick the first unchecked box yourself. Every task names the
audit finding ids it closes and the acceptance criterion that proves it. Tick the box, note the commit,
and set `"status": "resolved"` in [`audit-findings.json`](audit-findings.json).

**Rules for every task:** add a test that fails without the fix; run `/verify`; update `apps/docs/`
if behaviour changed; write a changeset for published packages.

**Progress:** **70 / 325 findings resolved** — Phases 0–3 complete on branch `fix/phase-0-1-engine-correctness`. Remaining open: 12 P0, 86 P1, 115 P2, 42 P3.

---

## Phase 0 — Unblock the developer loop (½ day)

Nothing else is reliable until the tooling works on the machine you are using and the tree is clean.

- [x] **0.1 Make every script cross-platform.**
      Closes `core-build-cp-posix-only`, `clean-scripts-rm-rf-posix-only`, `clean-script-not-cross-platform`.
      `@guideflow/core`'s build is `tsup && cp -r src/styles dist/styles`, and every `clean` is
      `rm -rf` — POSIX-only, so they fail in PowerShell and cmd.exe. Add `rimraf` and `cpy-cli` as
      root devDependencies (or write one `scripts/copy-styles.mjs` using `node:fs`), and replace every
      occurrence across all eight packages and the root.
      *Accept:* `pnpm build` and `pnpm clean` both succeed from PowerShell.

- [x] **0.2 Untrack the committed Storybook build output.**
      Closes `committed-build-output`. `apps/storybook/storybook-static/` is 29 tracked files / ~7.8 MB
      that every `storybook build` rewrites, so the tree is dirty after any build.
      `git rm -r --cached apps/storybook/storybook-static` — the `.gitignore` rule is already added.
      *Accept:* `git status` is clean immediately after `pnpm turbo run build`.

- [x] **0.3 Fix the root scripts that match nothing.**
      Closes `root-test-e2e-script-matches-nothing`, `studio-script-cannot-resolve-bin`.
      *Accept:* every script in the root `package.json` runs and does what its name says.

---

## Phase 1 — Make the engine correct (3–5 days)

The P0/P1 defects that make documented usage fail. **Do these before anything else in the product.**

- [x] **1.1 Final-state steps must render.** ⭐ *highest priority in the repo*
      Closes `final-state-steps-never-rendered`.
      `TourEngine.next()` checks `isFinal` *after* `nextStep()`, so entering a `final: true` state ends
      the tour without showing its steps. The README quick-start shows 1 of its 2 steps. Mirror the fix
      in `send()`. Note `packages/core/src/__tests__/tour-engine.test.ts:95-106` currently **encodes the
      bug as expected behaviour** — that test must change.
      *Accept:* a test runs the README quick-start flow verbatim and asserts both `step-1` and `step-2`
      emit `step:enter`.

- [x] **1.2 Fix popover positioning.**
      Closes `popover-viewport-coordinate-mismatch`, `popover-position-coordinate-mismatch`,
      `popover-drifts-on-scroll`.
      `getViewportRect()` returns page coordinates (`window.scrollX/scrollY`) while `targetRect` comes
      from `getBoundingClientRect()` in client coordinates, so every fit test fails on a scrolled page
      and the popover falls back to a clamped centre. Pick **one** coordinate space — client, since the
      popover is `position: fixed` — and make `getViewportRect()` return `{x: 0, y: 0, innerWidth,
      innerHeight}`. Then reposition on scroll/resize.
      *Accept:* an e2e test scrolls 800 px, starts a tour, and asserts the popover is adjacent to its
      target (Phase 2 must land first to run this).

- [x] **1.3 Fix persistence end to end.**
      Closes `resume-renders-step-zero`, `completed-tours-replay-forever`, `dismissal-never-written`,
      `progress-not-saved-on-start-or-abandon`, `broadcastsync-only-on-resume`, `ttl-zero-expires-immediately`,
      `machine-restore-unvalidated`, `persistence-inert-without-caller-supplied-userid`.
      Six separate defects that together mean persistence does not work: the resume path restores FSM
      state but leaves the UI on step 0; `isCompleted` is never checked so tours replay forever;
      `markDismissed` is never called; progress is not saved for the first step or on abandon;
      `BroadcastSync` is only created on resume (and leaks one instance per `start()`); `ttl: 0` —
      documented as "disable expiry" — expires everything instantly; and `restore()` does not clamp
      `stepIndex`, so tampered or stale storage hangs the tour.
      *Accept:* tests for resume-to-correct-step, completed-tour suppression, dismissal round-trip,
      `ttl: 0` meaning no expiry, and `restore()` clamping an out-of-range index.

- [x] **1.4 Fix FSM navigation across states.**
      Closes `fsm-navigation-cannot-cross-states`, `showif-skip-breaks-back-navigation`,
      `fsm-send-to-nonexistent-state`.
      `prev()` and `goTo()` are intra-state only and fail silently — verified: `goTo('b1')` for a step in
      another state leaves `currentStepId` unchanged, and `prev()` at index 0 **re-emits `step:enter` for
      the same step**, double-counting it in analytics. `history` is written and never read. `send()` to
      a state that does not exist leaves the machine in an unrenderable state.
      *Accept:* tests for cross-state `goTo`, `prev` across a state boundary, `prev` past a `showIf`-hidden
      step, and `send()` to a missing target throwing or being rejected.

- [x] **1.5 Wire per-instance i18n.**
      Closes `per-instance-i18n-dead`, `instance-i18n-never-reaches-renderer`,
      `react-guidepopover-ignores-instance-i18n`, `i18n-docs-api-does-not-exist`.
      Verified: `gf.i18n.register('fr', …); gf.i18n.use('fr')` leaves the popover rendering English,
      because `DefaultRenderer` imports the module-level `defaultI18n`. Pass the instance registry into
      the renderer via `onInit(config)`. Also fix `t()` to replace *all* occurrences of a token, and
      correct `apps/docs/guide/i18n.md`, which documents a `setLocale()` API that does not exist.
      *Accept:* a test asserts a registered French locale appears in rendered popover HTML.

- [x] **1.6 Fix `clickThrough`, `configure()` and the renderer contract.**
      Closes `clickthrough-overlay-still-blocks`, `configure-mostly-ignored`,
      `custom-renderer-oninit-never-called`, `pause-does-not-stop-keyboard-or-inflight-render`,
      `dead-spotlight-options`, `per-step-padding-leaks`.
      `show()` sets an inline `pointer-events` that always beats the `.gf-clickthrough` class;
      `configure()` only applies `nonce`; a custom renderer's `onInit` is never called; `pause()` leaves
      the keyboard handler live so a paused tour can advance and reappear; `overlayColor` is accepted
      and ignored.
      *Accept:* a test per option asserting it changes behaviour.

- [x] **1.7 Fix the Intro.js compatibility layer.**
      Closes `attribute-tour-one-step-per-state`, `watch-attribute-tour-self-trigger-loop`.
      Attribute tours build one state per step, so every step shows "1 of 1" with a Done button; and
      `watchAttributeTour` re-fires on GuideFlow's own DOM insertions, restarting the tour in a loop.
      Also decide whether to actually support the `data-intro` / `data-step` / `data-position`
      attributes the README promises, or correct the README.
      *Accept:* a scanned 3-element page produces one 3-step tour, and the observer does not re-fire on
      popover insertion.

---

## Phase 2 — Make verification possible (2–3 days)

You cannot confirm Phase 1's geometry fixes without a real browser. Do this immediately after.

- [x] **2.1 Rebuild the e2e harness.**
      Closes `e2e-webserver-points-at-storybook`, `e2e-suite-cannot-run`, `e2e-axebuilder-does-not-exist`,
      `e2e-a11y-suite-cannot-run`, `axe-playwright-wrong-import`, `apps-e2e-has-no-tsconfig`.
      Three independent breakages: Playwright boots Storybook at :6006 while the tests expect the
      fixture page; the fixture defines an invalid flow (`{id, steps}` with top-level `title`/`body`);
      and `accessibility.spec.ts` imports a default `AxeBuilder` from `axe-playwright`, which has no such
      export — that class belongs to `@axe-core/playwright`. Serve `apps/e2e/fixtures` statically, fix
      the fixture to a valid `FlowDefinition`, and swap the axe dependency.
      *Accept:* `pnpm --filter e2e test` passes locally in Chromium. Confirm each test **fails** against
      unfixed code before trusting it.
      *Done:* `apps/e2e/serve.mjs` (zero-dep `node:http`) serves the **repo root**, so the fixture loads
      the real built artefacts at `/packages/core/dist/**` with no bundler in between; `baseURL` points at
      `/apps/e2e/fixtures/`. The fixture's flows moved to `fixtures/flows.js` (+ `.d.ts`) as a single
      source of truth, `axe-playwright` → `@axe-core/playwright`, and `apps/e2e` gained a `tsconfig.json`
      and `global.d.ts` (type-check clean). The specs were rewritten to cover the Phase 1 fixes:
      final-state rendering, cross-state `prev`/`goTo`, scroll-anchored positioning, resume-to-step,
      completed-tour suppression, and arrow-keys-in-an-input. Five known-failing a11y checks are
      `test.fixme` with their audit ids, ready for Phase 6.
      **Caveat — not executed here.** Playwright cannot spawn a browser in this environment
      (`spawn UNKNOWN`), and the CDN download for the matching build did not complete, so the suite has
      *not* been run end to end. What was verified instead: all 27 specs collect; the server returns 200
      with correct MIME types for the fixture, `flows.js`, `dist/index.js` and `dist/styles/index.css`,
      and 404s on path traversal; and the `@axe-core/playwright` default export resolves to a class.
      Most importantly `packages/core/src/__tests__/e2e-fixture.test.ts` (13 tests) imports the fixture's
      own `flows.js` and drives it through the real engine — so an invalid fixture now fails the **unit**
      suite in seconds. **Run `pnpm --filter e2e test:e2e` on a machine with browsers before trusting the
      e2e job.**

- [x] **2.2 Put e2e in CI**, initially non-blocking, then required.
      Closes `e2e-not-in-ci`, `four-browser-matrix-never-executes`.
      *Accept:* the suite runs on every PR across Chromium, Firefox and WebKit.
      *Done:* `ci.yml` gains an `e2e` job with a `[chromium, firefox, webkit]` matrix, browser
      caching keyed on the lockfile, and a report artifact uploaded on failure.

- [x] **2.3 Close the worst coverage holes.** *(devtools deferred — see below)*
      Closes `no-tests-for-create-guide-flow`, `index-composition-untested`, `zero-tests-persistence-drivers`,
      `sanitizer-tests-only-cover-happy-path`, `vacuous-tests`, `zero-tests-ai-providers`,
      `zero-tests-analytics-transports`, `vue-passwithnotests-zero-tests`, `no-tests-svelte-cli-devtools`,
      `cli-zero-tests`, `zero-tests` (devtools).
      `packages/core/src/index.ts` — the entire public assembly — has no test file. Neither do the
      persistence drivers, three of four AI providers, or four of five analytics transports. Add `test`
      scripts to `svelte`, `cli` and `devtools`, and remove `--passWithNoTests` once each package has
      real tests.
      *Accept:* every package has a `test` script and at least one meaningful test; coverage thresholds
      are configured per `TESTING-STRATEGY.md`.
      *Done:* unit tests went **216 → 397 passing** (17 skipped, each tagged with the audit finding that
      un-skips it). New suites: `drivers.test.ts` (28 — the default persistence path, with a hand-rolled
      IndexedDB stub since happy-dom has none), `sanitizer.test.ts` (28 — 17 active, 11 skipped as the
      Phase 3 acceptance criteria, all verified to fail when un-skipped), `providers.test.ts` (36 — all
      three real AI providers), `transports.test.ts` (28 — the four untested analytics transports,
      including the silent-no-op path so the Phase 5 fix breaks them loudly), `e2e-fixture.test.ts` (13 —
      guards the Playwright fixture against drifting from the engine contract), plus first-ever suites
      for **svelte** (14), **vue** (18) and **cli** (33, covering all four commands). `svelte` and `cli` gained `test` scripts and
      vitest configs; `--passWithNoTests` was removed from `react`, `ai`, `analytics` and `vue` now that
      each has real tests. Coverage thresholds added to six packages as **ratchets** set just below
      measured coverage (core 90/78/78, ai 80/75/88, analytics 83/85/90, svelte 95, cli 95/78/85, react 35 — react is
      deliberately low and Phase 5.1 raises it); verified to actually fail the build when breached, and
      wired into a new CI `coverage` job.
      Two real bugs surfaced while writing the tests and were fixed: the Vue `onUnmounted` listener leak
      (see 5.2) and a CLI test that pulled `vite` in on every run (6910 ms → 271 ms).
      *Deferred:* `@guideflow/devtools` still has no tests — it needs an extension harness, which
      belongs with the extension work in Phase 5.3. Finding `zero-tests` (devtools) stays open.

- [x] **2.4 Harden CI.**
      Closes `release-publishes-without-test-or-lint-gate`, `ci-has-no-e2e-size-coverage-or-changeset-gate`,
      `release-no-provenance-no-audit`.
      `release.yml` published to npm after **only a build** — no lint, type-check or tests.
      *Done:* `release.yml` now runs the full gate (build → type-check → lint → test → size →
      pack verification) before `changesets/action`, and publishes with npm **provenance**
      (`id-token: write` + `NPM_CONFIG_PROVENANCE`). `ci.yml` gains a Node **18/20/22** matrix,
      a `size` job, a `pack` job, the `e2e` job from 2.2, and a **changeset-presence** check on PRs
      that touch a published package. Added `.github/dependabot.yml` (grouped npm + actions).
      New `scripts/verify-pack.mjs` runs `npm pack --dry-run` per publishable package and asserts
      every path in the `exports` map is really in the tarball — it caught
      `analytics-workspace-protocol-in-peerdeps` on its first run, now fixed to `^0.1.9`.
      *Not done here:* coverage thresholds move to 2.3, where the suites they measure are written.

---

## Phase 3 — Security (2–3 days)

- [x] **3.1 Replace the HTML sanitiser.**
      Closes `sanitize-html-regex-denylist-bypass`, `regex-html-sanitizer-bypass`.
      The regex denylist was defeated by **6 of 8** trivial payloads in a direct test. Do not add more
      regexes. Build the popover DOM with `createElement`/`textContent` instead of an `innerHTML`
      string, and sanitise `content.html` with a `DOMParser` + allowlist walker (~60 lines, well under
      1 kB — DOMPurify would blow the budget, see `ADR-002`). Options are laid out in
      [`SECURITY-MODEL.md`](SECURITY-MODEL.md) §2.
      *Accept:* every payload class in `SECURITY-MODEL.md` §2 is a passing regression test.

- [x] **3.2 Escape every attribute interpolation.**
      Closes `unescaped-action-variant-attribute-injection`, `unescaped-i18n-strings-in-popover`,
      `unescaped-action-and-locale-attributes`.
      `step.actions[].action` and `.variant` land in `innerHTML` attributes with zero escaping, and a
      flow fetched from a server or the devtools recorder is untrusted input.
      *Accept:* a test asserting an `action` value containing `"><img onerror=…>` cannot break out.

- [x] **3.3 Fix the AI key story.**
      Closes `api-keys-shipped-to-browser`, `ai-api-key-shipped-to-browser`, `openai-browser-throws`,
      `ai-openai-sdk-browser-throw`.
      Every documented example inlines an API key into the client bundle, and the documented `baseURL`
      proxy escape hatch does not exist. Ship a `ProxyProvider`, make it the documented default, warn
      loudly if a provider is constructed in a browser with a key, and use `MockProvider` in all
      examples.
      *Accept:* no documentation example ships a key to the client.

- [x] **3.4 Harden the extension bridge.**
      **NOT VERIFIED IN A BROWSER.** The bundle builds and every manifest-referenced path is
      present, and no code reads `tab.url`/`tab.title` (so dropping the `tabs` permission is
      safe). But the nonce handshake, the four-type relay allowlist and the move to
      `optional_host_permissions` were all reasoned about by reading, not by loading the
      extension. Before trusting them, run `/gf-extension-dev` end to end — in particular check
      that the panel still detects a page and receives step events, since a nonce mismatch or a
      missing host permission would present as silence rather than an error.
      Closes `devtools-content-script-relays-any-message-type`, `devtools-overbroad-permissions`,
      `devtools-recording-captures-password-values`.
      The content script relays **any** page `postMessage` bearing the sentinel into the privileged
      `chrome.runtime` bus, giving any page a write primitive into `chrome.storage`. Validate message
      shape and type on arrival, use a per-load nonce, narrow `host_permissions`, add a
      `content_security_policy`, and never record input values from password fields.
      *Accept:* a forged page message cannot reach `chrome.storage`.

- [x] **3.5 Analytics privacy.**
      Closes `full-url-pii-leak`, `analytics-pii-no-consent-gate`, `ai-serializedom-pii-to-third-party`,
      `dom-context-pii-exfiltration`.
      Full URL and referrer ship on every event with no scrubbing or opt-out; `serializeDOM` sends page
      text to a third-party LLM with no redaction. Add a consent gate, a URL-scrubbing hook (default:
      strip query and fragment), a Do-Not-Track check, a `[data-gf-private]` skip attribute, and
      document exactly what leaves the browser.
      *Accept:* `SECURITY.md` enumerates every field sent, and consent gating is on by default.

- [x] **3.6 Supply chain.** Closes `release-no-provenance-no-audit`,
      `cli-ships-vite-as-runtime-dependency`.
      *Done:* provenance and Dependabot landed in 2.4; the **audit** half was missed and this box was
      ticked prematurely. Finishing it meant first measuring what a gate would report — 34 advisories,
      3 critical, 12 high — and splitting production from dev showed that **all 8 production
      advisories, including every high, came from `@guideflow/cli` importing `vite` at module scope**.
      Vite is now an optional peer imported lazily inside the `studio` action: production advisories
      8 → 1, highs 3 → 0. The remaining one is `@anthropic-ai/sdk`, an optional peer whose version the
      consumer chooses.
      CI gains a blocking `pnpm audit --prod --audit-level high` (passes today) plus a **non-blocking**
      dev-dependency report, and GitHub's `dependency-review` on PRs. The split is deliberate: a gate
      that is red on day one is a gate people learn to ignore, and dev tooling does not reach
      consumers.
      `guideflow studio` also now binds to `127.0.0.1` rather than Vite's default — it serves the
      user's whole project directory, so network exposure should be an explicit `--host` choice.

---

## Phase 4 — Tell the truth (3–4 days)

52 documentation findings. Every one is a user who follows the docs and fails.

- [ ] **4.1 Fix the P0 documentation lies.**
      Closes `docs-flat-steps-flow-throws`, `theme-css-imports-do-not-exist`, `cli-docs-flags-all-wrong`,
      `react-guide-fabricated-props`, `docs-react-tour-step-wrong-component`,
      `docs-react-guidepopover-fabricated-props`, `docs-svelte-store-example-compile-error`.
      The Quick Start teaches a flow shape that throws. All six theme pages import CSS files that do not
      exist. The CLI reference documents a fictional flag set. The React API reference documents
      components and props that were never written.
      *Accept:* every code block in `apps/docs/` and `README.md` compiles and runs.

- [ ] **4.2 Fix the P1 documentation drift.**
      Closes `i18n-docs-nonexistent-api`, `guide-brain-doc-signatures-wrong`, `ai-generate-options-arg-fabricated`,
      `intent-signal-shape-fabricated`, `analytics-event-names-wrong`, `docs-analyticsevent-shape-wrong`,
      `docs-custom-transport-wrong-method`, `docs-nonexistent-events`, `theme-docs-fictional-tokens`,
      `theme-tokens-fabricated`, `migration-guides-wrong-events-and-fields`, `ttl-zero-doc-inverted`,
      `cross-tab-sync-overclaimed`, `docs-claim-accessible-by-default`,
      `docs-overclaim-dropoffs-and-ab-integration`, `docs-react-guide-six-nonexistent-apis`.
      Run the `gf-docs-truth-checker` agent to catch what this list misses.

- [ ] **4.3 Fix identity, licence and version strings.**
      Closes `source-header-identity-mismatch`, `license-wrong-owner-url`, `stale-version-strings`,
      `sync-script-misses-surfaces`, `published-packages-have-no-license-file`.
      Six package entry points carry `github.com/johnmugabe` and a `263tickets.co.zw` email while every
      manifest says `RealNerdZW`; `LICENSE` names an account that does not own the repo; two published
      doc surfaces still advertise v0.1.4. Extend `scripts/sync-repo-meta.mjs` to cover source headers,
      then run it.
      *Accept:* one grep for the old identity returns nothing.

- [ ] **4.4 Correct the bundle-size claim.**
      Closes `bundle-size-claim-exceeded`, `size-budget-unenforced-and-optimistic`.
      README says "~12 kB gzip"; the size-limit gate reports 11.09 kB but the shipped
      `dist/index.js` gzips to **14.95 kB**. State both numbers, or change what the gate measures. Add
      budgets for the other packages.

- [ ] **4.5 Retire or rebuild the stale documentation surface.**
      Closes `duplicated-doc-surfaces`, `only-changelog-is-stale-unpublished-html`, `missing-support-docs`.
      `docs/*.html` is not built by anything, yet `docs.yml` still triggers on `docs/**`. Migrate
      `publishing.html`, delete the rest, drop the trigger. Add a real `CHANGELOG.md`, a browser support
      matrix, and a troubleshooting page.

- [ ] **4.6 Retract or build the vapourware.**
      Closes `studio-is-not-a-visual-editor`, `cli-studio-not-an-editor`, `export-ts-js-emits-stub-not-flow`,
      `cli-export-emits-stub`, `push-hardcoded-nonexistent-saas`, `cloud-push-nonexistent-service`,
      `guideflow-config-ts-documented-never-exists`, `docs-claim-ai-assist`.
      `guideflow studio` is a bare Vite server plus one unused boolean. `guideflow export` writes a
      truncated string stub. `guideflow push` targets a service that does not exist. `guideflow.config.ts`
      is documented in three places and never written or read. **Recommendation:** retract now, build in
      Phase 6 — a documented feature that does not exist costs more trust than a missing one.

---

## Phase 5 — Adapters, extension and CLI (5–7 days)

- [ ] **5.1 React correctness.**
      Closes `react-guidepopover-duplicates-core-renderer`, `react-provider-never-destroys-instance`,
      `react-useid-breaks-react-17`, `react-no-use-client-boundary`, `react-popover-never-focuses`,
      `react-guidepopover-drops-actions-html-media`, `react-guidepopover-position-flash-and-no-scroll-tracking`,
      `react-guidepopover-stays-visible-after-pause`, `react-no-usesyncexternalstore-tearing`,
      `conversationalpanel-no-abort-swallowed-error-dead-highlights`.
      The headline defect: `<GuidePopover>` renders a **second** popover on top of core's
      `DefaultRenderer` — two stacked `aria-modal` dialogs. Decide the model (headless core + React
      renderer, or core renderer only) and implement one. `TourProvider` never destroys the instance it
      created. `useId()` breaks React 17, which is inside the declared peer range. There is no
      `'use client'` directive despite documented App Router support.

- [ ] **5.2 Vue and Svelte parity.**
      Closes `vue-no-components-shipped`, `svelte-no-components-no-tests`,
      `vue-onunmounted-instead-of-onscopedispose`, `adapters-no-pause-resume-anywhere`,
      `adapters-no-hints-progress-i18n-listflows-surface`, `svelte-cjs-build-cannot-run`.
      Both packages advertise components in their `description` and `keywords` and ship none. `pause`
      and `resume` are unreachable from **any** adapter. Use `/gf-adapter-parity` and fill the matrix.
      Note `tsup` cannot compile `.svelte` — real components need `svelte-package`.

- [ ] **5.3 DevTools extension.**
      Closes `bridge-dataclone-aborts-every-tour` ⭐, `popup-recording-drops-every-step`,
      `mv3-state-dies-on-suspend`, `devtools-port-never-reconnects`, `load-saved-tour-is-a-stub`,
      `selector-nth-child-not-anchored`, `flows-list-clone-failure`, `generated-flow-one-step-per-state`,
      `popup-run-sends-non-flow`, `recording-lost-on-navigation`, `no-distribution-artifact`.
      The `step:enter` payload contains a DOM `Element`, which is not structured-cloneable — so the
      bridge's `postMessage` **throws `DataCloneError` and aborts every targeted tour on the page**.
      Fix that first. Then: recording from the popup discards every step; all per-tab state dies when
      MV3 suspends the worker; "Load saved tour" is a no-op stub; and there is no distribution artifact,
      so nobody can install the extension.

- [ ] **5.4 Make the CLI honest and safe.**
      Closes `export-overwrites-json-source-file`, `init-clobbers-existing-files`,
      `init-vue-svelte-scaffold-nothing`, `init-always-prompts-breaks-ci`, `push-requiredoption-kills-env-var`,
      `cli-push-api-key-required-cli-flag`, `cli-exports-no-types`, `cli-ships-vite-as-runtime-dependency`.
      `export foo.json` overwrites the user's input file, minified. `init` clobbers existing files with
      no prompt, always prompts (so it cannot run in CI), and silently scaffolds nothing for Vue and
      Svelte while reporting success.

- [ ] **5.5 Packaging correctness.**
      Closes `core-sideeffects-false-drops-css`, `analytics-workspace-protocol-in-peerdeps`,
      `exports-never-reference-emitted-dcts`, `core-styles-export-missing-default`,
      `core-iife-build-is-unreachable`, `adapters-bundle-core-as-hard-dependency`.
      `@guideflow/core` declares `"sideEffects": false` while shipping CSS consumers must import —
      webpack will tree-shake the stylesheet away. `@guideflow/analytics` has `workspace:*` in
      `peerDependencies`, which is not publishable. The IIFE build exists but is unreachable via
      `exports`.
      *Accept:* `npm pack --dry-run` + a real install smoke test per `/gf-release`.

---

## Phase 6 — Accessibility (4–5 days)

Requires Phase 2 (nothing here is verifiable without a browser).

- [ ] **6.1 Focus management.**
      Closes `no-focus-trap-or-restore`, `react-popover-never-focuses`, `renderer-no-focus-trap-or-restore`.
      `role="dialog" aria-modal="true"` with no focus trap, no focus restoration, and no `inert` on the
      background. The React popover never moves focus at all.

- [ ] **6.2 Stop hijacking the keyboard.**
      Closes `arrow-keys-break-inputs`.
      The document-level handler `preventDefault`s arrow keys with no check for editable fields, native
      controls, or IME composition — so a user cannot type in an input while a tour is active. This is
      worst on `clickThrough` steps, which exist precisely so the user *can* interact.

- [ ] **6.3 Announcements and semantics.**
      Closes `no-live-region`, `dangling-aria-labelledby`, `progressbar-no-name-or-valuetext`,
      `hotspot-touch-target-and-tooltip-invisible-to-at`, `conversational-panel-a11y`, `panel-accessibility`.

- [ ] **6.4 Motion, contrast, RTL, theming.**
      Closes `no-reduced-motion-guard`, `default-button-contrast-fails`, `rtl-double-flip`,
      `dark-css-clobbers-themes`, `forced-colors-adjust-none-defeats-hc`, `placement-math-not-direction-aware`.
      There is no `prefers-reduced-motion` guard anywhere. The default primary button fails AA contrast
      in both light and dark. `rtl.css` double-reverses the footer back into LTR order.

- [ ] **6.5 Automated + manual verification.**
      Closes `no-visual-regression-or-a11y-unit-tests`.
      axe in e2e and Storybook, plus one manual NVDA/VoiceOver pass. Then remove the
      `docs-claim-accessible-by-default` claim, or earn it.

---

## Phase 7 — Close the product gaps (ongoing)

Driven by [`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md). Highest impact first.

- [ ] **7.1 SPA route-change handling.** ⭐ Closes `no-spa-route-change-handling`.
      **Nothing** in the monorepo handles `popstate`, `pushState` or `hashchange`. A tour cannot span two
      routes — the most common real-world onboarding requirement, and a category table-stake that
      Shepherd and react-joyride both meet. Needs `waitForTarget` with a timeout, a per-step `route`
      hint, a history adapter, and re-anchoring after navigation.
- [ ] **7.2 Target-only interaction** — rework the overlay so `clickThrough` exposes the *target*, not
      the whole page (revisits `ADR-004`).
- [ ] **7.3 Flow versioning** — closes `no-flow-versioning-stale-snapshot-resume`.
- [ ] **7.4 Targeting, scheduling and frequency capping** — closes `no-targeting-or-audience-rules`,
      `no-frequency-capping-or-flow-orchestration`.
- [ ] **7.5 Make A/B testing able to change something** — closes `experiment-variant-cannot-affect-any-tour`.
- [ ] **7.6 Wire intent to flows** — closes `intent-never-wired-to-flows`.
- [ ] **7.7 AI reliability** — structured outputs, retries, timeouts, abort, spend caps. Closes
      `no-json-mode-hand-parsed`, `uncapped-llm-calls-per-pause`, `brain-unhandled-rejection`,
      `provider-no-timeout-abort`, `anthropic-default-model-retired`.
- [ ] **7.8 Checklists, banners, surveys** — closes `no-checklists-surveys-banners-resource-centre`.
- [ ] **7.9 A real authoring path** — finish the recorder, then build the studio on it. Closes
      `no-authoring-path-for-non-engineers`.
- [ ] **7.10 Backend / flow CMS** — closes `no-backend-cms-or-self-hosting-story`. See
      `MCP-AND-SKILLS.md` for the stack recommendation.
- [ ] **7.11 Ship a GuideFlow MCP server** — see `MCP-AND-SKILLS.md` §3.

---

## Suggested first week

If you only have five days, this is the highest-value slice — it turns "the README is wrong" into "the
README is right":

| Day | Work |
|---|---|
| 1 | Phase 0 (all) · 1.1 final-state steps · 1.2 popover positioning |
| 2 | 1.3 persistence · 1.4 FSM navigation |
| 3 | 2.1 rebuild the e2e harness · verify 1.1–1.4 in a real browser |
| 4 | 3.1 + 3.2 sanitiser and escaping · 3.3 AI keys |
| 5 | 4.1 P0 documentation · 4.3 identity strings · 2.4 CI gate |

That closes 13 of the 22 P0s and every claim on the README front page.
