# Remediation plan

The ordered work queue derived from [`AUDIT.md`](AUDIT.md). Work top to bottom — phases are sequenced
so each unblocks the next.

**How to use it:** run `/fix-next`, or pick the first unchecked box yourself. Every task names the
audit finding ids it closes and the acceptance criterion that proves it. Tick the box, note the commit,
and set `"status": "resolved"` in [`audit-findings.json`](audit-findings.json).

**Rules for every task:** add a test that fails without the fix; run `/verify`; update `apps/docs/`
if behaviour changed; write a changeset for published packages.

**Progress:** **197 / 378 findings resolved** — Phases 0–6 complete, and Phase 7 through 7.10d plus
7.8b, on branch `fix/phase-0-1-engine-correctness`. Remaining open: **0 P0**, 26 P1, 113 P2, 42 P3.

The total grew from 325 to 371 because Phase 4 found **32 new source bugs while verifying
documentation claims against the code** — checking whether a doc was true turned out to be an
effective bug-finding technique in its own right (registered as P2 with
`foundIn: "Phase 4 docs verification"`) — and later phases registered what they found on the way
past.

**There are no open P0s.** The last one, `no-spa-route-change-handling`, was never a defect — it was
an absent feature, and it closed in Phase 7.1. Every P0 that was *broken code* was fixed before it.

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

- [x] **4.1 Fix the P0 documentation lies.**
      Closes `docs-flat-steps-flow-throws`, `theme-css-imports-do-not-exist`, `cli-docs-flags-all-wrong`,
      `react-guide-fabricated-props`, `docs-react-tour-step-wrong-component`,
      `docs-react-guidepopover-fabricated-props`, `docs-svelte-store-example-compile-error`.
      The Quick Start teaches a flow shape that throws. All six theme pages import CSS files that do not
      exist. The CLI reference documents a fictional flag set. The React API reference documents
      components and props that were never written.
      *Accept:* every code block in `apps/docs/` and `README.md` compiles and runs.

- [x] **4.2 Fix the P1 documentation drift.**
      Closes `i18n-docs-nonexistent-api`, `guide-brain-doc-signatures-wrong`, `ai-generate-options-arg-fabricated`,
      `intent-signal-shape-fabricated`, `analytics-event-names-wrong`, `docs-analyticsevent-shape-wrong`,
      `docs-custom-transport-wrong-method`, `docs-nonexistent-events`, `theme-docs-fictional-tokens`,
      `theme-tokens-fabricated`, `migration-guides-wrong-events-and-fields`, `ttl-zero-doc-inverted`,
      `cross-tab-sync-overclaimed`, `docs-claim-accessible-by-default`,
      `docs-overclaim-dropoffs-and-ab-integration`, `docs-react-guide-six-nonexistent-apis`.
      Run the `gf-docs-truth-checker` agent to catch what this list misses.

- [x] **4.3 Fix identity, licence and version strings.**
      Closes `source-header-identity-mismatch`, `license-wrong-owner-url`, `stale-version-strings`,
      `sync-script-misses-surfaces`, `published-packages-have-no-license-file`.
      Six package entry points carry `github.com/johnmugabe` and a `263tickets.co.zw` email while every
      manifest says `RealNerdZW`; `LICENSE` names an account that does not own the repo; two published
      doc surfaces still advertise v0.1.4. Extend `scripts/sync-repo-meta.mjs` to cover source headers,
      then run it.
      *Accept:* one grep for the old identity returns nothing.

- [x] **4.4 Correct the bundle-size claim.**
      Closes `bundle-size-claim-exceeded`, `size-budget-unenforced-and-optimistic`.
      README says "~12 kB gzip"; the size-limit gate reports 11.09 kB but the shipped
      `dist/index.js` gzips to **14.95 kB**. State both numbers, or change what the gate measures. Add
      budgets for the other packages.

- [x] **4.5 Retire or rebuild the stale documentation surface.**
      Closes `duplicated-doc-surfaces`, `only-changelog-is-stale-unpublished-html`, `missing-support-docs`.
      `docs/*.html` is not built by anything, yet `docs.yml` still triggers on `docs/**`. Migrate
      `publishing.html`, delete the rest, drop the trigger. Add a real `CHANGELOG.md`, a browser support
      matrix, and a troubleshooting page.

- [x] **4.6 Retract or build the vapourware.**
      Closes `studio-is-not-a-visual-editor`, `cli-studio-not-an-editor`, `export-ts-js-emits-stub-not-flow`,
      `cli-export-emits-stub`, `push-hardcoded-nonexistent-saas`, `cloud-push-nonexistent-service`,
      `guideflow-config-ts-documented-never-exists`, `docs-claim-ai-assist`.
      `guideflow studio` is a bare Vite server plus one unused boolean. `guideflow export` writes a
      truncated string stub. `guideflow push` targets a service that does not exist. `guideflow.config.ts`
      is documented in three places and never written or read. **Recommendation:** retract now, build in
      Phase 6 — a documented feature that does not exist costs more trust than a missing one.

---

## Phase 5 — Adapters, extension and CLI (5–7 days)

- [x] **5.1 React correctness.**
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

- [x] **5.2 Vue and Svelte parity.**
      Closes `vue-no-components-shipped`, `svelte-no-components-no-tests`,
      `vue-onunmounted-instead-of-onscopedispose`, `adapters-no-pause-resume-anywhere`,
      `adapters-no-hints-progress-i18n-listflows-surface`, `svelte-cjs-build-cannot-run`.
      Both packages advertise components in their `description` and `keywords` and ship none. `pause`
      and `resume` are unreachable from **any** adapter. Use `/gf-adapter-parity` and fill the matrix.
      Note `tsup` cannot compile `.svelte` — real components need `svelte-package`.

- [x] **5.3 DevTools extension.**
      Closes `bridge-dataclone-aborts-every-tour` ⭐, `popup-recording-drops-every-step`,
      `mv3-state-dies-on-suspend`, `devtools-port-never-reconnects`, `load-saved-tour-is-a-stub`,
      `selector-nth-child-not-anchored`, `flows-list-clone-failure`, `generated-flow-one-step-per-state`,
      `popup-run-sends-non-flow`, `recording-lost-on-navigation`, `no-distribution-artifact`.
      The `step:enter` payload contains a DOM `Element`, which is not structured-cloneable — so the
      bridge's `postMessage` **throws `DataCloneError` and aborts every targeted tour on the page**.
      Fix that first. Then: recording from the popup discards every step; all per-tab state dies when
      MV3 suspends the worker; "Load saved tour" is a no-op stub; and there is no distribution artifact,
      so nobody can install the extension.

- [x] **5.4 Make the CLI honest and safe.**
      Closes `export-overwrites-json-source-file`, `init-clobbers-existing-files`,
      `init-vue-svelte-scaffold-nothing`, `init-always-prompts-breaks-ci`, `push-requiredoption-kills-env-var`,
      `cli-push-api-key-required-cli-flag`, `cli-exports-no-types`, `cli-ships-vite-as-runtime-dependency`.
      `export foo.json` overwrites the user's input file, minified. `init` clobbers existing files with
      no prompt, always prompts (so it cannot run in CI), and silently scaffolds nothing for Vue and
      Svelte while reporting success.

- [x] **5.5 Packaging correctness.**
      Closes `core-sideeffects-false-drops-css`, `analytics-workspace-protocol-in-peerdeps`,
      `exports-never-reference-emitted-dcts`, `core-styles-export-missing-default`,
      `core-iife-build-is-unreachable`, `adapters-bundle-core-as-hard-dependency`.
      `@guideflow/core` declares `"sideEffects": false` while shipping CSS consumers must import —
      webpack will tree-shake the stylesheet away. `@guideflow/analytics` has `workspace:*` in
      `peerDependencies`, which is not publishable. The IIFE build exists but is unreachable via
      `exports`.
      *Accept:* `npm pack --dry-run` + a real install smoke test per `/gf-release`.

---

## Phase 6 — Accessibility ✅ COMPLETE (2026-07-31)

Required Phase 2 — and it turned out Phase 2 was not finished. Every spec still navigated to
`page.goto('/')`, which Playwright resolves as `new URL('/', baseURL)`: the leading slash discards
the base path, so all three specs loaded the repo root and every `beforeEach` timed out waiting for
`__gfReady`. The suite had a 0% pass rate even after the harness rebuild and the browser install.
Fixed here (`e2e-goto-discards-base-path`). **The e2e suite now runs: 156/156 across chromium,
firefox, webkit and Mobile Chrome.**

- [x] **6.1 Focus management.**
      Closed `no-focus-trap-or-restore`, `react-popover-never-focuses`,
      `renderer-no-focus-trap-or-restore`.
      Both popovers trap Tab and Shift+Tab, pull focus back when the page steals it, and restore
      focus to the pre-tour element on close. `inert` on the background was considered and rejected:
      it would break `clickThrough` steps, whose entire purpose is letting the user interact with
      the highlighted element.

- [x] **6.2 Stop hijacking the keyboard.**
      Closed `arrow-keys-break-inputs`.
      `isEditableTarget()` covers inputs, textareas, selects, `contenteditable` (walking up from the
      event target) and widget roles; plus guards for IME composition, modifier keys and
      `defaultPrevented`. Escape is deliberately exempt — it is a keyboard user's only exit from a
      modal, so it fires from inside a field too.

- [x] **6.3 Announcements and semantics.**
      Closed `no-live-region`, `dangling-aria-labelledby`, `progressbar-no-name-or-valuetext`,
      `hotspot-touch-target-and-tooltip-invisible-to-at`, `conversational-panel-a11y`,
      `panel-accessibility`.
      Polite live region outside the popover in both renderers; conditional
      `aria-labelledby`/`aria-label`/`aria-describedby`; progressbar reports a step count with
      `aria-valuetext`; hotspot gets a 24×24 target (WCAG 2.5.8), a focus ring and a real
      `aria-describedby`; ConversationalPanel focuses on open, restores on close, closes on Escape,
      and keeps its focus ring.

- [x] **6.4 Motion, contrast, RTL, theming.**
      Closed `no-reduced-motion-guard`, `default-button-contrast-fails`, `rtl-double-flip`,
      `dark-css-clobbers-themes`, `forced-colors-adjust-none-defeats-hc`,
      `placement-math-not-direction-aware`, plus `accent-fails-contrast`,
      `muted-text-fails-contrast`, `forced-colors-opt-out`, `dead-progress-selector`,
      `rtl-hint-badge` found while doing it.
      `styles/motion.css` plus `prefersReducedMotion()` for the two motions CSS cannot reach (the
      smooth scroll and the spotlight transition, both assigned from script). The default accent
      moved to indigo-600 because white on indigo-500 measures 4.46:1 against a 4.5:1 requirement.
      `rtl.css` is now essentially empty, and that *is* the fix — it was fighting the browser's own
      correct mirroring.

- [x] **6.5 Automated verification.**
      Closed `no-visual-regression-or-a11y-unit-tests` (partially — see below).
      47 a11y unit tests in `packages/core`, 19 in `packages/react`, and 17 axe/keyboard/RTL specs
      in `apps/e2e/tests/accessibility.spec.ts`. axe reports zero critical or serious violations on
      the open popover, in LTR and RTL.

### Found while doing Phase 6 — engine defects the e2e suite exposed

Both were invisible until the browser suite actually ran for the first time:

- [x] `total-steps-is-per-state` — `totalSteps`/`currentStepIndex` counted the current *state*, so a
      two-state tour reported "Step 1 of 1" in each and the renderer drew a **Done** button on step
      one. Now counts along the path a `next()`-only run actually takes.
- [x] `done-button-abandons-tour` — the Done button dispatched `end` → `stop()` → `tour:abandon`, so
      a completed tour never emitted `tour:complete`, never cleared its snapshot, and reopened on the
      next visit. `@guideflow/react` had already fixed this; the two had diverged silently.

### Still open from Phase 6

- [ ] **Manual screen-reader pass.** No NVDA or VoiceOver session has been run. Everything above is
      verified by axe and by assertion, which catches structure but not whether the result is
      *usable*. Until someone drives a tour end-to-end with a screen reader, do not restore the
      `docs-claim-accessible-by-default` marketing claim — that finding stays open.
- [ ] **Storybook axe integration.** The e2e suite covers the popover; component stories are not yet
      linted for a11y.

---

## Phase 7 — Close the product gaps (in progress)

Driven by [`PRODUCT-ROADMAP.md`](PRODUCT-ROADMAP.md). Highest impact first.

A 13-agent design pass produced a full implementation brief for 7.1/7.3/7.4/7.5, with a byte budget
for every piece. Its headline finding drove the order below: **the remaining core work is ~830 B and
the budget could not absorb it**, so the packaging change had to come first.

### Done

- [x] **7.2 Target-only interaction.** Closed `clickthrough-exposes-whole-page`,
      `clickthrough-overlay-still-blocks`, and ADR-004's recorded limitation.
      The overlay carves a hole with `clip-path` rather than dropping pointer capture. Clipping
      affects hit-testing, so the target is genuinely clickable and the rest of the page is not.
      One element, one style assignment — the four-panel arrangement competitors use costs several
      hundred bytes more. 11 unit tests on the geometry, 5 e2e tests that click the target for real.
      *Known cosmetic gap: the hole's corners are square while the cutout's are rounded.*

- [x] **7.1e Evict `content.html` to `@guideflow/core/html`.** See **ADR-009**.
      Not housekeeping — 7.2 took core to 14.55 kB against a 14.5 kB limit, and ADR-008's condition
      on the next raise was to move `content.html` out *first*. Doing so freed 420 B and the limit
      did not move at all: **14.13 kB, ~370 B spare**. The sanitiser is passed explicitly rather
      than registered by a side-effect import, because a bundler giving the subpath its own copy of
      a registry module would fail silently. Breaking for `content.html` users.

- [x] **Two render-lifecycle defects the design pass found by reading.**
      `detached-target-paints-black-screen` (P1) — a target removed mid-step is still a non-null
      Element with a zero rect, so the cutout collapsed to 0x0 while keeping a 9999px shadow: a
      fully black, click-blocking screen. `generation-not-bumped-on-navigation` (P2) —
      `_renderGeneration` was never bumped by `next`/`prev`/`goTo`/`send`, so two rapid navigations
      shared a generation and the older render could land last. Both are prerequisites for 7.1f.

- [x] **7.6 Wire intent detection to flows.** Closed `intent-never-wired-to-flows`.
      `createAI({ intentTriggers })` maps a signal type + confidence floor to a flow. Opt-in; never
      interrupts a live tour; `minConfidence` defaults to 0.7 so a failed detection (which falls
      back to `confidence: 0`) cannot fire a rule; once-per-flow by default.

- [x] **7.7 AI reliability.** Closed `no-json-mode-hand-parsed`, `provider-no-timeout-abort`,
      `uncapped-llm-calls-per-pause`, `brain-unhandled-rejection`, `anthropic-default-model-retired`.
      Structured output per provider with a parse-and-recover fallback that *warns* rather than
      returning `[]`; timeouts, abort and retry on all four; detection capped by a new-event floor,
      a cooldown and a session ceiling; the unhandled rejection on a timer removed.

### Remaining

- [x] **7.1 SPA route-change handling — DONE. The audit has no open P0s left.**
      Closed `no-spa-route-change-handling` and `silent-missing-target`. See **ADR-010**.
      `route` on `StateNode` (not on `Step`, not a transition — a `ROUTE` transition would put the
      target state off `_defaultPath`, which walks `NEXT` only, and revert the counters to
      per-state numbering). A `NavigationAdapter` seam in the engine at **+590 B**, and
      `@guideflow/core/navigation` at **1.55 kB, opt-in**, carrying `matchRoute`, `waitForElement`,
      `watchHistory` and `createNavigation`.
      Also: `waitForTarget`, function `Step.target`, `step:target-missing` / `step:waiting` /
      `step:timeout`, `isWaiting` across all three adapters, `rerender()` declared, progress saved
      when the machine moves rather than when the render lands.
      31 unit tests plus 11 e2e specs driving a real `pushState` router.
- [x] **7.3 Flow versioning — DONE.** Closed `no-flow-versioning-stale-snapshot-resume`.
      Two gates, cheapest first: `stepId` on every snapshot, preferred over `stepIndex` and
      **rejected rather than clamped** when it no longer exists; then `FlowDefinition.version`.
      `@guideflow/core/versioning` (336 B) derives one from a flow's structure, ignoring everything
      cosmetic so a typo fix does not restart anybody's tour. `progress:discard` names which gate
      rejected. `restore()` also now refuses a state with zero steps — it used to return `true` and
      leave an "active" tour with nothing painted.
      *The audit was **wrong** that `restore()` does not clamp `stepIndex`. It always did.*
      **Still open, by design:** `isCompleted` is version-blind (keyed on flowId, no
      `clearCompleted`), so shipping v2 never re-shows to anyone who completed v1.
- [x] **7.4 Targeting, scheduling and frequency capping — DONE.** Closed
      `no-targeting-or-audience-rules` and `no-frequency-capping-or-flow-orchestration`.
      **Data in core (types, 0 bytes), policy in `@guideflow/core/targeting` (2.18 kB).** The one
      core addition is `ProgressStore.getRecord`/`setRecord` (~130 B), which puts cap state under
      the prefix `resetUser()` already sweeps.
      Modelled as the third scope of a guard the FSM already has — transition, step, flow — so
      every rule compiles to the same shape and `evaluate()` can name the guard that rejected
      (`blockedBy`). Guard order is load-bearing: free checks before storage reads.
      **Known limitation, documented:** the cap record is read-modify-write with no lock, so two
      tabs starting tours in the same instant can lose one increment.
- [x] **7.5 Make A/B testing able to change something — DONE.** Closed
      `experiment-variant-cannot-affect-any-tour` and `experiment-correlation`.
      `startVariant(gf, engine, experiment)` in `@guideflow/analytics` — zero core bytes — assigns,
      starts the flow the variant names, and emits `guideflow.experiment.exposed` through the
      collector's privacy pipeline. `AnalyticsCollector.track()` promoted to public so a custom
      event goes *through* `send()` rather than around it.
      **The bucketing had to be fixed first.** `hash % totalWeight` is the low bit of djb2 for a
      two-arm experiment, so two concurrent experiments agreed 100.0% / 0.0% of the time while every
      marginal split looked like a clean 50/50. Now FNV-1a plus a murmur3 avalanche over a fixed
      10 000-slot space; measured agreement 49–50%. **Assignments changed** — documented.
      `theme` landed in core after all, at ~30 B rather than the estimated 80: `DefaultRenderer.onInit`
      is already re-invoked by `configure()`, so one call site covers both.
      Also `StepAction.action` — it used `string & object`, which no string literal satisfies, so
      every custom FSM event name was a type error and the documented escape hatch was unusable.
- [x] **7.8 Onboarding checklist** — `no-checklists-surveys-banners-resource-centre`, partially.
      `@guideflow/checklist` ships as a ninth workspace package: `createChecklist()` headless plus
      `mountChecklist()` at the `/widget` subpath. A **projection** of `ProgressStore`, never a
      second source of truth — flow-backed items read `getCompletedFlows` and are never written
      back, and `complete()` deliberately does not call `markCompleted`, because `gf.start()` gates
      on `isCompleted` and would then permanently suppress the tour the item launches. **Zero bytes
      reach core**; the only core change is one CSS token (`--gf-z-checklist`) and a docblock. 74
      unit tests; a Playwright spec covering everything happy-dom cannot prove (tab order, focus
      restoration, `inert`, computed reduced-motion, RTL geometry, z-order hit-testing). See
      ADR-011.
      Also closed the release hazard it exposed: `verify-pack.mjs` now fails when the changesets
      `fixed` group carries more than one version. Nothing checked that before, and a package
      scaffolded at npm's default `1.0.0` would have majored all nine.
      Scope item B: the `target: null` centred modal announcement is now **documented** rather than
      disparaged (`apps/docs/guide/announcements.md`), with an e2e spec pinning the geometry and the
      dialog semantics, and `PRODUCT-ROADMAP.md` corrected — it works, it is accessible, and calling
      it a hand-rolled workaround while shipping a docs page for it was working agreement 6 violated
      in the opposite direction from usual.
- [x] **7.8b Docked banners** — `@guideflow/banner`, the tenth package. Closes every one of the four
      limits `apps/docs/guide/announcements.md` has recorded against the `target: null` modal since
      Phase 7.8, and that page now points at it instead of saying the variant is not built.
      **One shows at a time, derived rather than pushed** — highest-priority eligible undismissed,
      ties keeping registration order, the rule targeting already uses. **Targeting is core's**:
      `matchUrl` / `matchAudience` / `matchSchedule` imported, never reimplemented, so a throwing
      audience predicate still means "not eligible" rather than a crash. `evaluate()` reports
      `blockedBy` in core's own `BlockReason` vocabulary. **Dismissal is permanent unless the author
      declares a `version`** — ADR-015's rule, with an opt-out that is a declaration rather than a
      content hash. A landmark with a *separate* live region, never `role="alert"`.
      **The shared abstraction was counted, not assumed.** Three designers independently measured
      81/91/115 genuinely generic lines out of the checklist widget's 816, ~88% in one file — so
      `a11y.ts` is copied, and `@guideflow/dock` was rejected. See **ADR-017**.
      Two defects found on the way and fixed: `@guideflow/checklist`'s `destroy()` called
      `removeStyles` unconditionally, so with two mounts the first teardown stripped the stylesheet
      from the survivor, silently — its own test mounted twice and never checked; and the e2e
      fixture's import map covered `@guideflow/core` but none of its subpaths, which is a hard
      module-resolution error the moment any package imports one.
      **Layout reservation was solved rather than deferred, by the e2e suite**: a spec could not
      click a button the `position: fixed` bar sat on top of, so `dock: 'top'` became
      `position: sticky` — it reserves its own height and needs nothing from the host.
      62 unit tests, 8 e2e specs in real Chromium.
- [ ] **7.8c Surveys / NPS** — the premise moved. It was deferred "until after 7.10, because the
      backend is where the answers would live", and 7.10 decided there is no backend: analytics is
      host-wired, so a survey's answers go wherever the host's collector sends them. That makes it
      buildable now, and `@guideflow/banner`'s controller shape is the template.
- [x] **Devtools event-list rot** (standalone, no phase) — converted to
      `Object.keys({…} satisfies Record<keyof TourEvents, true>)` at all three sites: the bridge
      relay, the panel's filter chips, and `apps/demo`'s live log. Both drift directions were
      *demonstrated* to fail `tsc` — a missing key as TS1360, a renamed one as TS2353.
      They had already rotted: `tour:dismiss` shipped in Phase 6 and reached none of them, so the
      panel could not show a dismissal, and the demo log was missing seven events.
      The two devtools copies must stay separate — `bridge.ts` is injected into the page world as a
      classic script, so importing a module another entry point also imports makes Rollup emit a
      shared chunk and the build's ESM guard rejects it. `devtools-events.test.ts` asserts the two
      still agree with each other, which is the one thing `satisfies` cannot check.
- [x] **7.9a The authoring core** — the provable half of `no-authoring-path-for-non-engineers`.
      Two zero-byte `@guideflow/core` subpaths: `./selector` (one ranked, uniqueness-verified engine
      replacing three broken copies) and `./authoring` (`validateFlow`, the one draft⇄flow converter,
      and the one reader/writer of `.flow.json`). `guideflow validate` added; `guideflow export`
      rewritten onto the one serialiser with its `.ts`/`.js` stub P1 deleted; `guideflow studio`
      deleted with its `vite` peer. `dist/index.js` unchanged at 14.96 kB. See ADR-012.
      **Measured, not read.** Two wrong-element selector failures reproduced in real Chromium and
      fixed. Four engine behaviours measured to grade the validator's severities — one of which
      showed CLAUDE.md had been **wrong for eight phases** about `final: true`, now corrected and
      pinned by `authoring-engine.test.ts`.
      Two pre-existing repo defects surfaced and fixed on the way: turbo's `lint`/`type-check` raced
      a package's own `dist` deletion (intermittent, 1-in-3), and Vite's bare-string alias is a
      prefix match that broke the demo on the first subpath import.
- [x] **7.9b The authoring surface** — the half that needed a browser. `recorder.html` is an
      ordinary extension page hosting the authoring UI; the panel's Builder tab is deleted.
      Recording state and the captured-step buffer moved to the service worker and through it to
      `chrome.storage.session`, which fixes navigation-kills-recording,
      DevTools-close-loses-steps and popup-armed-captures-nothing in one change and makes the
      buffer survive an MV3 eviction. One message vocabulary in `src/messages.ts`.
      `scripts/pack-extension.mjs` + a CI artifact, so the extension can be downloaded rather than
      cloned and built. See ADR-013.
      **The extension is exercised in a browser for the first time in this repo's history** — ten
      specs in a chromium-only Playwright project covering the worker, the content script, the
      Phase 3 nonce handshake and relay allowlist, detection, recording across a navigation,
      buffering with no UI open, the Recorder, and the packaged zip. `channel: 'chromium'` is
      mandatory: the default headless chromium is the headless shell and loads no extension at
      all, silently.
      Retired on the way: `optional_host_permissions` (never requested, and able to silently
      withhold the content script), the sticky bridge-injection failure, context menus that
      stopped registering after an update, and an active-tour tracker reading fields
      `tour:start` does not carry.
- [ ] **7.9c Chrome Web Store listing** — a developer account, a fee, a privacy policy and a review.
      Not engineering; tracked so it is not mistaken for done.
- [x] **7.10 Flows are static assets** — `no-backend-cms-or-self-hosting-story`, closed as the
      audit's option (a) plus the one engine fix that makes the replacement honest. See ADR-014.
      **No backend, no server package, no `loadFlows()`** — a `.flow.json` is a static asset, and
      `fetch` + `parseFlowFile` + `gf.createFlow()` already swap a live tour. Proved end to end by
      rewriting a file on disk between two assertions with no rebuild
      (`apps/e2e/tests/remote-flows.spec.ts`, 7 tests).
      **The actual blocker was never transport.** MEASURED: a user who completed v1 of a flow never
      saw v2, because `start()` checks `isCompleted` before the version gate and completion was
      keyed on the flow id alone — `start()` returned silently, no render, no event. Completion is
      now `flowId@version`; `getCompletedFlows` still returns bare ids so the checklist projection
      and `@guideflow/ai` are unaffected. Sixth budget raise, 15 → 15.5 kB, measured at 15.13 kB.
      **`guideflow push` deleted** with `ora`: a dead default endpoint plus four measured defects —
      it printed `unknown` for every real `.flow.json`, reported a successful 204/empty-201 as a
      network error and exited 1, validated nothing, and its tests pinned a format `export` no
      longer writes. Cross-tab sync gained the version check its own comment assumed it did not
      need. New guide: `apps/docs/guide/hosting-flows.md`.
- [x] **7.10b `ProgressStore.clearCompleted(userId, flowId?)`** — "let this user replay this tour".
      Clears **every** version of the flow — asking for a replay means the tour, not one revision —
      and leaves dismissals, snapshots, targeting caps and checklist state alone, which is the whole
      reason it exists next to `resetUser()`. Removes the key rather than storing `[]`, because
      `_rawCompleted` returns `[]` for both and no consumer can tell them apart. Six tests, including
      the interior-`@` id spelling.
- [x] **7.10c Version-scoped dismissal** — **decided: no.** Dismissal stays keyed on the flow id.
      Completion is a statement about *content* ("I have seen all of this"), so new content justifies
      asking again; dismissal is a statement about *interruption* ("do not put this in front of me"),
      which editing the tour does not answer. Three things make leaving it safe rather than merely
      defensible: it is opt-in per flow (`persistDismissal`), `gf.progress.clearDismissed()` is a
      public one-line escape hatch for an author who knows their rewrite was material, and it carries
      none of the ordering harm that made completion's id-only key a bug. See **ADR-015**; the
      reasoning is in the source above `markDismissed`, and `progress-store.test.ts` pins it in both
      directions so it cannot be tidied into symmetry.
- [x] **7.10d `createTargeting().install()` re-scan** — fixed, and the ordering rule is gone. The
      candidate list is re-read inside `check()` and the observer is armed whether or not a selector
      flow exists yet; both halves were needed, and a probe measured each failing on its own.
      **Three more defects fell out of the same probe**, all now fixed and registered:
      `load` re-evaluated on `popstate` **only**, so a `history.pushState` — every React/Vue/Next
      route change — fired nothing while `targeting.md` claimed "on every route change";
      the `selector` trigger could start the **wrong flow**, because `evaluateFlow` is pure, has no
      document, and marks a selector flow eligible without asking whether *its* selector is present;
      and the observer never stopped, so closing a selector-started tour and mutating the DOM
      restarted it, indefinitely, unless a frequency cap happened to be set.
      The route fix imports `watchHistory` rather than hand-rolling a second one — 380 B, taken as
      **ADR-016**, moving the *targeting subpath* gate 2.5 → 2.75 kB with the **core entry
      untouched**. `apps/e2e/tests/targeting.spec.ts` proves the pushState and re-arm behaviour in a
      real browser; happy-dom's `pushState` does not move `location.href`, so a unit assertion there
      would have been testing the mock.
- [ ] **7.11 Ship a GuideFlow MCP server** — see `MCP-AND-SKILLS.md` section 3.

> **Budget note for whoever picks this up.** Core is at 14.13 kB / 14.5 kB. The projected remainder
> (7.1f + 7.3 + 7.4) is ~830 B, landing near 14.96 kB. **A raise to 15 kB will be needed, and it
> must land in the same changeset as the work that needs it, with an ADR and a real measurement** —
> ADR-009 deliberately did not raise it pre-emptively. The lever after that is splitting navigation
> and targeting into their own subpaths, which the design already assumes.

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
