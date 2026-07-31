# @guideflow/react

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

- 4981071: Fix the React adapter: one popover instead of two, real cleanup, and a peer-range change.

  **BREAKING — React 17 is no longer a supported peer.** The range is now
  `^18.0.0 || ^19.0.0`. `<GuidePopover>` already called `useId()`, which does not
  exist in React 17, so `react@17` threw `useId is not a function` on the first
  render — the declared support was never real, and nothing in CI ever installed
  React 17 to catch it. The hooks now also use `useSyncExternalStore`, another
  React 18 API.

  **`<GuidePopover>` no longer stacks a second dialog on top of core's.** Core's
  `DefaultRenderer` draws its own `role="dialog" aria-modal="true"` popover, so
  following `<GuidePopover>`'s own documented example painted two of them at the
  same position, with focus landing in one and the click handlers in the other.
  `@guideflow/react` now ships a **headless renderer** — a `RendererContract`
  implementation that publishes each step into a subscribable store instead of
  touching the DOM — and `<TourProvider>` gained a `renderer` prop to choose who
  draws:
  - `renderer="core"` (**the default — existing apps are unaffected**): core draws
    the popover and `<GuidePopover>` renders nothing, warning once in development.
  - `renderer="react"`: the provider passes the headless renderer to
    `createGuideFlow()`, so only `<GuidePopover>` draws. **It must be mounted in
    this mode**, or the tour shows a spotlight and no popover.

  A renderer can only be set when the instance is created, so combining
  `renderer="react"` with your own `instance` warns and falls back to core rather
  than silently doing the wrong thing. Build the instance with the new
  `createHeadlessRenderer()` and pass that object as `renderer` instead.

  **`<TourProvider>` now destroys the instance it created** when it unmounts,
  releasing core's document-level `keydown` listener and its popover DOM. An
  instance passed via the `instance` prop is left alone — the caller owns it.
  React 18 StrictMode's mount/unmount/remount is handled: the replacement instance
  is live.

  **`<GuidePopover>` rewritten.** It now renders `step.actions` (so custom FSM
  event buttons work), renders `step.media`, reads the instance's `gf.i18n`
  registry rather than the `defaultI18n` singleton, measures and positions in a
  layout effect before the first paint instead of flashing at the top-left corner,
  follows the target on capture-phase `scroll` as well as `resize`, moves focus
  into the dialog and restores it on close, and disappears while the tour is
  paused. Its final button dispatches `next`, which completes the tour, rather
  than `end`, which reports it abandoned. `content.html` is rendered as plain
  text: core's sanitiser is not part of its public API, and this component will
  not ship an unsanitised `dangerouslySetInnerHTML` path.

  **Hooks moved to `useSyncExternalStore`.** `useTour`, `useTourStep` and
  `<TourStep>` now share one subscription per instance, cannot tear under
  concurrent rendering, and provide a server snapshot. `useTour` gained
  `isPaused`, `pause()`, `resume()` and `skip()`, and `<TourStep>` /
  `useTourStep` now report a paused tour as inactive.

  **`useHotspot` returns a usable id.** It was written into a ref during an
  effect, so the caller only ever saw `null`.

  **`<ConversationalPanel>` no longer swallows failures.** In-flight answers are
  discarded when the panel unmounts, errors are logged with `console.error` and
  surfaced in the transcript, and the `highlights` the model returns are rendered
  as buttons that scroll the element into view instead of being stored and
  ignored. It also stops claiming `aria-modal="true"` for a panel that traps
  nothing.

  **`'use client'` is emitted** at the top of both bundles, so the package can be
  imported from a Next.js App Router Server Component boundary.

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
