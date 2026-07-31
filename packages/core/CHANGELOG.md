# @guideflow/core

## 0.2.0

### Minor Changes

- bbd09a8: Accessibility: focus management, live-region announcements, and honest progress counters

  **Focus.** The popover declares `role="dialog" aria-modal="true"`, which promises assistive
  technology that the rest of the page is inert — but Tab walked straight out of it into the dimmed
  page behind the overlay, and closing the tour dropped focus on `<body>`. Both `DefaultRenderer` and
  `<GuidePopover>` now trap Tab and Shift+Tab inside the dialog and hand focus back to whatever held it
  before the tour opened.

  **Announcements.** The popover element is reused across steps, so a screen reader saw no new node
  and read nothing; moving focus only read the focused button. Each step is now pushed into a polite
  live region that sits outside the popover.

  **Keyboard.** The document-level handler called `preventDefault()` on arrow keys with no check for
  what the user was actually typing into, so a caret could not move while a tour was running — worst
  on `clickThrough` steps, which exist precisely so the user can interact with the page. Arrow keys are
  now ignored when the event targets an input, textarea, select, `contenteditable`, or a widget role,
  during IME composition, when modified, or when another handler already claimed the key. Escape still
  closes the tour from anywhere, because it is a keyboard user's only way out.

  **Semantics.** `aria-labelledby` pointed at a `-title` element the renderer does not emit when a step
  has no title, leaving the dialog with no accessible name; it now falls back to a localised
  `aria-label`, and `aria-describedby` is dropped when there is no body. The progress bar announced
  `aria-valuenow="50"` — now it reports a step count with an `aria-valuetext` of "Step 2 of 4" and an
  accessible name.

  **Motion and contrast.** `prefers-reduced-motion` now disables the popover animation, the spotlight
  cutout transition, and the smooth scroll (the last two are set from script, so CSS alone could not
  reach them). `forced-color-adjust: none` has been removed from the forced-colors block, where it was
  opting the popover _out_ of the palette the user asked the OS for. Muted text moved from `opacity:
0.5` (3.4:1, failing WCAG AA) to a `--gf-muted-opacity` token at 0.72, and the default accent moved
  from `#6366f1` to `#4f46e5` because white on indigo-500 measures 4.46:1 against a 4.5:1 requirement.

  **RTL.** `rtl.css` carried three double flips that undid the browser's own correct mirroring — most
  visibly `flex-direction: row-reverse` on the action row, which put Back/Next back in left-to-right
  order for RTL readers. They are gone. The hint badge, positioned from script, is mirrored in JS.

  **Progress counters.** `totalSteps` and `currentStepIndex` counted the current _state_, not the flow,
  so a two-state tour reported "Step 1 of 1" in each state and the renderer drew a **Done** button on
  step one. They now count along the path a `next()`-only run actually takes, falling back to the
  current state's own numbers when the tour is somewhere that path does not reach.

  **Done button.** The last step's primary button dispatched `end`, which maps to `stop()` and reports
  the tour as _abandoned_ — so clicking Done never emitted `tour:complete`, never cleared the saved
  snapshot, and the tour reopened on the next visit. It now dispatches `next`, matching what
  `@guideflow/react` already did.

  The bundle budget for `@guideflow/core` moves from 13 kB to 14.5 kB gzip (measured: 13.91 kB). See
  ADR-008 for why this was taken rather than deferred.

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

- 37e9cb7: Fix seven defects that made documented behaviour fail.

  **Final states now render their steps.** `next()` and `send()` checked `isFinal`
  immediately after transitioning, so entering a state marked `final: true` ended
  the tour without ever showing that state's steps. The README quick-start
  displayed 1 of its 2 steps. A tour now completes when there is nothing left to
  render, not when it enters a final state.

  **Popover positioning works on scrolled pages.** `getViewportRect()` returned
  page coordinates while target rects are client-relative, so every fit test
  failed once the page was scrolled and the popover fell back to a clamped centre.
  It now returns client coordinates, matching `getBoundingClientRect()` and
  `position: fixed`. **Breaking if you called `getViewportRect()` directly** — use
  `getAbsoluteRect()` for page-coordinate maths. The popover also repositions on
  scroll and resize instead of drifting away from its target.

  **Persistence works end to end.** Resuming now re-renders onto the saved step
  instead of leaving the UI on step 0; completed tours are suppressed instead of
  replaying forever; progress is saved on `start()` and on abandon, not only after
  `next()`; cross-tab `BroadcastChannel` sync is created once per instance rather
  than only on the resume path (and ignores snapshots from other flows);
  `ttl: 0` means "never expires" as documented instead of expiring everything
  instantly; and a restored `stepIndex` is clamped, so tampered or stale storage
  can no longer leave an active tour with nothing to render.

  **Navigation crosses state boundaries.** `goTo(stepId)` finds steps in any
  state, and `prev()` steps back into the previous state instead of silently doing
  nothing. `prev()` at the very first step is now a no-op rather than re-emitting
  `step:enter` for the step already on screen. `showIf` is evaluated in the
  direction of travel, so Back no longer bounces forward past a hidden step. A
  transition naming a state that does not exist is rejected with a warning instead
  of leaving the machine frozen.

  **Per-instance i18n reaches the UI.** `DefaultRenderer` read the module-level
  `defaultI18n` singleton, so `gf.i18n.use('fr')` had no effect on rendered
  strings. Interpolation also replaces every occurrence of a token, not just the
  first.

  **Options that did nothing now work.** `clickThrough` actually lets clicks
  through (an inline `pointer-events` style was overriding the class);
  `overlayColor` and `animated` are honoured; per-step `padding` no longer leaks
  into subsequent steps; `configure()` applies `spotlight`, `context`, `debug` and
  `persistence` to the running instance instead of only `nonce`; and a custom
  `RendererContract` now receives `onInit`, `setI18n` and `setActionHandler` —
  previously all three ran only for the built-in renderer.

  **Attribute (Intro.js compat) tours work.** `scanAttributeTour` emitted one
  state per step, so every step reported "1 of 1": no Back button, no progress
  bar, and a Done button that ended the tour on step 1. All steps now live in one
  state. `watchAttributeTour` no longer re-triggers on GuideFlow's own DOM
  insertions, which restarted the tour in a loop.

  **New API.** `FlowDefinition.persistDismissal` opts a flow into "don't show
  again" (off by default); the `tour:dismiss` event distinguishes a user dismissal
  from a programmatic `stop()`; `skip()` is now declared on `GuideFlowInstance`
  (it was always reachable at runtime but missing from the type).

  The `@guideflow/core` size budget moves from 12 kB to 12.5 kB gzip to
  accommodate these fixes (measured: 12.13 kB).

### Patch Changes

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
