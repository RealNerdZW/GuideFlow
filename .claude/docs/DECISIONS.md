# Decision log

Append-only. One entry per structural decision. When a decision is reversed, add a new entry that
supersedes the old one — never edit history.

Format:

```
## ADR-NNN — Title
Date · Status: Accepted | Superseded by ADR-NNN | Proposed
Context — what forced a choice
Decision — what we chose
Consequences — what this costs us, and what it forbids
```

---

## ADR-001 — Tours are finite state machines, not step arrays
2026 (retroactively recorded 2026-07-30) · Status: Accepted

**Context.** Every incumbent tour library (`intro.js`, `driver.js`, `shepherd.js`, `react-joyride`)
models a tour as an ordered array of steps. That model cannot express role-conditional branching,
resumable multi-session onboarding, or transition guards without bolting a worse state machine on top.

**Decision.** A `FlowDefinition` is `{ id, initial, states }`, where each state holds `steps`, a
transition table `on`, `onEntry`/`onExit` hooks, and an optional `final` flag. Position is the pair
`(state, stepIndex)`.

**Consequences.**
- This is the project's differentiator. Do not add a flat-array API "for convenience" — it splits the
  model in two.
- A flow with no reachable `final: true` state still completes — see the Phase 7.9 correction below;
  `final` only stops the step-counter walk, so validation grades a missing one as a warning.
- Step ids must be unique across *all* states; persistence and analytics key on them.
- A persisted `stepIndex` is meaningless without its `state`.
- Serialising a flow to JSON is lossy: `showIf`, function `content` and `HTMLElement` targets do not
  survive.

---

## ADR-002 — `@guideflow/core` has zero runtime dependencies and a 12 kB gzip budget
2026 (retroactively recorded 2026-07-30) · Status: Accepted

**Context.** The library is embedded in other people's production applications. Bundle weight and
transitive-dependency risk are adoption blockers, and the closest competitor (`driver.js`) is ~5 kB.

**Decision.** `core` imports nothing at runtime. `size-limit` enforces ≤ 12 kB gzip on
`dist/index.js` (currently 11.09 kB).

**Consequences.**
- No schema library (hence hand-rolled validation in `@guideflow/ai`), no sanitiser library (hence the
  hand-rolled `_sanitizeHTML`), no positioning library (hence `computePosition`), no emitter library.
- **Hardening the sanitiser must respect this.** DOMPurify is ~20 kB. The path forward is a
  `DOMParser` + allowlist node-walker, not a dependency — or moving `content.html` support into an
  opt-in subpath export that carries its own cost.
- Optional capabilities live in separate packages (`ai`, `analytics`) so they never tax `core`'s
  budget.
- Any PR that raises the `size-limit` number needs an explicit justification, not a silent bump.

---

## ADR-003 — `createGuideFlow()` mutates a `TourEngine` via `Object.assign`
2026 (retroactively recorded 2026-07-30) · Status: Accepted, but flagged for revisit

**Context.** The public instance needs to be an event emitter, expose engine state getters, and layer
persistence behaviour over the engine's navigation methods — inside a 12 kB budget.

**Decision.** `Object.assign(engine, { ...publicMethods })`, so `instance === engine`. Original
prototype methods are captured as bound `_engineXxx` constants *before* the assign; unshadowed
prototype members (`pause`, `resume`, `skip`, all getters) remain reachable for free.

**Consequences.**
- Zero wrapper overhead, no duplicated event plumbing, no proxy.
- **Sharp edge:** any wrapper calling `engine.<sameName>()` recurses infinitely. Any cross-forwarding
  of events between "engine" and "instance" loops.
- It requires an `as any` cast and a lint disable at `packages/core/src/index.ts:213`.
- `GuideFlowInstance` declares members that are not visible in the `Object.assign` literal, which
  reads as a bug to newcomers.
- **Revisit trigger:** if a second behaviour layer is needed (e.g. middleware, or a second wrapper
  package), convert to explicit composition with a generated delegate. Do it wholesale, with tests —
  a partial untangle is worse than either end state.

---

## ADR-004 — The spotlight is a box-shadow cutout, not an SVG mask
2026 (retroactively recorded 2026-07-30) · Status: Accepted, with a known limitation

**Context.** Dimming the page except for one element. Options: an SVG `<mask>`, four positioned
panels, or one element with a very large `box-shadow` spread.

**Decision.** Two fixed elements — a full-viewport overlay (`z-index: 999998`) that catches backdrop
clicks, and a cutout element positioned over the target with
`box-shadow: 0 0 0 9999px rgba(0,0,0,α)`, which paints the dimming outside itself.

**Consequences.**
- Cheap, CSS-transitionable, and tiny — it fits the budget.
- **Limitation:** the dimming element is `pointer-events: none` and the overlay is a single
  full-viewport div, so there is no "only the target is interactive" mode. `clickThrough: true`
  disables pointer capture for the *whole page*. Competitors solve this with a real mask or four
  panels. Closing this gap means revisiting this ADR.
- `z-index: 999999` loses to the browser top layer (`<dialog>`, popover API, fullscreen). Needs to be
  documented, and ideally tokenised so hosts can override it.

---

## ADR-005 — `apps/docs` (VitePress) is the canonical documentation site
2026-07-30 · Status: Accepted

**Context.** Two documentation surfaces exist: hand-written HTML in `docs/` and a VitePress site in
`apps/docs/`. `.github/workflows/docs.yml` publishes `apps/docs/.vitepress/dist` to GitHub Pages;
nothing builds `docs/*.html`, yet the workflow still triggers on `docs/**`.

**Decision.** `apps/docs/` is canonical. `docs/*.html` is frozen and slated for deletion once its
`publishing.html` content is migrated.

**Consequences.**
- Never add to `docs/*.html`.
- Remove `docs/**` from the `docs.yml` path trigger when the directory goes.
- Keep the `docs/` directory in git history rather than force-removing it — external links may exist.

---

## ADR-006 — `.claude/` is committed
2026-07-30 · Status: Accepted

**Context.** `.gitignore` contained a bare `.claude` entry, which would have excluded shared agent
documentation, skills and permission settings from version control.

**Decision.** Commit `.claude/` — docs, skills, agents, commands, and `settings.json`. Ignore only
per-developer state: `settings.local.json`, `local/`, `*.local.*`.

**Consequences.**
- The audit, the remediation plan and the repo conventions travel with the repository and stay
  reviewable in PRs.
- Contributors get the same tooling without re-deriving it.
- `.claude/docs/AUDIT.md` is a public statement of known defects. That is deliberate — it is honest,
  and it is a contribution roadmap. Do not put unfixed exploit payloads in it; those belong in a
  private advisory (see `SECURITY.md`).

---

## ADR-007 — A correct sanitiser is worth 500 bytes; the budget moves to 13 kB
2026-07-31 · Status: Accepted · Amends ADR-002

**Context.** `content.html` was sanitised by a regex denylist that a direct test defeated with
6 of 8 trivial payloads (AUDIT `sanitize-html-regex-denylist-bypass`) — unquoted `javascript:`
schemes, unclosed tags, entity-encoded schemes, `xlink:href`, `style` URLs. Regex denylists cannot
be fixed incrementally: they run before the HTML parser, so they never see what the parser will
actually produce.

The replacement parses into an inert `<template>` and keeps only an explicit allowlist of elements,
attributes and URL schemes. That costs **~440 B gzip**, taking `@guideflow/core` from 12.18 kB to
12.62 kB — 122 B over the 12.5 kB limit set in Phase 1.

Restructuring the allowlists to space-delimited strings recovered only 4 B; gzip already collapses
that redundancy. There is no cheap saving here.

**Decision.** Raise the `size-limit` budget to **13 kB gzip**. This is the *second* raise (12 → 12.5
in Phase 1, 12.5 → 13 here) and it is deliberate: a working XSS in a library that injects markup
into other people's pages is not a defensible trade for 122 bytes.

**Consequences.**
- ~380 B of headroom remains. The README's "~12 kB" claim is now wrong in the other direction and is
  corrected as part of Phase 4.4.
- The rejected alternatives, for the record: DOMPurify (~20 kB, and ADR-002 forbids a runtime
  dependency in core); shipping `content.html` support behind an opt-in subpath export so the
  default bundle does not pay for it. **The subpath option remains the right answer if the budget
  ever binds again** — it is a breaking change, so it belongs in a major, not a patch.
- Do not raise this number a third time without moving `content.html` out of the default bundle
  first.

## ADR-008 — WCAG AA is not an optional feature; the budget moves to 14.5 kB
2026-07-31 · Status: Accepted · Amends ADR-002, ADR-007

**Context.** ADR-007 closed with an explicit instruction: *"Do not raise this number a third time
without moving `content.html` out of the default bundle first."* This is that third raise, and it
is being taken without the split. That deserves an argument, not a shrug.

Phase 6 added, to `@guideflow/core`:

| Addition | Why it cannot be dropped |
|---|---|
| Focus trap + restore in `DefaultRenderer` | `role="dialog" aria-modal="true"` is a *promise* that the rest of the page is inert. Without a trap the promise is a lie, and Tab walks into a page the user cannot see behind the overlay. WCAG 2.4.3. |
| Polite live region | The popover element is reused across steps, so a screen reader sees no new node and reads nothing. Moving focus reads the button, not the step. WCAG 4.1.3. |
| Editable-target / IME / modifier guards on the keyboard handler | The document-level handler `preventDefault`ed arrow keys, so a caret could not move while a tour ran — worst on `clickThrough` steps, which exist precisely to let the user type. WCAG 2.1.2. |
| Conditional `aria-labelledby` / `aria-label` / `aria-describedby` | The old markup pointed `aria-labelledby` at an element it had not emitted, leaving the dialog unnamed. WCAG 4.1.2. |
| `flowTotalSteps` / `flowStepIndex` in `FlowMachine` | Not strictly a11y, but the counters feed `aria-valuetext` *and* decide which button says "Done". Per-state counting put a Done button on step one of a multi-state tour. |
| `prefersReducedMotion()` | The smooth scroll and the sliding spotlight cutout are set from script; a CSS media query cannot reach either. WCAG 2.3.3. |

Measured cost: **12.61 kB → 13.91 kB gzip**, 1.30 kB. Compacting the injected CSS recovered 20 B —
gzip had already collapsed the whitespace. There is no cheap saving here either.

**Decision.** Raise the `size-limit` budget to **14.5 kB gzip**, and do not pretend this is free.

The alternative ADR-007 named — moving `content.html` sanitisation to a subpath export — would free
~440 B, which does not cover 1.30 kB, and it is a breaking change. Deferring the a11y work until a
major release was the other option, and it was rejected: a tour library that a keyboard or
screen-reader user cannot operate is not shippable at any size, and "12 kB" was never the promise
that mattered.

**Consequences.**
- ~590 B of headroom remains. Any README or docs figure quoting a bundle size must say **~14 kB**.
- The subpath split for `content.html` is now **required work for the next major**, not an option.
  Tracked as a Phase 7 item. That recovers ~440 B and lets the default bundle drop the sanitiser
  entirely for the majority of users, who pass `content.body`.
- The headline "smaller than driver.js" comparison needs re-checking against current numbers before
  it is repeated anywhere.
- If the budget binds a fourth time, do the subpath split first. This is not a licence to keep
  raising it.

## ADR-009 — `content.html` sanitisation moves to an opt-in subpath; the budget does *not* move
2026-07-31 · Status: Accepted · Discharges ADR-008's condition, amends ADR-007

**Context.** ADR-008 closed with a condition, restated in CLAUDE.md: *"Before raising it a fourth
time, move `content.html` support out of the default bundle into an opt-in subpath export — that is
now required work for the next major, not an option."*

Phase 7.2 (target-only interaction) took `@guideflow/core` to **14.55 kB against a 14.5 kB limit** —
50 B over. That is the fourth raise arriving, exactly as predicted.

**Decision.** Do the eviction instead of the raise.

`utils/sanitize.ts` is no longer imported by `DefaultRenderer`. It ships as `@guideflow/core/html`,
and consumers who use `content.html` pass it in:

```ts
import { createGuideFlow } from '@guideflow/core'
import { sanitizeHTML } from '@guideflow/core/html'

const gf = createGuideFlow({ sanitizeHTML })
```

**Explicitly passed, not registered by a side-effect import.** `import '@guideflow/core/html'`
writing itself into a module-level slot would be terser and would break the moment a bundler handed
the subpath its own copy of that module: the registration lands on one instance, the renderer reads
another, and there is no error — just an unexplained fallback to escaped text. A config field has
exactly one implementation in play and it is visible at the call site.

**Without it, `content.html` is escaped and rendered as text, and the renderer warns once.** The
three options were: pass it through (an XSS hole in a library that injects markup into other
people's pages), drop it (a blank popover with no explanation), or escape it. Escaping is the only
one that is both safe and debuggable.

**Measurements.**

| | gzip |
|---|---|
| Before Phase 7.2 | 14.29 kB |
| After 7.2, before the eviction | 14.55 kB — **over** |
| After the eviction | **14.13 kB** |
| `@guideflow/core/html` on its own | 767 B |

The eviction freed **420 B**, not the ~440 B ADR-007 estimated nor the 638 B a design pass
projected — the sanitiser shares its escaping helpers with the renderer, so removing it does not
remove all of its weight. Both prior figures are hereby corrected; measure, do not estimate.

**The `size-limit` budget stays at 14.5 kB.** This is the part worth arguing.

14.13 kB fits under the existing limit with ~370 B to spare, so no raise is required *today*. A
design pass projected roughly +830 B of further Phase 7 work (the navigation seam, flow versioning,
targeting), which would land near 14.96 kB and genuinely need 15 kB. Raising now, pre-emptively, for
code that is not written and whose cost is an estimate, is precisely the silent bump ADR-008 forbids.

**Consequences.**
- Adding `content.html` support is now a **breaking change for anyone using it** without the import.
  It belongs in a major, and the changeset says so.
- There are now two `size-limit` entries. The subpath has its own 1 kB budget so it cannot quietly
  grow either.
- `tsup.config.ts` takes an array of two configs, not one config with two entries: the main bundle
  emits an IIFE with a `GuideFlow` global and a subpath must not, and `clean: true` belongs to
  exactly one of them or the second wipes the first's output.
- **When the budget does bind again, raise it — with a measurement, in the same changeset as the
  work that needs it, and with an ADR.** The next lever after that is splitting the navigation and
  targeting features into their own subpaths, which the Phase 7 design already assumes.

## ADR-010 — SPA route handling costs 590 B; the budget moves to 15 kB
2026-07-31 · Status: Accepted · Amends ADR-002, discharges ADR-009's condition

**Context.** `no-spa-route-change-handling` was the last open P0 and the roadmap's highest
single-item impact. A grep for `popstate`, `pushState`, `hashchange`, the Navigation API or any
router integration across the monorepo returned zero hits: the engine resolved each step's target
once with `querySelector`, waited 150 ms, and rendered. A step whose target lived on `/settings`
while the tour started on `/dashboard` resolved to null and rendered as a centred modal with no
spotlight — silently.

**Decision.** Split the work across the size boundary.

| | Where | gzip |
|---|---|---|
| The seam — `route` on `StateNode`, `NavigationAdapter`, waiting presentation, `isWaiting`, attach/destroy lifecycle, function `Step.target`, `step:target-missing` / `step:waiting` / `step:timeout` | `@guideflow/core` | **+590 B** |
| `matchRoute`, `waitForElement`, `watchHistory`, `createNavigation` | `@guideflow/core/navigation` | 1.55 kB, opt-in |

Measured: 14.13 kB → **14.72 kB**, against a 14.5 kB limit. **Raise it to 15 kB.**

ADR-009 said the next raise must arrive "with a measurement, in the same changeset as the work that
needs it, and with an ADR" — and refused to take it pre-emptively when the eviction had already
bought enough room. This is that changeset. 280 B of headroom remains.

**Why the seam is not itself opt-in.** It is 590 B of *engine*: the render pipeline has to know how
to wait, what to tear down, and what to emit. A version of `TourEngine` that cannot wait cannot be
made to wait from outside it. What is genuinely optional — route matching, element polling, history
watching — is the 1.55 kB that moved out.

**Why `route` sits on `StateNode`.** Not on `Step`, and emphatically not as a `ROUTE` transition.
`FlowMachine._defaultPath` walks `NEXT` only; a `ROUTE` transition would put the target state off
that path and reintroduce `total-steps-is-per-state`, the counter bug ADR-008 paid 1.3 kB to fix.
State-level `route` leaves the walk untouched, and `prevStep()` already crosses state boundaries via
history, so Back-across-a-route works with no extra code. Per-step `waitForTarget` stays load-bearing
regardless: a route change is only one of five reasons a selector misses — lazy chunks, Suspense
boundaries, portals and drawers are the others, and one code path covers all of them.

**Three behaviours worth defending.**

1. **The page stays clickable while waiting.** `_enterWaiting()` drops the spotlight, which also
   drops pointer capture. A user waiting to reach `/settings` has to be able to click the nav link;
   a modal that blocks the navigation it is waiting for can never succeed.
2. **`isWaiting` is a separate flag, not `_paused`.** Reusing pause breaks three ways: `pause()`
   early-returns when already true, so a host pausing mid-wait would silently no-op; `resume()`
   would clear the internal wait and start a second waiter; and the keyboard handler gates on it,
   killing Escape exactly when the user most wants out.
3. **The engine has no timeout policy.** It emits `step:timeout`, renders unanchored, and stops.
   `'skip'` and `'end'` compose in userland in one line and cost core zero bytes and zero
   re-entrancy risk.

**Consequences.**
- 280 B of headroom. The next lever is a `@guideflow/core/targeting` subpath, which Phase 7.4
  already assumes. Do not raise this a sixth time without taking it.
- Three `size-limit` rows now. Each subpath is gated independently so the opt-in halves cannot
  quietly grow either.
- `tsup.config.ts` is an array of three configs. Only the first may set `clean: true`.
- The built-in history watcher prefers the Navigation API and patches nothing on Chromium. Where it
  does patch, it wraps cooperatively and restores only if its own wrapper is still outermost —
  ripping it out unconditionally would delete a patch installed on top of it. The e2e suite asserts
  both branches, and skips the patch assertions where the Navigation API is in use.
- Any docs figure quoting a bundle size must say **~14.7 kB**, or ~16.3 kB with navigation.

---

## ADR-011 — A checklist is a projection; it ships as a package and emits nothing on the bus
2026-08-01 · Status: Accepted · No budget change

**Context.** `no-checklists-surveys-banners-resource-centre` asked for the single most-requested
onboarding primitive after tours. The obvious implementation — a widget with its own list of
"done" flags — creates a second source of truth for something the engine already records, and the
two drift the first time a user completes a tour from anywhere except the checklist.

**Decision 1: completion truth is split by provenance, and the split is load-bearing.** An item
that names a `flowId` is a pure projection of `ProgressStore.getCompletedFlows`; the checklist
never writes that array. Everything else lives in the checklist's own record. An item is done if
either source says so — a union, never an override.

The trap, stated in the imperative: **`complete(itemId)` must not call `progress.markCompleted`.**
`gf.start()` gates on `await progress.isCompleted(userId, flow.id)` and returns silently, with no
error and a `Promise<void>` return there is nothing to inspect. Recording flow completion as a
side effect of ticking a checkbox therefore permanently suppresses the tour that item launches. A
test asserts `markCompleted` is never called; it is the load-bearing test of the design.

The projection also makes the write race survivable: the most common item type is re-derived on
every mount and cannot lose a tick.

**Decision 2: a package, not a `@guideflow/core/checklist` subpath.** All five core tsup configs
set `splitting: false`, so anything a subpath imports as a *value* is inlined into that bundle. A
checklist needs `injectStyles`, which closes over a module-level de-dupe `Set`, and an id counter.
Two copies means style de-duplication silently stops working and `aria-labelledby` can break on
colliding ids — the same silent-duplicate-registry failure ADR-009 rejected side-effect
registration over. `./targeting` survives as a subpath only because it imports types plus a
locally duplicated two-line `isBrowser`; a stateful UI surface cannot. A subpath also cannot carry
its own peer range, README, version or `sideEffects`, and core's `files` would ship checklist
source inside every `@guideflow/core` tarball.

**Decision 3: it emits nothing on the `TourEvents` bus.** `gf.emit` is public and type keys cost
zero gzip, so this is not about bytes. The parity burden is seven hardcoded string-literal arrays
with no exhaustiveness check — React, Vue, Svelte, analytics, two devtools files and the demo —
and they already disagree in three measurable places. Four of the eighteen declared events never
reach `gf.on()` at all. Adding four more to that surface buys observability `subscribe()` already
delivers to all three adapters with zero edit sites. Consumers get `subscribe`/`getSnapshot`/
`getServerSnapshot`; analytics gets a plain `onEvent` callback, host-wired.

**Decision 4: a disclosure, not a dialog.** No `role="dialog"`, no `aria-modal`, no focus trap. A
persistent docked surface that swallows Tab is a keyboard trap under WCAG 2.1.2, and a second
capture-phase trap on `document` competing with `DefaultRenderer`'s is a keyboard deadlock that
nothing in happy-dom would catch. A running tour wins, expressed three ways so eye, pointer and
keyboard cannot disagree: z-index `var(--gf-z-checklist, 99999)` — above the hint/hotspot band,
deliberately **below** `--gf-z-overlay` — plus `visibility: hidden` and `inert`.

**Consequences.**
- **No sixth size raise.** Core gains one CSS custom property and a docblock. `@guideflow/core`
  still measures 14.96 kB / 15 kB.
- The package declares **no size budget and no `size` script** in v1. Unlike core, whose gzip
  number is a headline promise, this is opt-in weight a consumer chooses to install. Adding a CI
  gate without an agreed number would be theatre.
- `verify-pack.mjs` now fails when the changesets `fixed` group carries more than one version.
  Nothing checked that before, and `matchFixedConstraint` forces the group maximum onto every
  member — a package scaffolded at `npm init`'s default `1.0.0` would have majored all nine, then
  majored them again as every `>=0.1.9 <1.0.0` peer fell out of range.
- **Cross-tab writes remain last-write-wins**, documented on the docs page rather than buried in a
  risks list. Within a tab, every write re-reads and merges through one promise chain. Closing the
  cross-tab case needs a storage-level compare-and-swap no driver exposes — the same limitation
  `markCompleted` and the frequency caps already carry.
- **Manual ticks expire with the instance TTL**, 30 days by default, with no per-record override.
  `persistence: { ttl: 0 }` means never-expire; that is prominent on the docs page, not a footnote.
- A completed tour cannot be replayed from the checklist. `isCompleted` is version-blind and there
  is no `clearCompleted`. The zero-byte hack — writing `setRecord(userId, 'completed', …)` minus
  the flow id — is deliberately rejected: it is one subsystem reaching through a documented escape
  hatch to overwrite another's data byte for byte, on a key `@guideflow/ai` also reads. The right
  fix is `clearCompleted` in core, which is real bytes and its own conversation.

---

## ADR-012 — The authoring path is a library problem: two core subpaths, one selector, one flow file
2026-08-01 · Status: Accepted · No core-entry budget change

**Context.** `no-authoring-path-for-non-engineers` asked for one finished authoring surface. Its
prescribed fix named the DevTools panel's Builder tab as the host. A 49-agent read of the codebase
plus direct measurement changed two of that prescription's assumptions.

**What measurement changed.**

1. **Playwright cannot drive a `devtools_page`.** Verified: `chromium.launchPersistentContext` with
   `channel: 'chromium'` loads the MV3 extension headlessly and reaches the service worker, the
   content script, `chrome.storage` and `popup.html` — but there is no API, and no CDP path, to the
   DevTools window. So anything living only in `panel/app.tsx` is **unprovable, permanently**. That
   is the state Phase 3's extension hardening has been in for four phases, and the state the e2e
   suite was in for two while CI stayed green.
2. **The blocking permission question (D8) resolves favourably.** `chrome.tabs.sendMessage` from an
   extension page does reach a statically-registered content script with only `activeTab`:
   `GF_START_INSPECT` landed and the page really gained `#__gf_inspector_style__`. The narrower real
   defect is that `chrome.tabs.query` returns `url: null` without the `tabs` permission, so any code
   selecting a tab *by URL* gets nothing. Caveat for later: a `--load-extension` profile reports
   `origins: ["<all_urls>"]` as granted, so a green extension e2e run does **not** prove the
   real-install permission story.

**Decision.** The parts of authoring that can be proven are extracted into two zero-byte
`@guideflow/core` subpaths, and the UI is wired to them rather than owning them.

- **`@guideflow/core/selector`** — one ranked, uniqueness-verified selector engine, replacing three
  broken copies (`devtools/src/content/inspector.ts`, `ai/src/dom-context.ts`, and the panel's
  implicit third). Every candidate is re-queried before acceptance; `unique: false` is returned
  rather than a plausible-looking string.
- **`@guideflow/core/authoring`** — `validateFlow` plus the one draft⇄flow converter and the one
  reader/writer of `.flow.json`. Four mutually incompatible things called "export" collapse to one.

**Not a tenth package**, overruling the winning design. A new `@guideflow/*` joins the changesets
`fixed` glob automatically and must be scaffolded at the group's version; it needs a
`verify-pack.mjs` edit, a peer range, four config files and a coverage ratchet — and the design that
proposed it shipped it with no size gate at all. Two subpaths need two tsup entries, two `exports`
entries and two `size-limit` entries, and `verify-pack.mjs` walks `pkg.exports` generically, so both
are CI-gated with zero script changes.

**Consequences.**
- **`dist/index.js` is unchanged at 14.96 kB / 15 kB.** Neither subpath is imported by `src/index.ts`.
  There is no sixth budget raise, and if that number ever moves, `authoring.ts` value-imported
  something and the bug is there.
- **The `authoring` gate is 5.5 kB, set from a measurement rather than an estimate.** The design
  guessed 3 kB and said "shorten the hints, do not raise the gate". Measured: stripping *every*
  `message` and `hint` saves 880 B. The weight is rules, not prose, and the hints are the
  deliverable — they are what turns "invalid" into something a non-engineer can act on. The trade is
  stated in the file's own docblock: authoring-time-only, opt-in, never in an app bundle.
- **A documented falsehood is retracted.** CLAUDE.md claimed for eight phases that a flow with no
  `final: true` state "never completes". It completes normally. `no-final-state` is therefore a
  warning, and `authoring-engine.test.ts` pins every rule severity to real engine behaviour so the
  rule table cannot drift from the engine again.
- **`guideflow studio` is deleted**, with its test and its `vite` optional peer. It injected a global
  nothing has ever read. The audit's instruction — choose one surface, finish it, delete the other —
  is honoured; only its guess about which host could be finished is overruled, on evidence it did
  not have.
- **`guideflow export`'s `.ts`/`.js` path is deleted**, closing a P1: it wrote a truncated 500-char
  slice of the user's own source, printed success and exited 0, and `push` would upload it.
- Two pre-existing repo defects surfaced and were fixed: turbo's `lint`/`type-check` raced a
  package's own `dist` deletion (intermittent, reproduced 1-in-3), and Vite's bare-string alias is a
  prefix match that broke the demo on the first subpath import.

**Deferred to 7.9b, and not claimed anywhere:** the Recorder page, service-worker-owned recording
state, the extension zip and CI artifact, the Playwright extension project, and any store listing.
The extension still exports the old flat draft shape.
