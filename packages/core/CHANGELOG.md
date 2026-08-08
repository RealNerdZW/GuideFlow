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

- 301ed81: Republishing a tour now reaches the people who already finished the old one — and `guideflow push` is gone

  ## The bug that made "edit and republish" pointless

  A user who completed v1 of a flow **never saw v2**, however much v2 changed.

  `start()` checks `isCompleted` _before_ the version gate, and completion was
  recorded against the flow id alone. So `start()` returned silently: no render, no
  event, nothing in the console. Republishing an edited tour reached only the users
  who had never finished it — which is the opposite of who you are usually editing
  it for.

  Completion is now recorded against the version the user actually finished:

  | You change                         | A user who left mid-tour          | A user who already finished |
  | ---------------------------------- | --------------------------------- | --------------------------- |
  | A title, a body, a target          | **Resumes where they were**       | Does not see it again       |
  | A step added, removed or reordered | Restarts, with `progress:discard` | **Sees the new tour**       |

  Both rows are what you want, and you get them for free — `flowFingerprint`
  hashes structure and deliberately ignores copy, so fixing a typo interrupts
  nobody.

  `ProgressStore.markCompleted` and `isCompleted` take an optional `version`.
  `getCompletedFlows` is unchanged: it still returns bare flow ids.

  ⚠️ **A completion record written before this release suppresses every version of
  that flow**, because there is no way to know which one it meant. Nothing migrates
  and nothing is lost; the first _new_ completion is version-scoped.

  ## Hosting flows without a code deploy

  New guide: **[Hosting flows](https://realnerdzw.github.io/GuideFlow/guide/hosting-flows)**.

  ```ts
  import { parseFlowFile } from '@guideflow/core/authoring'

  const parsed = parseFlowFile(await (await fetch('/tours/welcome.flow.json')).text())
  if (parsed.valid && parsed.flow) {
    gf.createFlow(parsed.flow)
    await gf.start(parsed.flow.id)
  }
  ```

  That is the whole API, and it already shipped. **There is deliberately no
  `loadFlows()`** — a `.flow.json` is a static asset, your app already owns `fetch`
  with its auth and retries, and wrapping it would reimplement the HTTP cache while
  pulling the validator into your production bundle. Serve the file with
  `Cache-Control: no-cache` and an `ETag`; edits go live on the next revalidation.

  The one rule for whatever serves it: **do not rewrite `flow.version`.** A CMS's
  instinct to stamp a revision on every publish would discard every user's resume
  point on every copy edit.

  ## BREAKING: `guideflow push` is deleted

  _(Released as a **minor** bump, not a major: this repository is pre-1.0 and its convention is that
  a breaking change at 0.x takes a minor plus a loud entry — which this is. The packages move as one
  fixed group, so a major here would have taken all twelve to 1.0.0, and
  `PRODUCT-ROADMAP.md`'s own definition of 1.0 is not met.)_

  Not deprecated — deleted, along with the `ora` dependency.

  Its default endpoint was a service that has never existed, and it carried four
  measured defects: it printed `unknown` for every real `.flow.json` (it read `.id`
  off the envelope, which has none); a `204` or an empty `201` from your own server
  was reported as a **network error** and exited 1; it validated nothing, so it
  would happily upload a flow the engine truncates; and its tests pinned a format
  `guideflow export` no longer writes.

  Publishing a static file needs no bespoke command:

  ```bash
  guideflow validate 'tours/*.flow.json' --strict
  aws s3 cp tours/ s3://my-bucket/tours/ --recursive --cache-control no-cache
  ```

  ## Also

  Cross-tab progress sync now compares flow versions. Its previous reasoning —
  "both tabs are the same build, so a mismatch is impossible" — held only while
  flows shipped inside the bundle; a flow fetched at runtime falsifies it.

  ## Size

  `@guideflow/core` measures **15.13 kB against a raised 15.5 kB limit**. The
  version-scoped completion costs ~200 B. That is a sixth budget raise and it has
  an ADR (ADR-014) rather than being absorbed quietly.

- cb7169d: **`advanceOn`: let a tour advance when the user actually does the thing.**

  ADR-004 spent ~1.3 kB carving a `clip-path` hole in the overlay so a `clickThrough` step lets the
  user click the control it highlights — and the engine attached exactly one listener, `keydown` on
  `document`, and nothing on the target. So the user clicked, the app responded, and the step waited
  for **Next**. Shepherd ships `advanceOn`; driver.js ships `onNextClick`; this had neither.

  ```ts
  import { advanceOn } from '@guideflow/core/navigation'

  const stop = advanceOn(gf, {
    save: 'click',
    name: { event: 'input', when: (e) => (e.target as HTMLInputElement).value.length >= 3 },
    plan: { event: 'change', action: 'CHOSE_PLAN' }, // send(), so a branching state can route
  })
  ```

  Capture-phase delegation, so an app handler calling `stopPropagation()` cannot silently kill it. One
  rule fires once. `next()` and `send()` only — never `end`, which would file every successful finish
  as an abandonment in analytics.

  Zero bytes in the core entry (measured unchanged at 15.29 kB). The navigation subpath gate moves
  2 → 2.5 kB, measured 2.19 kB — ADR-020, following ADR-016's pattern of charging an opt-in bundle.

  **Known limitation:** the renderer traps focus in the popover and sets `aria-modal` on every step, so
  a `click` rule is mouse-only today. For anything that must be accessible, have your app dispatch its
  own event and match on that. Widening the trap for `clickThrough` steps is tracked separately.

  **`exposeGlobal`: let the devtools extension find your app.**

  The panel detects a page through `window.__guideflow`, and no package ever set it — only the demo
  did, so the extension reached essentially no real application.

  ```ts
  const gf = createGuideFlow({ exposeGlobal: import.meta.env.DEV })
  ```

  Off by default and it must stay that way: the global hands any script on the page a driveable tour
  instance, and because the instance is an event emitter, one line of third-party script can mark a
  tour completed in storage permanently. `configure({ exposeGlobal: false })` is a real kill switch,
  and `destroy()` clears the global only if it still points at that instance.

- a49e235: Flow versioning, and targeting / scheduling / frequency capping

  ## Flow versioning

  A stored `{ state, stepIndex }` is a coordinate into a structure. Rename a state, delete a step or
  reorder two, redeploy — and every returning user was restored into a position that no longer meant
  what it did when it was written. `restore()` did not check step identity at all.

  Two independent gates now, cheapest first:
  - **`stepId` is preferred over `stepIndex`** on every snapshot. An index means nothing once a step
    has been inserted above it. A stored id that no longer exists is a **rejection**, not something to
    clamp — there is no honest coordinate to fall back to.
  - **`FlowDefinition.version`** catches everything else, including a renamed state. Set it by hand, or
    derive it from the flow's own shape:

    ```ts
    import { withFingerprint } from '@guideflow/core/versioning'
    const flow = withFingerprint({ id: 'onboarding', initial: 'intro', states: { … } })
    ```

    `flowFingerprint` hashes `initial`, state names, `final` flags, step ids **in order**, and the
    transition table. It ignores content, target, placement, padding, media, `showIf`,
    `onEntry`/`onExit`, `context`, `targeting` and the flow id — so fixing a typo does not restart
    anybody's tour.

  A discarded snapshot emits `progress:discard` with `reason: 'version' | 'structure'`, so you can tell
  "I changed the flow" from "the position did not survive".

  `FlowMachine.restore` also now **refuses a state with no steps**. It used to return `true`, leaving
  `isActive === true` with nothing painted.

  Not closed, and worth knowing: `isCompleted` stays version-blind (keyed on flowId alone, with no
  `clearCompleted`), so shipping v2 will never re-show a flow to anyone who completed v1.

  ## Targeting, scheduling and frequency capping

  There was no `audience`, `urlPattern`, `trigger` or `priority` field anywhere on `FlowDefinition`, and
  no rule evaluator. `ProgressStore` was strictly per-flow: no global "last shown at", no session
  counter, no cooldown, no queue when two flows both wanted to start.

  ```ts
  import { createTargeting } from '@guideflow/core/targeting'

  gf.createFlow({
    id: 'billing-tour',
    targeting: {
      startTrigger: 'load',
      urlPattern: '/billing/**',
      audience: { where: { plan: 'pro' }, flags: ['billing-v2'] },
      schedule: { startsAt: '2026-08-01T00:00:00Z' },
      frequency: { maxPerSession: 1, cooldownMs: 7 * 24 * 3600_000 },
      priority: 10,
    },
    initial: 'main',
    states: { … },
  })

  createTargeting(gf, { globals: { maxPerSession: 1 } }).install()
  ```

  **Data in core, policy in the subpath.** `FlowDefinition.targeting` is types only — zero runtime
  bytes — so a flow stays a plain serialisable object a CMS can store. The rules that act on it live in
  `@guideflow/core/targeting` and hook through existing public seams. The one core addition is
  `ProgressStore.getRecord`/`setRecord`, which puts cap state under the same prefix `resetUser()`
  already sweeps.

  Targeting is the **third scope of a guard the state machine already has**: `FlowTransition.guard`
  gates a transition, `Step.showIf` gates a step, `targeting.audience` gates entering the flow. Same
  context, same predicate shape.

  Because every rule compiles to the same shape, an evaluation names the guard that rejected:

  ```ts
  await targeting.evaluate()
  // [{ flow, eligible: false, priority: 10, blockedBy: ['url'] }, …]
  ```

  Details that carry the design:
  - **Guard order is load-bearing** — everything free is checked before anything that reads storage, so
    a `selector` trigger firing on every DOM mutation does not issue a storage read per mutation.
  - **A throwing audience predicate means "not eligible"**, not a crash. Deliberately unlike
    `Step.showIf`, whose predicate throws outside the engine's error boundary: targeting evaluates
    _every_ registered flow, so one bad rule must not take the rest down.
  - **Shows are counted on `tour:start`**, not when `gf.start()` resolves — `start()` can return
    without starting, and a manual start elsewhere in your app should still count against a global cap.
  - **A running tour is never interrupted.** `autoStart()` returns `null` when `gf.isActive`, because
    starting a second tour ends the first and emits `tour:abandon`.
  - **A session is a 30-minute idle gap** derived from the show history. No `sessionStorage`, no stored
    session id — SSR-safe and shared across tabs for free.
  - **`anonymousId` is off by default.** Turning it on makes GuideFlow persist a first-party
    identifier, and core cannot consult `@guideflow/analytics`'s consent and Do-Not-Track policy
    because core never imports a sibling. Without it, frequency caps are skipped and everything else
    still applies.

  Known limitation, documented: the cap record is a read-modify-write over an async driver with no
  lock, so two tabs starting tours in the same instant can lose one increment.

  Also: `gf.context` is now on `GuideFlowInstance` — the running machine's context while a tour is
  live, the configured default otherwise.

  Sizes, each gated independently: `@guideflow/core` **14.93 kB / 15 kB**, `./targeting` 2.18 kB,
  `./navigation` 1.55 kB, `./html` 767 B, `./versioning` 336 B.

- d01266d: **Variables, content localisation and chapters — one content pipeline.**

  `Step.content` has always accepted a function, so a tour written _in code_ could
  personalise and localise itself. A function does not serialise, so the moment a tour lived in a
  `.flow.json` — what the recorder, the MCP server and `guideflow export` all produce, and what the
  whole static-asset delivery model is built on — its copy was frozen in one language with no
  variables, and changing a word needed a deploy. `I18nRegistry` translated eleven chrome strings and
  nothing else.

  ```jsonc
  {
    "id": "welcome",
    "content": { "title": "Welcome back, {{firstName}}", "body": "On the {{plan|free}} plan." },
  }
  ```

  ```ts
  gf.i18n.registerContent('es', {
    steps: { welcome: { title: 'Bienvenido de nuevo, {{firstName}}' } },
    states: { billing: 'Facturación' },
  })
  ```

  ```jsonc
  {
    "states": {
      "billing": {
        "label": "Billing",
        "steps": [
          /* … */
        ],
      },
    },
  }
  ```

  One pipeline, in the engine, in this order: **content → locale catalogue → `{{token}}` →
  renderer**. That order is why the three shipped together — a _translated_ string containing
  `{{firstName}}` only resolves if the catalogue is applied first. Resolution happens before
  `renderStep`, so a custom `RendererContract` receives finished content and needs to know none of it
  exists.

  The catalogue sits beside the flow rather than inside `StepContent`: a `.flow.json` is unchanged, a
  translator gets a file of strings instead of your state machine, and untranslated keys fall through
  per field so a partial translation degrades one string at a time. `steps` and `states` are separate
  maps because step ids and state ids are separate namespaces.

  **`content.html` is deliberately not interpolated.** "Interpolate then sanitise" is safe for element
  content and not for attribute context — in `<a href="/r?next={{to}}">` a value carrying a quote
  closes the attribute before the sanitiser parses anything. The catalogue may still translate `html`,
  because a translation file is the same trust level as the flow file beside it. The rule is about
  where data came from, not which field it is in.

  `RendererContract.renderStep` gains an optional fifth argument, the chapter label. Additive — a
  renderer that ignores it still satisfies the interface.

  **Core got smaller, not bigger: 15.3 → 15.11 kB.** The pipeline costs ~380 B; minifying the four
  injected CSS blocks at build time gives ~570 B back — for the size gate _and_ for every consumer's
  bundle. The stylesheets stay readable in source; only the emitted bytes shrink. No budget raise
  (ADR-022, which also records the ~1 kB "saving" that was measured, found to be worth three bytes to
  a real consumer, and declined).

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

- 42412fb: Target-only interaction, and `content.html` sanitisation moves to an opt-in subpath

  **`clickThrough` now exposes the target, not the whole page.** ADR-004 recorded this as a known
  limitation: the overlay was a single full-viewport div, so `clickThrough: true` dropped pointer
  capture entirely and made everything interactive. "Let the user actually click the button I am
  pointing at" — the one thing the option is named for — was unimplementable. The overlay now carves a
  real hole with `clip-path`, and clipping affects hit-testing, so a click inside the hole reaches the
  page while everything outside stays captured. One element and one style assignment; the four-panel
  arrangement other libraries use costs several hundred bytes more and buys nothing here.

  The square corners of the hole do not follow the cutout's `border-radius`, so a few pixels at each
  corner are interactive but visually dimmed. Rounding them needs `clip-path: path()` with arcs, which
  costs more than the mismatch is worth at a 4px default radius.

  **`content.html` needs an opt-in import.** This is a **breaking change** if you use it:

  ```ts
  import { createGuideFlow } from '@guideflow/core'
  import { sanitizeHTML } from '@guideflow/core/html'

  const gf = createGuideFlow({ sanitizeHTML })
  ```

  Without it, `content.html` is escaped and rendered as **text**, and the renderer warns once telling
  you why. Passing it through unsanitised would be an XSS hole; dropping it would be a blank popover
  with no explanation. `content.body` is unaffected — it is plain text, escaped by the renderer, and
  never touched the sanitiser.

  The sanitiser is ~420 B gzip that every consumer was paying for, including the majority who only use
  `content.body`. ADR-008 named moving it out as the precondition for any further budget raise; this
  discharges that condition. `@guideflow/core` measures **14.13 kB** against an unchanged 14.5 kB
  limit, and `@guideflow/core/html` is a further 767 B only if you import it.

  Also: `flowId` is now declared on `GuideFlowInstance`, and the dead `.gf-clickthrough` and
  `[data-gf-overlay] svg` rules are gone (the latter was left over from an SVG-mask implementation
  that has not existed for some time).

- c8bcaa7: **`gf.repaint()` — re-resolve what a step says without re-announcing which step it is.**

  `rerender()` re-emits `step:enter`, which `@guideflow/analytics` counts as another step view. So the
  documented way to move a live step into another language — `i18n.use('es')` then `rerender()` —
  inflated that step's `reached` count in `computeFunnel`. Three toggles produced four views.

  ```ts
  gf.i18n.use('es')
  await gf.repaint() // translated, and no phantom step view
  ```

  It also covers the other half of the same problem: `configure({ context })` mid-tour changes what
  `{{token}}` values resolve to, and previously the only way to show that was a `rerender()`.

  No machine movement, no `showIf`, no target re-resolution, no events. It defers to a navigation
  already in flight rather than cancelling it, and a translation that throws will not end the tour.

  Seventh size raise, 15.5 → 16 kB, measured **15.54** (ADR-026). An 810 B saving is available by
  moving `HotspotManager` off the default entry — real, measured, and deliberately not taken here:
  it is a breaking API change and deserves its own decision rather than being spent to fund an 80 B
  method.

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

- edfa115: Targeting now hears every route change; `clearCompleted` lands; the DevTools event list can no longer rot

  **`startTrigger: 'load'` only ever fired on the back button.** `install()` wired
  a bare `popstate` listener, so a `history.pushState` navigation — how React
  Router, Vue Router in history mode and Next.js move between routes — re-evaluated
  nothing at all. The documentation said "on every route change". It now uses the
  same `watchHistory` the routing seam does: the Navigation API where the browser
  has it (no patching), a cooperative wrapper where it does not, and coalescing so
  a router calling `replaceState` three times notifies once. Costs 380 B on the
  opt-in targeting subpath, whose gate moves 2.5 → 2.75 kB (ADR-016). **The core
  entry is untouched.**

  **A flow registered after `install()` was invisible to the `selector` trigger.**
  The candidate list was filtered exactly once, and the observer was only created
  if a selector flow already existed — so the recipe in `guide/hosting-flows.md`,
  where flows arrive from a `fetch`, could not use selector triggers at all. Both
  halves are fixed; there is no ordering rule left to remember.

  Two further defects found by the same probe:
  - **The `selector` trigger could start the wrong flow.** `evaluateFlow` marks a
    flow eligible on `startTrigger === 'selector'` alone — it has no document and
    never asks whether _that_ flow's selector matches. So an element appearing for
    one flow started whichever selector flow had the higher priority. A tour whose
    own selector matched nothing would run.
  - **The observer never stopped.** Closing a selector-started tour and then
    mutating the DOM restarted it, and would again on the next mutation, forever,
    unless a frequency cap happened to be configured. A `selector` trigger now
    fires once per flow per page load.

  **New: `ProgressStore.clearCompleted(userId, flowId?)`** — "let this user see
  that tour again". It clears every version of the flow, and leaves dismissals,
  resume points, targeting caps and checklist state alone. Previously the only
  option was `resetUser()`, which takes all of them.

  **Decided, not drifted: dismissal stays keyed on the flow id** while completion
  is `flowId@version` (ADR-015). Completing a tour says _I have seen this content_,
  so a republish is worth showing; dismissing one says _do not interrupt me_, which
  editing the tour does not answer. It is opt-in per flow, and `clearDismissed` is
  public for an author who disagrees. Pinned by tests in both directions.

  **DevTools**: both event-name lists are now `Object.keys({…} satisfies
Record<keyof TourEvents, true>)`, so an event added to or renamed in core fails
  to compile instead of silently going unreported. They had already rotted —
  `tour:dismiss` shipped in Phase 6 and reached neither, so the panel could not
  show a dismissal.

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

- ef40833: Two announcement defects, found by auditing the real accessibility tree

  Neither is visible to axe, which checks rules rather than output.

  **The survey scale announced every value twice.** The visible number is a `<span>`
  inside the `<label>`; the label named the radio _and_ the span was exposed beside
  it as its own text node, so an eleven-point NPS scale read as "0, 0, 1, 1, 2, 2"
  all the way up. The input now carries an explicit `aria-label` and the visual
  copy is `aria-hidden` — hiding the span alone would have left the radio with no
  accessible name at all.

  **A tour step announced doubled sentence punctuation.** `_announce` joins title,
  body and step counter with `". "`, so a body already ending in a full stop
  produced `"Step One. This is step one.. Step 1 of 3"`. Screen readers pause
  oddly on it and some voice the stray mark. Trailing `.!?` is now stripped from
  each part before the join.

  Both are pinned by `apps/e2e/tests/a11y-announcements.spec.ts`, which captures
  every live-region utterance in order across four browser projects.

- 93214ff: New package: `@guideflow/checklist` — an onboarding checklist that is a projection, not a copy

  ```bash
  pnpm add @guideflow/core @guideflow/checklist
  ```

  ```ts
  import { createChecklist } from '@guideflow/checklist'
  import { mountChecklist } from '@guideflow/checklist/widget'

  const checklist = createChecklist(gf, {
    id: 'getting-started',
    title: 'Getting started',
    version: 1,
    items: [
      { id: 'tour', title: 'Take the tour', flowId: 'welcome-tour' },
      { id: 'data', title: 'Connect your data' },
      { id: 'billing', title: 'Add a payment method', requires: ['data'] },
    ],
  })

  mountChecklist(checklist)
  ```

  An item that names a `flowId` ticks itself when that tour completes, because it **reads**
  `ProgressStore`'s completed-flows array rather than keeping a copy of it. There is no second source
  of truth to drift.

  ## `complete()` never records a flow completion

  The trap this design exists to avoid: `gf.start()` gates on `isCompleted` and returns silently for
  a completed flow — no error, and a `Promise<void>` with nothing to inspect. Writing to that array
  because a checkbox was ticked would **permanently suppress the tour the item launches**. So
  `complete()` on a flow-backed item writes a manual tick in the checklist's own record and nothing
  else. A test asserts `markCompleted` is never called.

  ## Headless, or with the widget

  `@guideflow/checklist` touches no DOM. `@guideflow/checklist/widget` is a separate entry point, so
  a host rendering its own list never bundles it. The controller is shaped for
  `useSyncExternalStore` and is referentially stable — item objects are reused field by field, and
  `getServerSnapshot()` returns a frozen `hydrated: false` state so SSR and the first client paint
  agree on rendering nothing.

  ## The widget is a disclosure, not a dialog

  No `role="dialog"`, no `aria-modal`, no focus trap — a persistent docked surface that swallows Tab
  is a keyboard trap under WCAG 2.1.2, and a second capture-phase trap competing with the renderer's
  would deadlock the keyboard. A running tour wins instead, three ways at once: z-index below
  `--gf-z-overlay`, `visibility: hidden`, and `inert`.

  Blocked rows are `aria-disabled`, never `disabled`, so they stay focusable and name the item that
  unblocks them. Progress is a count (`aria-valuetext: "3 of 5 complete"`), done is a glyph plus
  visually-hidden text, RTL is `inset-inline-end` with no `[dir="rtl"]` rules, and the reduced-motion
  and forced-colors blocks ship inside the widget's own stylesheet.

  ## Known limits, documented rather than hidden

  Manual ticks expire with the instance TTL — 30 days by default; `persistence: { ttl: 0 }` disables
  expiry. Cross-tab writes are last-write-wins. A manually ticked item cannot be re-run, because
  there is no flow behind it — a flow-backed one can, via `start(…, { force: true })`.

  ## Core

  One CSS custom property, `--gf-z-checklist: 99999`, and a docblock naming the reserved
  `ProgressStore` record suffixes. **No JavaScript, and no size-budget change** — `@guideflow/core`
  still measures 14.96 kB against 15 kB.

  Also documented, not built: the `target: null` single-step modal announcement, which already ships
  and is fully accessible. `apps/docs/guide/announcements.md` covers the recipe and its real limits.

- 7c72cb2: New package `@guideflow/banner` — a docked, non-blocking announcement surface

  "We shipped v2." "Maintenance on Friday." A bar that does not dim the page, does
  not trap focus, waits politely while a tour is running, and keeps its dismissal
  out of the tour funnel.

  `apps/docs/guide/announcements.md` has recorded four honest limits of the
  `target: null` modal announcement since Phase 7.8: the overlay blocks the page,
  only one can be up at a time, dismissal lands as `tour:dismiss` + `tour:abandon`
  where analytics counts it alongside users giving up, and the × / Skip chrome
  needs a custom renderer to remove. This closes all four, and that page now
  points at it instead of saying the variant is not built.

  **One shows at a time, derived rather than pushed.** Register as many as you
  like; `state.current` is the highest-priority eligible undismissed one and
  `queued` counts the rest. Ties keep registration order — the same rule targeting
  uses, so `priority` means one thing across the library.

  **Targeting is core's, not a second copy.** `urlPattern`, `audience` and
  `schedule` are evaluated by the same `matchUrl` / `matchAudience` /
  `matchSchedule` that decide which tour starts, so a throwing audience predicate
  means "not eligible" rather than a crash and an unparseable date bound is
  ignored rather than blocking forever. `evaluate()` reports `blockedBy` in core's
  own `BlockReason` vocabulary: "why isn't my banner showing" answers the same
  shape as "why didn't my tour start".

  **Dismissal is permanent unless you say otherwise.** Omit `version` and closing
  a banner suppresses it forever — ADR-015's rule, that "don't show me this again"
  is about interruption and editing the copy does not answer it. Set `version` and
  change it to bring it back, which is you asserting the content is genuinely new.
  Deliberately not an auto-derived content hash: that would make every dismissal
  carry a version, so nothing could ever mean "forever", and a typo fix would
  re-interrupt everyone.

  **A landmark, not a dialog.** `role="region"` with an accessible name, no
  `aria-modal`, no focus trap — a persistent docked surface that swallows Tab is a
  keyboard trap under WCAG 2.1.2. Announcements go through a _separate_
  visually-hidden polite region, because `role="status"` on the bar re-announces
  the whole thing every time the queue advances. `role="alert"` is not offered at
  any tone; it is assertive and would cut a running tour's step announcement in
  half.

  Headless if you want it: `subscribe` / `getSnapshot` / `getServerSnapshot`, with
  the widget in a separate `/widget` subpath so rendering your own bar costs no
  stylesheet.

  **`@guideflow/core`** gains one CSS custom property, `--gf-z-banner: 99995` —
  below the hint/hotspot band and below the checklist, because a banner must never
  cover a control the user needs. No JavaScript, no budget change.

  **`@guideflow/checklist` fixes a stylesheet teardown bug** found while copying
  its widget. `injectStyles` de-dupes by id, so a second `mountChecklist` injects
  nothing — and `destroy()` then called `removeStyles` unconditionally, stripping
  the stylesheet out from under every surviving mount. Silently: no error, just an
  unstyled widget. Its own test mounted twice and never checked. Both packages now
  refcount.

  Not in v1, each because it drags in more than it looks like: auto-dismiss timers
  and with them corner toasts, stacking, layout reservation, and mid-session
  schedule boundaries. See ADR-017.

- 9cde7b4: New package `@guideflow/survey` — NPS and CSAT as a docked card

  7.8c was deferred with a reason that has since evaporated: "a survey without
  somewhere to send the answers is a form that discards them, and the backend is
  where they would live." ADR-014 decided there is no backend, and analytics has
  always been host-wired — so the answers go to a callback, like every other event
  in this library.

  **Not a tour step type**, which is what `PRODUCT-ROADMAP.md` used to say. A
  step-type survey inherits all four limits the docs record against the
  `target: null` modal, and decisively it lands in the tour funnel: submitting
  would emit `tour:complete`, so `@guideflow/analytics` would count every NPS
  response as a completed tour and your abandonment rate would move whenever you
  ran a survey. The roadmap line is corrected in the same change.

  **One question shape.** `scale` with configurable bounds is NPS (`0..10`, the
  default), CSAT (`1..5`) and a thumbs poll (`1..2`). The response carries a
  `normalized` score in `0..1`, so a host can compare scales without knowing
  either one's bounds. The follow-up appears _after_ a score, so the first thing
  anyone sees is one click rather than a form.

  **The cooldown is measured from the ask, not the answer.** `cooldownMs: 90 days`
  is what NPS means in practice. Someone who closed the card without answering has
  also been asked, and re-asking them tomorrow is the behaviour people uninstall
  over. Omitting it makes one ask final. Bumping `version` asks everyone again
  immediately, overriding an unelapsed cooldown — a genuinely different question
  should not wait out the old one's timer.

  It deliberately does **not** reuse `@guideflow/core/targeting`'s cap record: that
  is keyed by flow id under targeting's own suffix, so `targeting.resetCaps()`
  would wipe survey cooldowns, and a survey is not a flow.

  **A radiogroup of real radios**, labelled by the question — so arrow keys move
  within the group, Tab treats it as one stop, and a screen reader announces
  "3 of 11". A row of buttons would look identical and lose all three plus the
  selected state. `role="region"`, no `aria-modal`, no focus trap.

  **The third copy of the docked-surface helpers is now enforced rather than
  promised.** `dock-drift.test.ts` extracts the body of `createLiveRegion` and
  `setTourActive` from all three packages, normalises comments and whitespace, and
  fails if they differ — plus asserts the two properties easy to "simplify"
  wrongly in one copy: that the live region is clipped rather than `display: none`
  (which would remove it from the accessibility tree and never speak), and that
  every package refcounts its stylesheet. One test file instead of a shared
  package. See ADR-018.

  **`@guideflow/core`** gains one CSS custom property, `--gf-z-survey: 99994` —
  below every other docked surface, because a survey is the least urgent thing on
  the page. No JavaScript, no budget change.

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

- e98d6fd: Two render-lifecycle defects that only bite once a step can wait

  **A detached target no longer blacks out the page.** `SpotlightOverlay._update()` branched on
  `!this._currentTarget`, but a target removed mid-step — by a route change, a list re-render, a
  closing modal — is still a non-null `Element`; it just returns a zero rect. The cutout collapsed to
  0×0 while keeping `box-shadow: 0 0 0 9999px`, painting a fully black, click-blocking screen with no
  way out. It now falls back to modal mode, exactly as a deliberate `target: null` step does.

  **Every navigation now cancels the render it interrupts.** `_renderGeneration` was bumped by
  `rerender`, `start`, `pause`, `resume` and the end path — but never by `next`, `prev`, `goTo` or
  `send`. Two `next()` calls inside the 150 ms scroll settle (a double-click on Next, or keyboard
  autorepeat) captured the _same_ generation, so both passed every staleness check and whichever
  resolved last won — not necessarily the newer one. A no-op navigation still does not bump, so it
  cannot cancel a render that is legitimately in flight.

  Neither is dramatic at a 150 ms settle. Both become serious the moment a step can wait seconds for a
  route to arrive, which is why they are fixed before the SPA navigation work rather than during it.

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
