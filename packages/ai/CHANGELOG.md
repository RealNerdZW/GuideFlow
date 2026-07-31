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
