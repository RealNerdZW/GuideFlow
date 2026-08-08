# @guideflow/ai

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

- b5dd516: Security: replace the HTML sanitiser, escape attribute interpolations, and add
  privacy controls.

  **`@guideflow/core` — `content.html` is now genuinely sanitised.**

  The previous sanitiser was a regex denylist that a direct test defeated with 6
  of 8 trivial payloads: unquoted `javascript:` schemes, unclosed `<script>`
  tags, HTML-entity-encoded schemes, `xlink:href`, `style` URLs and mXSS via
  nested tags all passed through. Regex denylists run before the HTML parser, so
  they never see what the parser will actually produce.

  `content.html` is now parsed into an inert `<template>` and reduced to an
  explicit allowlist of elements, attributes and URL schemes. Anything
  unrecognised is dropped rather than patched, so an unanticipated vector fails
  closed. Anchors with `target="_blank"` gain `rel="noopener noreferrer"`.

  **This is a behaviour change.** Markup outside the allowlist — `<svg>`,
  `<iframe>`, `<style>`, `style=` attributes, custom elements — is now removed
  from `content.html` rather than passed through. Allowed: common text and
  structural elements plus `<a>`, `<img>` and tables. If you were relying on
  richer markup, render it with a custom `RendererContract` instead.

  `step.actions[].action` and `.variant` were also interpolated into HTML
  attributes with no escaping, so a flow loaded as JSON from a CMS or the CLI
  could break out of the attribute. Both are now escaped, along with i18n
  strings.

  The bundle grows to 12.62 kB gzip and the `size-limit` budget moves from
  12.5 kB to **13 kB**. That is deliberate and is recorded as ADR-007: a working
  XSS is not a defensible trade for 122 bytes.

  **`@guideflow/analytics` — consent, scrubbing and sampling.**

  Events carried the full `window.location.href` and `document.referrer` to
  third-party transports with no consent gate, scrubbing or opt-out. URLs are the
  most reliable PII carrier on the web.

  New `privacy` option on `AnalyticsCollector`, plus `collector.setConsent()`:
  - `urlMode` defaults to `'path'` — **query strings and fragments are now
    stripped**. Pass `'full'` to restore the old behaviour.
  - Do Not Track is honoured by default.
  - Sensitive property keys (`email`, `token`, `password`, `apikey`, …) are
    redacted, including inside nested objects.
  - `consent: false` collects nothing until `setConsent(true)`.
  - `sampleRate` decides once per session, so a sampled-out session emits no
    partial funnel.

  **`@guideflow/ai` — keys stay on your server, and pages can hold data back.**

  New `ProxyProvider` holds no credential: it POSTs to an endpoint you run, which
  keeps the API key server-side and can apply auth, rate limits and spend caps.
  It validates every response, so a compromised backend cannot inject arbitrary
  shapes into the tour engine. It is now the documented default, and every
  example that inlined a key into client code has been corrected.

  Constructing `OpenAIProvider` or `AnthropicProvider` with a key in a browser
  now logs a one-time warning explaining why that key is public. It does not
  throw — SSR, tests and Node scripts construct these legitimately.

  `serializeDOM()` now excludes any `[data-gf-private]` element and its subtree,
  and never describes a password input.

  See the new guides: `apps/docs/guide/ai-proxy.md` and
  `apps/docs/guide/privacy.md`.

- 84670f2: AI: structured outputs, timeouts, retries, capped detection, and intent triggers that actually start a tour

  **Structured outputs.** Every provider used to hand a raw completion straight to `JSON.parse`, with
  one sentence in the system prompt ("Always respond with valid JSON only — no prose, no markdown
  fences") as its only defence. Models ignore that routinely, and each provider's `catch` turned the
  resulting throw into an empty tour — silently. Providers now request structured output at the API
  level: `response_format: { type: 'json_schema', strict: true }` on OpenAI, a forced single-tool
  `tool_choice` on Anthropic, and a JSON Schema `format` on Ollama. Behind that sits
  `parseModelJson()`, which strips Markdown fences, extracts the first balanced JSON value from
  surrounding prose, and validates before anything reaches the engine — and now _warns_ when it cannot,
  instead of returning `[]` and leaving you to guess whether the page simply had nothing to tour.

  **Timeouts, cancellation and retries.** A grep for `signal`, `timeout`, `AbortController` and `retry`
  across the package used to return zero implementation hits outside `ProxyProvider`. Ollama's `fetch`
  had no signal at all, so an unreachable `baseUrl` left `generate()` pending forever. All four
  providers now accept `timeoutMs`, `signal` and `maxRetries`, retry only what is worth retrying
  (timeouts, network errors, 429/5xx), and never retry an abort you asked for. `GuideBrain.destroy()`
  cancels work already in flight rather than letting a slow provider resolve into a torn-down instance.

  **Capped detection.** `push()` ran on every click, input, keydown and scroll, and every 2-second lull
  issued a full provider round trip — so one stray scroll bought an LLM call, with no floor, no cooldown
  and no ceiling. Now `minEventsBeforeDetect` (5), `detectCooldownMs` (30s) and `maxDetectsPerSession`
  (20), with a high-water mark so the same events are never re-analysed. `gf.ai.stats` reports what has
  been spent. An explicit `detectIntent()` stays uncapped — that call is yours.

  **No more unhandled rejections.** `scheduleDetect` used `void this.detectIntent()`, which discards the
  promise without attaching a rejection handler; `detectIntent` re-throws after emitting `error`. An
  expired key, a rate limit or a network blip therefore became an unhandled rejection on a timer, which
  takes a Node process down outright.

  **Intent triggers.** `intent:detected` was emitted and connected to nothing, while the README and the
  intent guide both promised "automatically surfacing the right tour at the right moment". `createAI`
  now accepts `intentTriggers`, mapping a signal type and confidence floor to a flow. Opt-in and empty
  by default. Three behaviours are deliberate: a tour already on screen is never interrupted;
  `minConfidence` defaults to 0.7 so a failed detection (which falls back to `confidence: 0`) cannot
  fire a rule; and `once` defaults to true, because a tour that reopens every time the user looks
  confused _at the tour_ is a loop.

  **The Anthropic default model.** `claude-3-haiku-20240307` retired on 2026-04-19 and returns HTTP 404,
  so anyone following the documented setup got a 404 on every call. The default is now
  `claude-haiku-4-5`, and the two docs tables that repeated the stale id are corrected.

  **`@guideflow/core`:** `flowId` is now declared on `GuideFlowInstance`. It has always been reachable —
  `TourEngine` declares it on the prototype and the `Object.assign` literal does not shadow it — but the
  interface omitted it, so TypeScript consumers could not read which flow was running.

### Patch Changes

- 8dc6621: Correct the author identity shipped inside every package.

  The header block at the top of each package entry point named
  `github.com/johnmugabe` and a `@263tickets.co.zw` address, neither of which owns
  the repository or reads mail for it. Because `"files"` ships `src`, both strings
  went out inside the published tarballs. The headers now carry the owner from
  `repo.config.json` (`github.com/RealNerdZW`), and the `@email` line is gone —
  vulnerabilities are reported through GitHub Security Advisories, as `SECURITY.md`
  says.

  No runtime code changed.

- dc687bb: One selector engine, one flow file, one validator — and `guideflow studio` is gone

  ## `@guideflow/core/selector`

  There were **three** selector builders in this repo. All three trusted framework-generated ids, and
  **none of them ever re-queried to check the selector they had just built**. Measured in real
  Chromium, the recorder's copy pointed at the _wrong element_ for two entirely ordinary page shapes:

  | page shape                                       | before                                                                          | after                                           |
  | ------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
  | two buttons sharing `aria-label="Close"`         | `[aria-label="Close"]` — 2 matches, **highlights the wrong one**                | `#banner > button:nth-of-type(1)`               |
  | a sidebar and a main panel with matching nesting | 4-segment unanchored `:nth-child` chain — 2 matches, **highlights the sidebar** | anchored at `main`                              |
  | an icon inside a button                          | anchors the inner `<path>`                                                      | retargets to the button, `[data-testid="save"]` |
  | React `useId` (`#:r1:`)                          | emits it — valid today, dead next render                                        | rejects it, warns `generated-id`                |

  ```ts
  import { buildSelector } from '@guideflow/core/selector'

  const { selector, confidence, unique, warnings } = buildSelector(el)
  ```

  Strategies are ranked `data-gf-id` → test ids → a stable `id` → form `name` → `aria-label` → `href`
  → an anchored structural path, and **every candidate is verified by re-query before it is
  accepted**. `unique: false` means nothing resolved — an authoring UI must refuse the step rather
  than ship a selector that points somewhere else.

  Also new: `[data-gf-id]` as a documented opt-in anchor that wins outright, `data-gf-private` now
  redacts ids and test ids (it used to leak both), and shadow-DOM elements return `unique: false` with
  a `shadow-dom` warning instead of a selector `document.querySelector` can never resolve.

  ## `@guideflow/core/authoring`

  Runtime validation of a flow was **one check in the entire library** — `flow.initial in flow.states`
  — so every other way of getting a flow wrong failed at your users. The worst of them failed _as
  success_.

  ```ts
  import { validateFlow } from '@guideflow/core/authoring'

  const { valid, errors, warnings } = validateFlow(JSON.parse(text))
  ```

  Around thirty rules, each grounded in behaviour **measured against the real engine**, with a `hint`
  naming the fix. Every severity is pinned by a test that asserts the engine behaviour _and_ the
  verdict about it, so the rule table cannot drift from the engine.

  ⚠️ **A correction.** The docs have said since 0.1.x that a flow with no `final: true` state "never
  completes". **It completes normally** — `tour:complete` fires and `isActive` goes false. So that is
  a _warning_, not an error. What is an error is a transition naming a state that does not exist: the
  tour truncates **and is recorded as completed**, so it never shows that user again.

  ## One flow file

  `{ gfFlowFile: 1, flow, meta? }`, with one writer and one reader. Four mutually incompatible things
  called "export" collapse to one.

  ```ts
  import doc from './tours/welcome.flow.json'
  await gf.start(doc.flow) // no loader needed — a flow is a plain object
  ```

  `stringifyFlowFile` stamps a structural `version` unless you set one, and **throws** if the flow
  carries a function, a `RegExp` or a `Date` — a file that silently dropped a `showIf` would mean
  something different from the flow it came from.

  ## `guideflow validate`

  ```bash
  guideflow validate 'src/tours/*.flow.json'
  ```

  Exit 0 on warnings, 1 on errors, `--strict` to fail on warnings too. It catches a recorded React
  `useId` selector with no browser at all, which is the point of running it in CI.

  ## `guideflow export`, rewritten

  JSON only. It validates on the way through and **refuses to write an invalid flow**. Output is
  always pretty-printed (`--pretty` is now an accepted no-op) because a minified flow file in a pull
  request is unreviewable.

  **Breaking:** the `.ts` / `.js` path is deleted. It regex-matched your source, wrote
  `{ _note, rawSnippet }` — a truncated 500-character slice of your own file, not a flow — printed a
  green success and exited **0**. `guideflow push` would then upload it. It now errors, exits 1, and
  prints the three lines to use instead.

  ## `guideflow studio` is deleted

  **Breaking.** It served your project with Vite and injected `window.__GUIDEFLOW_DEVTOOLS__`, a global
  nothing has ever read. The `vite` optional peer dependency goes with it. `@guideflow/cli` now
  depends on `@guideflow/core`.

  ## Sizes

  `@guideflow/core`'s entry bundle is **unchanged at 14.96 kB / 15 kB** — neither subpath is imported
  by it. Seven bundles are now gated independently: core 14.96/15 kB, `./targeting` 2.18/2.5,
  `./selector` 1.76/2.5, `./navigation` 1.55/2, `./authoring` 5.3/5.5, `./html` 767 B/1 kB,
  `./versioning` 336 B/500 B.

  `./authoring` is the largest subpath and is authoring-time only — it never reaches an app bundle.
  Its gate is set from a measurement: stripping every `message` and `hint` in the file saves 880 B, so
  the weight is rules, not prose, and the hints are the deliverable.

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
