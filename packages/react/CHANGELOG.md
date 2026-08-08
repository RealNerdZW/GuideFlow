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

- 463b07d: **Focus belongs to whoever last claimed it, and a finished tour now says so.**

  Three accessibility defects, all of which became reachable rather than theoretical once `advanceOn`
  let a step advance because the user acted.
  - **The renderer no longer steals focus on every render.** It focused the popover's first control
    each time, and document order puts the header close button first — so advancing while the user was
    typing moved focus there, and their next **space** keystroke ended the tour. Focus now moves only
    when the tour is opening, when it is already inside the popover, or when it is nowhere. Pressing
    Next is unchanged. WCAG 3.2.2.
  - **Focus is restored only when the tour had it.** Ending a tour used to hand focus back to a
    control captured before it started — even when the app had deliberately focused something of its
    own in response to the step's action, such as a confirm dialog. WCAG 2.4.3.
  - **Completion is announced.** It was silent twice over: `Locale` had no completion string, and the
    live region was removed in the same tick that a pending announcement was scheduled for, so the
    utterance landed in a detached node. `Locale` gains `tourComplete` (twelve keys now), and
    `RendererContract.hideStep` gains an optional `reason` — `'complete'` is passed only on the
    completed path, because `hideStep` also runs on pause, abandon and dismissal, where an
    announcement would be noise.

  Both focus rules read `document.activeElement` _before_ the DOM changes; reading afterwards cannot
  tell "the tour had focus" from "the app has focus".

  The two focus fixes are mirrored in `@guideflow/react`, which had them identically. The completion
  announcement is core-renderer only for now — React's live region unmounts with the popover.

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

- 4bfc44a: SPA route-change handling — a tour can finally span two routes

  This was the last open P0 and the roadmap's highest single-item impact. A grep for `popstate`,
  `pushState`, `hashchange`, the Navigation API or any router integration across the monorepo returned
  zero hits: the engine resolved each step's target once with `querySelector`, waited 150 ms, and
  rendered. A step whose target lived on `/settings` while the tour started on `/dashboard` resolved to
  null and rendered as a centred modal with no spotlight — and said nothing about why.

  ```ts
  import { createGuideFlow } from '@guideflow/core'
  import { createNavigation } from '@guideflow/core/navigation'

  const gf = createGuideFlow({ navigation: createNavigation() })

  gf.start({
    id: 'onboarding',
    initial: 'dashboard',
    states: {
      dashboard: { route: '/dashboard', steps: [...], on: { NEXT: 'settings' } },
      settings:  { route: '/settings/**', steps: [...], final: true },
    },
  })
  ```

  **`route` goes on the state, not the step, and not on a transition.** The step counters walk the
  flow's `NEXT` path; a `ROUTE` transition would put the target state off that path and revert the
  counters to per-state numbering — which used to put a **Done** button on step one of a two-state
  tour. On the state, `prevStep()` already crosses state boundaries via history, so Back across a route
  works with no extra code.

  **The page stays clickable while waiting.** The spotlight drops for the duration, which also drops
  pointer capture. A user waiting to reach `/settings` has to be able to click the nav link — a modal
  that blocks the navigation it is waiting for can never succeed. The popover is marked `aria-busy`
  _without_ unmounting, so focus and the live region survive, and it keeps showing the previous step
  until the new one can be anchored properly.

  **`isWaiting` is separate from `isPaused`.** Reusing pause would make `pause()` a silent no-op
  mid-wait, let `resume()` start a second waiter, and kill Escape exactly when the user most wants out.
  `isActive` stays true and `isPaused` stays false throughout. React, Vue and Svelte all expose it.

  **The engine has no timeout policy.** On expiry it emits `step:timeout` and renders unanchored — it
  does not skip and does not end. Compose yours: `gf.on('step:timeout', () => void gf.next())`.

  **Router integration without patching anything.** Pass `subscribe` and GuideFlow never touches
  `history` — the recommended path for React Router, Next, Vue Router and SvelteKit, all of which patch
  it themselves. The built-in fallback prefers the Navigation API (so it patches nothing on Chromium),
  wraps cooperatively where it must, and on teardown restores the original _only_ if its own wrapper is
  still outermost — ripping it out unconditionally would delete a patch installed on top of it.

  Also in this release:
  - **`waitForTarget`** per step, or a default via `createNavigation({ waitForTarget })`. A route
    change is only one of five reasons a selector misses; lazy chunks, Suspense, portals and drawers
    are the others, and one code path covers them all. `waitForElement` is exported standalone and
    needs no adapter — the shepherd.js `beforeShowPromise` equivalent.
  - **`Step.target` accepts a function**, resolved lazily at render time and may be async. Its declared
    type also widens from `HTMLElement` to `Element` — the runtime guard has always been
    `instanceof Element`, so SVG targets already worked and the type was simply wrong.
  - **`step:target-missing`** fires whenever a step declared a target and got nothing, with or without
    an adapter. That case used to be indistinguishable from a deliberate `target: null` step.
  - **`rerender()`** and **`isWaiting`** are now declared on `GuideFlowInstance`. `rerender()` was
    always reachable; the interface just never said so.
  - **Progress is saved when the machine moves, not when the render lands.** With a route wait the
    render can take seconds, and a tab closed mid-wait used to lose the advance entirely.
  - **`configure({ navigation })`** replaces the adapter and destroys the old one — by identity, so
    passing the same adapter twice does not tear down the one still in use.

  The `@guideflow/core` budget moves from 14.5 kB to 15 kB (measured: 14.72 kB). The seam is 590 B of
  engine and cannot be opt-in — a `TourEngine` that cannot wait cannot be taught to from outside. What
  _is_ optional is the 1.55 kB of route matching, element polling and history watching, and that lives
  in `@guideflow/core/navigation`. See ADR-010.

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

- c994a5b: **`clickThrough` steps are reachable by keyboard.**

  ADR-004 carved a `clip-path` hole in the overlay so one element stays live to the mouse. The
  renderer meanwhile trapped `Tab` inside the popover and set `aria-modal="true"` on every step,
  including those — so a step saying "click Save" was followable with a mouse and impossible with a
  keyboard, and the accessibility guide was telling authors to make the target Tab-reachable when it
  could not be. `advanceOn` turned that from a wart into a defect: a tour that advances _because_ the
  user acted strands anyone who cannot act.

  On a `clickThrough` step the focus trap now widens to popover ∪ target, and `aria-modal` is dropped
  because the page provably is not inert. The same hole, cut in the tab order. It is exactly one
  element — everything else behind the overlay stays trapped.

  Mirrored in `@guideflow/react`'s `GuidePopover`, which had both defects identically. A **function**
  target is async and so keeps the popover-only trap, matching `DefaultRenderer`.

  Five e2e cases cover it, including the negative — an ordinary step must keep `aria-modal` and the
  tight trap. None of it is observable in happy-dom, where `offsetParent` is null for everything and
  the trap has nothing to iterate.

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
