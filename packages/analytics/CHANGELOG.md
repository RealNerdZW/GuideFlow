# @guideflow/analytics

## 0.2.0

### Minor Changes

- b81409f: A/B variants can finally change a tour — and the bucketing that made them meaningless is fixed

  ## `startVariant()`

  `ExperimentEngine` has always assigned variants, and `Variant<T>` has always been generic — so
  `value` could always have been a whole `FlowDefinition`. What did not exist was any way to act on the
  result and record that the user saw it. The module docstring showed `createGuideFlow({ theme })`,
  which has never type-checked, and the A/B docs page then said applying the variant was "application
  code" — which was true, and was the bug.

  ```ts
  import { startVariant } from '@guideflow/analytics'

  await startVariant(
    gf,
    engine,
    {
      id: 'onboarding-shape',
      variants: [
        { id: 'control', value: shortFlow },
        { id: 'treatment', value: longFlow },
      ],
    },
    { collector },
  )
  ```

  Assigns, starts the flow the variant names, emits `guideflow.experiment.exposed`. The variant value
  can also be a registered flow id — it is exactly `gf.start()`'s parameter type, so no map is needed.

  Returns `null`, starting and emitting nothing, in two cases: a tour is **already running** (starting
  a second ends the first, which emits `tour:abandon` and would be recorded as the user giving up), or
  `gf.start()` **declined** — unknown id, dismissed, already completed. Exposure is recorded only for
  users who actually saw a tour, or the experiment's denominator is wrong.

  **Zero bytes reach `@guideflow/core`.** This package still imports core by type only.

  ## The bucketing was statistically broken

  ⚠️ **Assignments change.** An experiment already in flight will re-bucket its users; start a fresh
  experiment id rather than reading results across the boundary.

  Assignment was `djb2(userId + ':' + experimentId) % totalWeight` — for the common two-arm case,
  `% 2`, which is the low bit of djb2. That bit is the parity of the XOR chain over the input, so
  changing only the experiment id shifted it by a constant. Measured over 10 000 synthetic ids:

  | pair                                  | agreement  |
  | ------------------------------------- | ---------- |
  | `exp-one` vs `exp-two`                | **100.0%** |
  | `tour-theme-2024` vs `cta-experiment` | **0.0%**   |

  Every experiment's _marginal_ split was a clean 50/50, which is exactly why this survived — every
  obvious test passes. Only the joint distribution was degenerate, and a user in the treatment arm of
  every concurrent experiment makes the results of all of them uninterpretable.

  Now FNV-1a with a murmur3 avalanche step, bucketed over a fixed 10 000-slot space rather than
  `totalWeight`. Measured agreement is 49–50% across every pair tested, and a 9:1 weight split is now
  expressible at all.

  ## `AnalyticsCollector.track()`

  `send()` is private and is the only path through `PrivacyPolicy` — consent, Do-Not-Track, sampling,
  URL scrubbing, key redaction. `track(event, properties)` is the public door onto it, so a custom
  event goes _through_ that pipeline rather than around it.

  ## `theme` on `GuideFlowConfig`

  Five themes ship in `@guideflow/core/styles` and nothing in the library ever set the `data-gf-theme`
  attribute they key on — a documented feature that did nothing.

  ```ts
  createGuideFlow({ theme: 'bold' }) // or configure({ theme }) at any time
  ```

  Set on `<html>`, not the popover: the spotlight overlay, hotspot beacons and hint badges are all
  portalled to `document.body` and read the same custom properties, so only the root themes every
  surface. An empty string removes it; leaving it `undefined` never touches the attribute, so a host
  page that sets its own theme is not clobbered.

  ## `StepAction.action` accepts a custom event

  It was typed `… | (string & object)`, and **no string literal satisfies `string & object`** — so
  `{ action: 'my-custom-event' }` was a type error and core's own documented escape hatch could not be
  expressed at all. `@guideflow/react`'s tests carried a cast to work around it. Now
  `string & Record<never, never>`, and the cast is gone.

  ## Build fix

  `packages/core/tsup.config.ts` grew to five configs across Phase 7, and the first still carried
  `clean: true`. tsup runs them concurrently, so that clean raced the subpath builds and intermittently
  deleted their `.d.ts` files — with no build error. `scripts/verify-pack.mjs` caught it, which is what
  it exists for. `dist/` is now removed once, up front, by the build script.

  `@guideflow/core` measures **14.96 kB against a 15 kB limit**.

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

- 07b094b: **Deep links: `?gf_tour=<id>` starts a named tour in the app the recipient already has.**

  The only part of the demo-automation distribution layer that transfers to an embedded library, and
  it is cheap because our audience is already inside the product. A support agent pastes a link into a
  Zendesk reply; the customer opens it and the guide runs in their own application. No clone, no
  hosting, no share page — and it makes the Zendesk / Intercom / GitBook integration row real without
  writing a single integration, because they all accept a URL.

  ```ts
  gf.createFlow({ id: 'add-payment-method', targeting: { deepLink: true } /* … */ })
  createTargeting(gf).install() // reads the URL before its `load` trigger
  ```

  Opt-in per flow: a URL is attacker-controlled and the recipient is signed in, so the bounded
  exposure is _which_ of your own tours a link can start. A link overrides **delivery** policy —
  frequency caps, `urlPattern`, and a previous completion or dismissal — but never **eligibility**
  policy: `audience` and `schedule` still decide who a tour is for.

  **`gf.start(flow, ctx, { force: true })`** is new and public. `start()` refuses a tour the user
  completed or dismissed, silently, which would make a support link do nothing for exactly the people
  it is sent to. `force` skips those two checks and writes nothing — deliberately not
  `progress.clearCompleted()`, which would visibly un-tick `@guideflow/checklist`, since that projects
  `getCompletedFlows()`. Replaying a tour must not cost someone progress they earned. A "Show me
  again" button in your own UI wants the same thing.

  Targeting subpath 2.75 → 3 kB, measured 2.83 kB (ADR-021). Core entry 15.3 / 15.5 kB — only `force`
  touched it.

  **`computeFunnel(events)` in `@guideflow/analytics`: per-step drop-off, as a pure function.**

  ```ts
  const [funnel] = computeFunnel(events)
  funnel.completionRate
  funnel.steps.filter((s) => s.dropOffRate > 0.3) // where the tour loses people
  ```

  The collector already emits everything a funnel needs and leaves the arithmetic to the host — right
  for a library with no backend, but it meant everyone wrote the same reduction. No storage, no
  network, nothing reaches core. It counts `unfinished` apart from `abandoned` (a closed tab is not a
  user giving up), sorts by timestamp first so a merged multi-transport stream is not mis-attributed,
  and reports median dwell rather than mean so one idle tab cannot move it.

  **Step events now carry `flow_id`.** `guideflow.step.viewed`, `.exited` and `.skipped` shipped with
  `flow_id: undefined`, because the engine puts only a `stepId` on them. A step id is unique only
  _within_ a flow, so every dashboard had to infer the flow from surrounding `tour.started` events and
  hope the stream was in order. The collector tracks the running flow now; a step with no tour open
  still reports `undefined` rather than a guess.

### Patch Changes

- 80e9a95: Widen the `@guideflow/core` peer range so it survives a 0.x minor.

  The peer was pinned to `^0.1.9`. On a `0.x` version a caret range is confined to
  `0.1.x`, so the very next core minor — `0.2.0` — fell outside it. Two things
  followed from that.

  Consumers on core `0.2.0` would have hit an unmet-peer error, which pnpm and
  yarn treat as a hard failure rather than a warning.

  And because Changesets bumps a peer dependent whenever the peer range goes out
  of range, every core minor forced a **major** bump here: `0.1.9` → `1.0.0`, then
  `2.0.0`, and so on, none of which described a real breaking change in this
  package.

  The range is now `>=0.1.9 <1.0.0` — every `0.x` core satisfies it, and core
  `1.0.0` will not, which is the point at which the peer contract genuinely needs
  revisiting. Paired with `onlyUpdatePeerDependentsWhenOutOfRange` in the
  changesets config, a core minor now moves this package by a patch through the
  normal dependency rule instead of majoring it.

  No runtime behaviour changes: `@guideflow/core` is a types-only dependency here
  — the built ESM and CJS bundles contain no import of it, only the emitted
  `.d.ts` does.

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
