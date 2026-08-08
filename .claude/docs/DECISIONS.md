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
- ~~A completed tour cannot be replayed from the checklist.~~ **Resolved in Phase 8.7.** This said
  the right fix was `clearCompleted` in core — which landed in 7.10b — but the fix that shipped is
  better still: `start(flow, ctx, { force: true })` (ADR-021) skips the completed gate and **writes
  nothing**, so replaying cannot un-tick the very row that launched it. A flow-backed done item is
  an operable control again; a manually ticked one is still inert, because there is no flow to
  re-run and that genuinely would be a dead button.
  The zero-byte hack this rejected — writing `setRecord(userId, 'completed', …)` minus the flow id
  — remains rejected, and for the same reason: one subsystem reaching through an escape hatch to
  overwrite another's data on a key `@guideflow/ai` also reads.

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

---

## ADR-013 — The Recorder is an extension page, and the extension is finally tested
2026-08-01 · Status: Accepted · Extends ADR-012

**Context.** ADR-012 extracted the provable half of authoring into two core
subpaths and recorded *why* the DevTools panel could not host the finished
surface: Playwright cannot open a `devtools_page`, and there is no CDP path to
one. This is the other half — the surface itself, and the harness that proves it.

**Decision 1: the authoring UI is `recorder.html`, an ordinary extension page.**
Not a DevTools tab, not a side panel. An extension page opens at
`chrome-extension://<id>/recorder.html`, which a test can drive; `chrome.sidePanel`
would add a permission and a Chrome-114 floor for zero verification gain. The
panel's Builder tab is **deleted** — the audit's instruction was to finish one
surface and delete the other, and shipping an editor nobody can test alongside
one they can is the outcome it warned about. The panel keeps Events, Flows and
Settings and gains an "Open Recorder" button; the popup gains the same.

**Decision 2: recording state moves to the service worker, and through it to
`chrome.storage.session`.** This fixes three defects structurally rather than
patching each:

- *Recording died silently on any navigation.* The content script and every
  module-scope variable in it are destroyed by a page load, so `recordingMode`
  came back `false` while the UI still read "Stop Rec". The worker owns the flag
  and the content script asks for it on load.
- *Closing the DevTools panel destroyed the captured steps.* They lived in the
  panel's React state.
- *Popup-armed recording captured nothing, by construction.* The worker posted
  each step at `devtoolsPorts.get(tabId)` and dropped it when that was
  `undefined` — which is always, for a popup-armed session.

Writing through to `chrome.storage.session` is what makes the in-memory maps
survivable: an MV3 worker is evicted after roughly 30 seconds of inactivity, and
taking a user's in-progress recording with it is the same class of loss. It also
made the buffer *observable*, which is how the e2e suite asserts on it — a
service worker cannot `chrome.runtime.sendMessage` to itself, so there was no
message-based way to ask.

**Decision 3: one message vocabulary, in `src/messages.ts`.** Five processes
exchanged these names as string literals; the worker kept a second hand-
maintained copy of the allowlist. A typo is silence, not an error — which is how
`GF_SET_DEBUG` came to be sent by the panel and handled by nobody.

**Decision 4: the extension is packaged, and the package is tested.**
`scripts/pack-extension.mjs` writes a deterministic zip with no new dependency
(Node has zlib; a ZIP container is a documented format). CI uploads it as an
artifact. A spec unpacks that zip with the platform's own tool and loads the
result — because "the build is fine" and "the download works" are different
claims, and `manifest.json` one directory too deep is the classic way the second
fails while the first passes.

**Consequences.**
- **The extension is exercised in a browser for the first time.** CLAUDE.md has
  said for four phases that the Phase 3 hardening "has still not been exercised
  in a browser" and that a mismatch "would present as silence, not an error".
  Ten specs now cover the worker, the content script, the nonce handshake and
  relay allowlist, detection, recording across a navigation, buffering with no
  UI open, the Recorder, and the packaged zip.
- **`channel: 'chromium'` is mandatory and load-bearing.** Playwright's default
  headless Chromium is the headless shell, which cannot load an extension and
  fails by loading *nothing*: `serviceWorkers()` is `[]` and every assertion
  silently has nothing to assert against. Measured 0 vs 1. That is precisely the
  silent-zero-coverage failure that kept this suite at a 0% pass rate for two
  phases.
- **The extension project is serial.** Each test launches a full Chromium with a
  fresh profile; nine at once exhausted the machine and produced nine
  "Tearing down context exceeded the test timeout" failures that read exactly
  like nine product bugs.
- **`optional_host_permissions` is removed.** Nothing ever called
  `chrome.permissions.request`, and an ungranted optional host permission is the
  one thing that can put a Site-access control in front of a user and silently
  withhold the statically declared content script.
- **`@guideflow/devtools` coverage is scoped, not padded.** The worker, content
  script, bridge, panel and popup are excluded from the unit ratchet with the
  reason stated in the config: mocking `chrome.*` across four processes well
  enough to produce a number would test the mock. They are covered by the e2e
  project instead. The included set measures 99/91/100/99.
- **What still cannot be proven, and is written down:** the DevTools panel as a
  panel, the popup as a popup, context menus, and the permission prompt a real
  Web Store install would show — a `--load-extension` profile reports
  `origins: ["<all_urls>"]` as already granted, so a green run says nothing about
  it. The store listing itself is 7.9c and is not engineering.

---

## ADR-014 — Flows are static assets; completion becomes version-scoped
2026-08-01 · Status: Accepted · **Sixth core budget raise: 15 kB → 15.5 kB**

**Context.** `no-backend-cms-or-self-hosting-story` offered two options: remove
the Cloud/push story, or ship a self-hostable flow store with a
`gf.loadFlows(url)` client and a reference server. Four designs were argued and
three judges chose the same one. The finding was written before 7.9a, and two of
its premises no longer hold: the "documented JSON schema" it asks for exists
(`validateFlow` **is** the schema, deliberately not a hosted `$schema`), and a
complete non-throwing reader for untrusted input exists (`parseFlowFile`).

**Decision 1: no server, and no fetch client.** A `.flow.json` is a static
asset. `fetch` + `parseFlowFile` + `gf.createFlow()` already swap a live tour —
demonstrated end to end by rewriting a file on disk between two assertions with
no rebuild (`apps/e2e/tests/remote-flows.spec.ts`). A `loadFlows()` would
reimplement the HTTP cache, replace an app `fetch` that already carries auth and
tracing, and either drag the 5.35 kB validator into production bundles or skip
validation at a boundary `SECURITY-MODEL.md` already classifies as untrusted. A
`packages/server` would add auth, storage, TLS, migrations and backups — the
tenth half-built thing in a repo that has spent nine phases deleting nine.

**Decision 2: the actual blocker was not transport.** Measured: a user who
completed v1 of a flow **never saw v2**, however much v2 changed. `start()`
checks `isCompleted` *before* the snapshot version gate, and completion was
keyed on the flow id alone — so `start()` returned silently, with no render, no
event and nothing to observe. No amount of client or server would have fixed
that; "edit the tour and republish" reached only the users who had never
finished it.

Completion is now recorded as `flowId@version`. `getCompletedFlows` **strips**
the suffix and deduplicates, keeping its signature — `@guideflow/checklist`
projects that array by matching an item's `flowId`, and `@guideflow/ai` reads
the same key; raw `id@version` entries leaking out would have silently broken
both. A record written without a version suppresses every version, which is the
conservative direction: there is no way to know which revision it meant, and
resurrecting a tour someone finished is worse than not re-showing an edit.

**Decision 3: `guideflow push` is deleted**, not repointed. Four measured
defects — it printed `unknown` for every real `.flow.json` (it read `.id` off
the envelope, which has none); a 2xx with a non-JSON body reported a **network
error** and exited 1 because `res.json()` sat inside the try; it validated
nothing, so it would upload a flow the engine truncates; and its test suite
pinned a bare-flow format `export` no longer writes. Its default endpoint was a
service that has never existed. `ora` goes with it.

**Decision 4: the cross-tab restore gains a version check.** Its comment
reasoned "both tabs are the same build, so a mismatch is impossible by
construction" — true only while flows ship inside the bundle. A flow fetched at
runtime falsifies it: two tabs of one build can hold different revisions.

**The budget raise.** The completion change measures **15.13 kB against the
15 kB limit** — 132 B over after tightening (class statics became module-level
helpers, worth 29 B). The limit moves to **15.5 kB**. This is the sanctioned
path, not an exception: CLAUDE.md's rule is that the next addition needs a real
saving or a sixth raise *with an ADR*, and the rule exists to prevent silent
growth. ~200 B buys the difference between "republishing works" and "republishing
silently reaches nobody who engaged with the tour".

**Consequences.**
- **`@guideflow/core` is 15.13 kB / 15.5 kB.** 370 B of headroom, and the next
  addition should still look for a saving first.
- The stored completion format changes. Old records keep working and keep
  suppressing; nothing migrates and nothing is lost.
- `apps/e2e/serve.mjs` serves `.flow.json` with an `ETag` and honours
  `If-None-Match`, scoped to that extension so the blanket `no-store` that keeps
  stale bundles out still applies to everything else.
- **Deferred, named, not smuggled:** `ProgressStore.clearCompleted()` (today only
  `resetUser()` exists, and it also wipes dismissals, snapshots, targeting caps
  and checklist state); version-scoped *dismissal*, which is arguably correct as
  it stands because "don't show me this again" is about the tour rather than the
  revision; and `createTargeting().install()`'s one-shot selector scan, which
  does not see flows registered after it — documented as an ordering rule
  instead.

---

## ADR-015 — Dismissal stays flow-scoped while completion is version-scoped
2026-08-02 · Status: Accepted · No byte cost

**Context.** ADR-014 made completion `flowId@version`, so republishing a
structurally changed tour reaches the people who finished the old one.
Dismissal — `markDismissed` / `isDismissed` — was left keyed on the flow id
alone. That leaves two adjacent methods on one class behaving differently, which
ADR-014 itself flagged as "arguably correct… but an asymmetry someone will
file". This decides it rather than leaving it to be tidied up by whoever notices
first.

**Decision: leave dismissal keyed on the flow id, and say why in the source.**

The two records answer different questions.

*Completion* is a statement about **content**: I have seen all of this. New
content therefore justifies asking again, which is the whole of ADR-014.

*Dismissal* is a statement about **interruption**: do not put this in front of
me. Editing the tour does not answer that objection. Re-showing a tour someone
actively closed, because its author reordered a step, spends the one piece of
explicit negative feedback the library ever receives — and spends it on the
users most likely to be annoyed by it.

Three facts make leaving it alone safe rather than merely defensible:

1. **It is opt-in per flow.** Nothing is written unless the flow sets
   `persistDismissal`. Closing a tour suppresses nothing by default, so the
   record only exists where an author deliberately asked for a durable "no".
2. **There is a public escape hatch.** `gf.progress.clearDismissed(userId,
   flowId)` is reachable — `progress` is on `GuideFlowInstance`. An author who
   wants a rewrite to clear old dismissals can do it in one line, at the moment
   they know the rewrite is material. The library cannot know that;
   `flowFingerprint` deliberately ignores content, so it cannot tell a
   restructure from a rewrite.
3. **Dismissal is not on the same collision course.** The bug ADR-014 fixed was
   that `start()` checks `isCompleted` *before* the version gate, making
   republication silently unreachable. `isDismissed` sits at
   [index.ts:394](../../packages/core/src/index.ts#L394), one line earlier — but
   there is no equivalent harm, because suppressing a tour the user closed is
   the intended behaviour, not an accident of ordering.

**Rejected: scope dismissal to `flowId@version` for symmetry.** Symmetry between
two APIs is worth something, but not the user-facing behaviour it would buy
here. It would also silently resurrect every existing dismissal on the next
publish, since old records carry no version — the opposite of the conservative
direction ADR-014 chose for completion.

**Rejected: make it configurable** (`persistDismissal: 'flow' | 'version'`). A
third value on a boolean field, a new stored format, docs, and tests, for a
choice a host can already make with one call to `clearDismissed`.

**Consequences.**
- `progress-store.test.ts` pins the behaviour in **both** directions — a
  dismissal survives a version change, a completion does not. Neither can be
  "made consistent" without a test failing and this ADR being re-read.
- The reasoning lives in the source, above `markDismissed`, not only here.
- `ProgressStore.clearCompleted(userId, flowId?)` ships in the same change
  (7.10b) and clears **every** version of a flow, because a caller asking for a
  replay means the tour, not one revision of it. It leaves dismissals,
  snapshots, targeting caps and checklist state alone — which is the entire
  reason it exists next to `resetUser()`.

---

## ADR-016 — Targeting reuses `watchHistory`; the targeting gate moves to 2.75 kB
2026-08-02 · Status: Accepted · **Targeting subpath: 2.5 kB → 2.75 kB** (core entry untouched)

**Context.** `createTargeting().install()` armed the `load` trigger with a bare
`window.addEventListener('popstate', …)`. `apps/docs/guide/targeting.md` says
that trigger fires "On `install()`, and on every route change".

MEASURED, with a probe in happy-dom: a `history.pushState` navigation
re-evaluated **nothing**. Every React Router, Vue Router in history mode and
Next.js route change is a `pushState`. So the documented behaviour was "on the
back button", and a `startTrigger: 'load'` flow scoped to a route the app pushed
into never fired at all. Working agreement 6 — implement it or correct the docs —
leaves two options and no third.

**Decision: import `watchHistory` from `../navigation/history.js`.**

The alternative was a second, smaller route watcher written inside targeting.
This repo has already paid for that mistake once: 7.9a deleted three independent
selector builders that were each broken in the same two ways, and CLAUDE.md now
says to import the one that exists rather than write a fourth. `watchHistory`
prefers the Navigation API and patches nothing where it exists, wraps
cooperatively where it does not (Next.js 14.1+ has already patched), coalesces
on `href` so a router calling `replaceState` three times notifies once, and
unpatches only if its own wrapper is still outermost. A cheap copy would have
none of that, and would be wrong in ways that only show up in someone else's
router.

**Why duplicating the module is safe.** `splitting: false` means the import is
inlined, so an app using both subpaths ships two copies of `history.ts`. They do
not fight: `watchHistory` keeps its refcount and its patch on
`Symbol.for('guideflow.navigation')` — a global symbol, chosen for exactly this
— so two module copies share one wrapper and one teardown. The cost is bytes,
not correctness.

**The measurement.** Three numbers, same build:

| | targeting subpath |
|---|---|
| Before | 2.18 kB |
| 7.10d re-scan + `selectorFired` + the `autoStart` predicate | **2.22 kB** (+40 B) |
| …plus `watchHistory` | **2.6 kB** (+380 B) |

The gate moves 2.5 → **2.75 kB**, leaving 150 B of headroom. **The core entry is
not touched** — it stays at 15.2 kB against 15.5 kB, and this is not a seventh
core raise. The cost lands on an opt-in subpath, paid by the people who asked
for targeting, which is exactly the population that needs route changes to work.

**Rejected: a `watchRoutes` option** (`createTargeting(gf, { watchRoutes })`,
defaulting to popstate). ~20 B, and zero duplication for anyone already
importing `@guideflow/core/navigation`. Rejected because it leaves the default
wrong for most SPAs and the documentation still needing a caveat — it moves the
defect into a knob nobody knows to turn.

**Rejected: reuse the host's own `NavigationAdapter`.** `attach(onChange)` is
already the right shape, and a host that wired SPA routing for the engine has
one configured. But `_config.navigation` is private to the `createGuideFlow`
closure; exposing it would add public surface to `GuideFlowInstance` and cost
**core** bytes for every user, to save bytes on a subpath. Worth revisiting only
if something else needs that seam too.

**Consequences.**
- `targeting.md`'s "every route change" is now true, and the guide says which
  navigations are covered.
- Two further defects were found by the same probe and fixed in the same change:
  the `selector` trigger could start the **wrong flow** (`evaluateFlow` marks a
  selector flow eligible without asking whether *its* selector is in the DOM, so
  an element appearing for one flow started whichever had higher priority), and
  the MutationObserver never stopped — closing a selector-started tour and then
  mutating the DOM restarted it, forever, unless a frequency cap happened to be
  configured.
- happy-dom's `pushState` does not move `window.location.href`, so the unit test
  uses a hash route change — a real SPA navigation the old popstate listener also
  missed. The pushState path is only real in a real browser.

---

## ADR-017 — Banners are a tenth package, one slot deep, and dismissal is forever unless you say otherwise
2026-08-02 · Status: Accepted · No core budget change (one CSS token)

**Context.** 7.8b was deferred from Phase 7.8 with a stated reason: "the
checklist proves the docked surface pattern; a banner is that pattern minus the
list. Building both at once would have meant guessing the shared abstraction
before either had a consumer." The checklist is now that consumer, so the
abstraction is observable rather than hypothetical.

Four independent designs were produced and three judges ranked them. They
converged, unprompted, on every structural question. What follows records the
convergence and the three places the judges overruled the winning design.

**Decision 1: a package, and NOT a shared `@guideflow/dock`.** The reusable
surface was *counted*, not assumed. `packages/checklist/src/widget/` is 816
lines; three designers independently measured 81, 91 and 115 genuinely generic
lines, ~88% of them in one file (`a11y.ts` — `createLiveRegion`,
`setTourActive`, `restoreFocus`). A package whose entire reason to exist is
three functions costs a manifest, a tsconfig, a tsup config, a README, a docs
page and a slot in the fixed version group. It would also pull those
well-covered lines out of the checklist's coverage denominator, which is a
ratchet set just under a measured number. So `a11y.ts` is **copied**, with the
attribution header `packages/checklist/src/identity.ts` already set as
precedent.

Not a `@guideflow/core/banner` subpath either: ADR-011 Decision 2 applies
verbatim. `splitting: false` inlines anything a subpath imports as a value, and
a banner needs `injectStyles`, which closes over a module-level de-dupe `Set`.
Two copies means style de-duplication silently stops working — and a stateful UI
surface is exactly what ADR-011 said could not be a subpath.

**Decision 2: one slot, derived, with a queue behind it.** `state.current` is
one `BannerView | null` plus a `queued` count. The visible banner is the
highest-priority eligible undismissed one, recomputed on every input change —
the checklist's projection discipline, not an imperative queue a caller mutates.
Ties keep registration order, the same rule `createTargeting().evaluate()` uses,
so `priority` means one thing across the library.

Nested rather than flattened onto the state on purpose: under
`exactOptionalPropertyTypes`, a flat `id: string | null` beside
`title: string | undefined` narrows nothing, and every host render site would
need `?? ''`.

**Decision 3: reuse the rules, not the engine.** `matchUrl`, `matchAudience` and
`matchSchedule` are already exported from `@guideflow/core/targeting` and take
plain arguments. They also carry behaviour a fresh copy would lose — a throwing
audience predicate means "not eligible" rather than a crash, an unparseable date
bound is ignored rather than blocking forever. `evaluateFlow` itself is not
reusable: it takes a `FlowDefinition` (which needs `initial` and `states`), its
first act is a short-circuit on a `startTrigger` a banner does not have, and its
`EvaluationEnv` demands `completed` and `caps`. Constructing a fake flow to
satisfy that type is the kind of thing that reads fine and rots.

`evaluate()` returns core's own `BlockReason` vocabulary, so "why isn't my
banner showing" has the same answer shape as "why didn't my tour start". This
surface has four silent failure modes — not hydrated, no identity, a guard
rejected it, a stored dismissal — and without it they are indistinguishable from
"nothing to show".

**Decision 4: dismissal is permanent unless the author declares a `version`.**
This follows ADR-015 by default and lets an author opt out declaratively.
Omitting `version` means the dismissal suppresses every revision, forever: *do
not put this in front of me* is about interruption, and editing the copy does
not answer it. Setting one and changing it re-shows the banner — the author
asserting the content is genuinely new, which only they can know, because
`flowFingerprint` deliberately ignores content.

An auto-derived content hash was rejected: it would make every dismissal carry a
version, so no stored record could express "forever", and a typo fix would
re-interrupt everyone.

**Decision 5: a landmark with a separate live region.** `role="region"` with an
accessible name on the surface, and announcements through a *different*,
visually-hidden `role="status"` element. `role="status"` on the surface itself
would re-announce the entire bar on every mutation, including the queue
advancing after a dismissal. `role="alert"` is not offered at any tone: it is
assertive and would cut a running tour's step announcement in half — which is
also why `BannerTone` has no `'error'` member, since an error tone is what makes
`role="alert"` look like the obvious next commit.

**Where the judges overruled the winning design.**
1. **`--gf-z-banner: 99995`, not 99999.** The winner reused the checklist's
   value, so two independently-mounted fixed surfaces would tie and paint by DOM
   order — while its own stated reason for minting a separate token was that a
   host lowering one must not lower the other. 99995 sits below the
   hint/hotspot band (99996–99998) and below the checklist, because a banner
   must never cover a control the user needs.
2. **`urlPattern` ships in v1.** The winner cut it. All three judges called that
   a capability regression against the surface it replaces: the `target: null`
   modal announcement already gets url scoping through `createTargeting`.
3. **`dock`, not `placement`.** `placement` is already `PopoverPlacement` on
   `Step`, where it means "where relative to a target". `dock` is the vocabulary
   of the only other docked surface in the library.

**Consequences.**
- **Core gains one CSS custom property and nothing else.** Every `size-limit`
  entry is a `./dist/*.js` path, so a token in `tokens.css` is genuinely free.
  Core stays 15.2 kB / 15.5 kB.
- Like `@guideflow/checklist`, the package declares **no size budget** in v1.
  This is opt-in weight a consumer chooses to install; a CI gate without an
  agreed number would be theatre.
- **A live defect was found in the code being copied and fixed in the same
  change.** `injectStyles` de-dupes by id, so a second `mountChecklist` injects
  nothing — and `destroy()` called `removeStyles` unconditionally, stripping the
  stylesheet out from under every surviving mount, silently. The checklist's own
  test mounted twice and never checked. Both packages now refcount.
- **Layout reservation was solved, not deferred — by the e2e suite.** The bar
  shipped `position: fixed` with the limitation documented ("on a small viewport
  a top bar can cover a fixed app header"), which two judges flagged. Then an
  e2e spec could not click a button the bar was sitting on top of, which is the
  same defect with a repro. `dock: 'top'` is now `position: sticky`: it
  participates in flow, so it reserves its own height and pushes the page down,
  then sticks as the user scrolls. That needs nothing from the host — unlike
  publishing a measured height as a custom property, which means writing to an
  element the library does not own and which a host assigning `cssText`
  wholesale silently clobbers. `dock: 'bottom'` stays fixed: that is the
  cookie-notice shape, and reserving space at the end of a short page would
  leave a gap rather than pin the bar where the reader expects it.
- **Deliberately not in v1**, each because it drags in more than it looks like:
  auto-dismiss timers (WCAG 2.2.1 needs pause, stop and extend) and with them
  corner toasts (`mountChecklist`'s default dock is `bottom-end`, and neither
  package can detect the other); stacking; and mid-session schedule boundaries.
- **The third live region is real and unheard.** The renderer has one, the
  checklist has one, this adds a third, and `REMEDIATION-PLAN.md` records that no
  NVDA or VoiceOver session has ever been run. The structure is right by
  assertion and by axe. How the three sound together is unknown, and the docs
  page says so rather than claiming behaviour nobody has verified.

---

## ADR-018 — A survey is a docked surface, not a step type; and the third copy stays a copy
2026-08-03 · Status: Accepted · No core budget change (one CSS token)

**Context.** 7.8c was deferred with a reason that has since evaporated: "a survey
without somewhere to send the answers is a form that discards them, and the
backend is where they would live." ADR-014 decided there is no backend, and
analytics has always been host-wired — so the answers go to a callback, which is
where every other event in this library already goes.

Two questions were open. Neither is the one the roadmap thought.

**Decision 1: docked, not a tour step type.** `PRODUCT-ROADMAP.md` said
"Surveys / NPS **as a step type** feeding the analytics pipeline." That is
wrong, and 7.8b is why. A step-type survey inherits all four limits
`apps/docs/guide/announcements.md` records against the `target: null` modal: the
overlay dims the page, only one can be up, the chrome needs a custom renderer,
and — decisively — it lands in the tour funnel. Submitting would emit
`tour:complete`, so `@guideflow/analytics` would count every NPS response as a
completed tour, and the abandonment rate would move whenever you ran a survey.

An NPS prompt that dims the whole application is also just wrong as a product:
it is the least urgent thing on the page, which is why its z-index token sits
below every other docked surface.

The roadmap line is corrected in the same change.

**Decision 2: an eleventh package, and the third copy of the dock helpers stays
a copy — but is now enforced.** ADR-017 deferred extracting `@guideflow/dock`
when there were two copies. A third is where CLAUDE.md's warning starts to
apply: "There is exactly one selector builder now. There used to be three, and
all three were broken the same two ways."

Measured against that, the analogy does not hold. Those were three ~200-line
ranked heuristics, written independently, each wrong. These are three trivial
DOM helpers — `createLiveRegion` is thirty lines of `createElement` plus aria
attributes — copied from one verified original. The copies are also deliberately
*subsets*: the checklist needs `restoreFocus` and neither of the others does, so
a shared module would export something two of its three consumers do not use.

What was missing was a guard, not a package. `dock-drift.test.ts` extracts the
brace-matched body of `createLiveRegion` and `setTourActive` from all three
packages, normalises away comments and whitespace, and fails if they differ. It
also asserts the two properties that are easy to "simplify" wrongly in one copy:
that the region is clipped rather than `display: none` (which would remove it
from the accessibility tree and produce a live region that never speaks), and
that every package refcounts its stylesheet. That converts three copies that
*could* diverge into one implementation that mechanically cannot — for the price
of one test file instead of a package, a manifest, a tsconfig, a tsup config, a
README, a docs page and a slot in the fixed version group.

**Decision 3: one question shape.** `scale` with configurable bounds is NPS
(`0..10`, the default), CSAT (`1..5`) and a thumbs poll (`1..2`). Multiple
choice is a different widget with different keyboard semantics and nothing has
asked for one. The response carries a `normalized` score in `0..1` so a host can
compare scales without knowing either one's bounds.

The follow-up appears **after** a score, so the first thing anyone sees is one
click rather than a form — and submitting is an explicit button rather than
auto-submit on selection, which would fire once per arrow key for a keyboard
user moving through the scale.

**Decision 4: the cooldown is measured from the ASK, not the answer.** Someone
who closed the card without answering has also been asked, and re-asking them
tomorrow is the behaviour people uninstall over. Omitting `cooldownMs` makes one
ask final, which is ADR-015's default applied to a third surface.

`@guideflow/core/targeting`'s `FlowFrequency` and `CapRecord` were considered and
rejected: that record is keyed by flow id under the `'caps'` suffix, which
belongs to targeting, so `targeting.resetCaps()` would wipe survey cooldowns —
and it tracks session windows and global counts a survey has no use for.

**Decision 5: a radiogroup of real radios.** Arrow keys move within the group,
Tab treats it as one stop, and a screen reader announces "3 of 11". A row of
`<button>`s looks identical and loses all three plus the selected state. The
inputs are visually replaced by their labels but never `display: none`, which
would remove them from the tab order and break the arrow-key model. Choosing a
score toggles `checked` rather than rebuilding the group, because rebuilding
would replace the element that has focus.

**Consequences.**
- **Core gains one CSS custom property**, `--gf-z-survey: 99994`. No JavaScript,
  no budget change. Core stays 15.2 kB / 15.5 kB.
- Eleven packages now share one version. `verify-pack.mjs` enforces it.
- `bottom-end` is both this package's default dock and `mountChecklist`'s, and
  neither can detect the other. Documented rather than solved: solving it means
  one package knowing about another, which is the coupling every one of these
  ADRs has refused.
- **A fourth polite live region.** The renderer has one, the checklist has one,
  the banner has one, this adds a fourth — and no NVDA or VoiceOver session has
  ever been run against any of them. The docs page says so.

---

## ADR-019 — The MCP server exposes the authoring engine, holds no credentials, and writes nothing
2026-08-03 · Status: Accepted · No core change

**Context.** `MCP-AND-SKILLS.md` §3 called this "the most credible route to the
'AI-powered' claim in the README", and it is right about the direction.
`@guideflow/ai` today means "call an LLM from the browser with your API key in
the bundle" — a security problem and a thin feature. Inverting it makes tour
authoring agentic in any MCP client and keeps keys nowhere.

It proposed five tools. Two of them needed rethinking before anything was
written.

**Decision 1: `author_flow` does not call a model.** The proposal reads
"`author_flow(spec)` → generate a validated FlowDefinition". A server that
generates needs a provider and a key, which reproduces the exact problem this
inversion exists to solve — one layer further from the user, where it is harder
to see.

The client *is* the model. So `author_flow` is **mechanical**: it takes the
linear step list the agent wrote, runs `draftToFlow`, validates the result, and
hands back the bytes. The generating happens where the credentials already are.

**Decision 2: every tool is read-only, including the authoring one.** It would
have been easy to add `write_flow`. The client already has file tools, under
whatever permission model the operator configured; a second write path inside an
MCP server is new blast radius for no capability. `author_flow` returns
`fileContents` and a `suggestedPath`.

That also makes the annotations honest — `readOnlyHint: true` and
`destructiveHint: false` on all four, asserted by a test that walks the registry.

**Decision 3: `simulate` is deferred, and named.** "Drive it headlessly, return
step-by-step screenshots" is the most valuable of the five tools. It needs a
browser download, a running copy of the operator's app, and a screenshot
transport. `apps/e2e` is a standing measurement of what that costs, and this
repository has spent ten phases deleting things that were half of it. A
`simulate` that worked on a static page and silently did nothing useful on a
real SPA would be worse than none.

What ships instead is honest about its limits: `validate_flow` catches every
*structural* failure with no browser at all, and the docs say plainly that
selector verification against a real page is the DevTools Recorder's job.

**Decision 4: `list_flows` walks a directory.** ADR-014 decided there is no
backend, so "what tours exist" has no service to ask. Walking the operator's
root is the honest implementation, bounded to 8 levels and 500 files with the
usual directories skipped.

One refinement came out of testing: `validateFlow` deliberately returns **no
flow** when the flow is invalid, so a naive listing shows `id: null` for every
broken file — useless for the one question you ask when something is broken.
The id is now recovered from the raw JSON as a fallback, treated as untrusted
(a string or nothing) because it is displayed back to a model.

**Decision 5: the sandbox is the package.** Reading files on behalf of a model
means the only genuinely dangerous thing this can do is read one the operator
did not mean to expose. `root.ts` is fifty lines and has its own test file with
fifteen cases, which is the correct ratio.

Four properties, each with a test:
- **The root is the operator's**, from `--root` or the environment, never a tool
  argument. A `root` parameter would let a model that had been talked into it
  point the server anywhere.
- `..` is collapsed by `resolve` and then refused.
- Containment is checked on path **segments** via `relative`, not `startsWith` —
  which accepts `/srv/tours-secret` for a root of `/srv/tours`.
- Symlinks are resolved and re-checked **against the nearest existing ancestor**,
  not just the leaf. The first implementation did `try { realpath(abs) } catch
  { accept }`, which waves through a non-existent file underneath a directory
  symlink that points out of the root — `escape/new.flow.json`. Found by writing
  the test for it.

**Consequences.**
- **Twelve packages now share one version.** `@guideflow/mcp` joins the
  changesets `fixed` group automatically (the glob) and is scaffolded at 0.1.9;
  `verify-pack.mjs` enforces the equality.
- **`@guideflow/core` is a real dependency here, not a peer** — this is an
  application, not a library, and there is no host bundle for a peer to
  deduplicate against. It is the second package after the CLI to do that.
- **First package with third-party runtime dependencies that matter**:
  `@modelcontextprotocol/sdk` and `zod`. Core's zero-dependency promise is
  untouched and unrelated.
- The unit suite drives the tools through a real `Client` over
  `InMemoryTransport` rather than calling handlers, so a Zod schema that
  disagrees with its handler fails in CI. A separate smoke test spawns the built
  binary and speaks JSON-RPC over real stdio, which is the only way to catch the
  classic MCP failure: anything written to stdout is framed as a protocol
  message and corrupts the stream. Measured clean.

---

## ADR-020 — `advanceOn` is a navigation-subpath helper, and the gate moves 2 → 2.5 kB

**Status.** Accepted (Phase 8.1).

**Context.** ADR-004 spent ~1.3 kB carving a real `clip-path` hole in the overlay so a
`clickThrough` step lets the user click the control it is highlighting. Measured afterwards: the
engine attaches exactly one listener — `document.addEventListener('keydown', …)`
([tour.ts:655](../../packages/core/src/engine/tour.ts#L655)) — and **nothing on the target**. The
spotlight's only others are a backdrop-dismiss click and scroll/resize. So the user clicked, the app
responded, and the step waited for **Next**. `advanceOn` existed nowhere in the repository, while
Shepherd ships `advanceOn` and driver.js ships `onNextClick`.

`clickThrough` was therefore half a feature for five phases, and the half that was missing is the
one that turns "read this" into "do this".

**Decision.**

1. **A helper on `@guideflow/core/navigation`, not a declarative `Step.advanceOn` field.** The
   declarative form is the better authoring story and the only one a `.flow.json` can carry — but it
   is ~200–300 B in the size-gated core entry, which has ~300 B of headroom that content variables
   (8.3) and content i18n (8.4) are already competing for. The helper hangs off `step:enter`, needs
   no engine change, and costs the core entry **zero**. Take the field later, with its own ADR, once
   this has demand.
2. **Raise the navigation subpath 2 → 2.5 kB.** Measured **2.19 kB**. This is ADR-016's pattern
   exactly: the cost lands on an opt-in bundle paid for by the people who asked for it, and the core
   entry does not move — measured unchanged at 15.29 kB, inside 15.5 kB.
3. **Capture-phase delegation on `document`**, not a listener on the target element. Three reasons,
   each sufficient: an app handler calling `stopPropagation()` would silently kill a bubble listener
   with no error anywhere; non-bubbling events never reach one at all; and the resolved `Element` is
   not stable across a host re-render, so a listener bound to it dies with the node.
4. **`next()` and `send()` only — never `end`/`skip`.** `end` maps to `stop()`, which emits
   `tour:abandon`. Only `next()` past the last step takes the completed path. Wiring a final step to
   `end` would file every "the user finished by doing the thing" as an abandonment in
   `@guideflow/analytics` — the same class of error ADR-018 caught in the survey-as-a-step proposal.

**What the adversarial pass found, and what it changed.**

- **`step:exit` is not emitted on every terminal path.** `send()` moves the machine *before* calling
  `_emitStepExit()`, which reads the machine's *current* step; for an ordinary `done: { final: true }`
  state carrying no steps that is `null`, so the emit is skipped while `_stepExitEmitted` is still
  set — `_doEnd(true)` then early-returns on the flag and only `tour:complete` fires. A helper
  subscribed only to `step:exit` keeps its listener for the life of the page. **Reproduced, then
  fixed** by also subscribing `tour:complete` and `tour:abandon`. The test counts the listener
  rather than the behaviour, because a leaked listener still bails on `!isActive` and looks fine.
- **`step:waiting` needs a teardown too.** `_enterWaiting` drops the spotlight, and `hide()` sets
  `pointer-events: none` on the overlay — so the whole page becomes clickable while a route wait is
  in flight. Same for `pause()`, which emits `tour:pause` and **no** `step:exit`.
- **`step:enter` fires twice with no `step:exit` between**, on `resume()` and on `rerender()` — the
  latter on every route re-anchor. Teardown-before-arm on every `step:enter` is therefore
  load-bearing, not defensive style.
- **Forgetting `clickThrough` does not merely do nothing — it *dismisses* the tour.**
  `dismissOnBackdropClick` defaults true, so the click hits the overlay and calls `skip()`. The
  user's first attempt to follow the instruction destroys the tour. A pointer rule armed on a step
  without `clickThrough` warns once, naming that consequence.

**Consequences.**

- **Known limitation, documented rather than hidden: keyboard users cannot reach the target.** The
  renderer traps focus inside the popover and sets `aria-modal="true"` on every step, including
  `clickThrough` ones, so Tab never leaves the dialog — which `apps/e2e/tests/accessibility.spec.ts`
  currently pins green in four browsers. `advanceOn` does not cause this; it makes it matter. The
  accessible integration today is for the app to dispatch its own event
  (`document.dispatchEvent(new CustomEvent('app:saved'))`) and match on that, which fires whatever
  the input modality. Widening the trap for `clickThrough` steps is **Phase 8.1b**.
- A `keydown` rule can double-advance against the engine's own arrow-key handler, which calls
  `next()` on ArrowRight/ArrowDown for a non-editable target. Use `when` to exclude the arrows.
- Synthetic events are deliberately **not** rejected. An `isTrusted` check would block the
  app-dispatched `CustomEvent` form, which is the accessible integration above.

---

## ADR-021 — A deep link overrides delivery policy, never eligibility policy

**Status.** Accepted (Phase 8.5).

**Context.** `?gf_tour=<id>` starts a named tour in the application the recipient already has. It is
the only part of the competitor teardown's whole distribution layer that transfers, and it is cheap
precisely because our audience is already inside the product: a support agent pastes a link, the
customer opens it, the guide runs. No clone, no hosting, no share page — and it makes the Zendesk /
Intercom / GitBook row real without writing a single integration, because they all accept a URL.

Three decisions had real alternatives.

**Decision 1 — opt-in per flow, `targeting.deepLink`.** A URL is attacker-controlled and the
recipient is signed in. The bounded exposure is *choice*: which of the host's own flows runs, on
which route, at what moment. That is not nothing — a tour is authoritative-looking copy positioned
over real controls, and with `clickThrough` and now `advanceOn` it can invite a click on one. The
attacker cannot author content; they can only pick. Opting in per flow is what turns "any tour" into
"the ones you would put in a support reply". Types are erased, so it costs core zero.

**Decision 2 — `start(flow, ctx, { force: true })`, NOT `progress.clearCompleted()`.** This is the
one the adversarial pass changed. `start()` gates on dismissal and completion, in that order, each
returning with no render and no event — so a link sent to someone who already finished the tour does
nothing, unobservably, which is the feature dying on its first support ticket. The obvious fix is to
clear the record first.

**That fix is destructive in a way nobody would predict.** `@guideflow/checklist` projects
`getCompletedFlows()`, so clearing a completion **visibly un-ticks the user's checklist**, and
`@guideflow/ai` reads the same key. An attacker-controlled URL would silently destroy progress the
user earned, and `ProgressStore` exposes no raw read of the `flowId@version` entries, so it is not
even restorable. `force` skips the gates for one call and **writes nothing**. It also generalises:
a "Show me this again" button in the host's own UI wants exactly the same thing.

**Decision 3 — a link overrides *delivery* policy, never *eligibility* policy.** `frequency` and
`urlPattern` describe how often and where we would have **pushed** a tour; a human sent the link and
a human clicked it, so both are overridden on purpose. `audience` and `schedule` describe who the
tour is **for** — an author who wrote `audience: { where: { plan: 'enterprise' } }` meant "not this
user", and a URL does not get to overrule them. Two calls to rules already in the bundle.

**Consequences.**

- **Targeting subpath 2.75 → 3 kB**, measured **2.83 kB**. Third raise on that bundle (2 → 2.5 →
  2.75 → 3) which is worth saying out loud; the pattern is still ADR-016's — the cost lands on an
  opt-in subpath and the core entry is untouched, measured at 15.3 kB against 15.5 kB. Only `force`
  touched the entry, for ~10 B.
- **The parameters are stripped, after the start resolves.** Not before: `replaceState` is patched
  by `watchHistory` whenever targeting is installed, so stripping first fires a route change while
  no tour is running and lets `autoStart('load')` win the race with a different tour. And not
  never: `matchUrl` anchors its patterns, so a full-href `urlPattern` can never match a URL still
  carrying `?gf_tour=`, and every such rule would stay silently dead for the rest of the session.
- **The step parameter is `<param>_step`**, derived rather than separately configurable — one knob,
  nothing to keep in sync. A step id naming nothing is a `goTo` no-op, so a link that outlived an
  edit opens the tour at the beginning rather than doing nothing.
- **Refused by construction, and it must stay that way:** no flow definition, JSON or fetch URL from
  the query; no `target`/`selector` (a link that aims the spotlight at the app's real password field
  is a phishing surface on the real origin); no `userId` or context override (progress keys are
  namespaced by user, so that would read and clear someone else's records).
- Targeting's `tour:start` listener records a show for *any* start, so a deep link consumes a global
  frequency-cap slot and can suppress a later legitimate `autoStart`. Documented, not fixed —
  counting a tour the user actually saw is correct.
- **happy-dom cannot observe the strip.** `history.replaceState` does not move `location.href` there
  — measured, and the same limitation CLAUDE.md already records for `pushState`. The unit tests spy
  on the call; `apps/e2e` checks the address bar for real.

---

## ADR-022 — The content pipeline, and the seventh raise (15.5 → 16 kB)

**Status.** Accepted (Phase 8.3 + 8.4 + 8.9).

**Context.** `Step.content` accepts `StepContent | (() => MaybePromise<StepContent>)`. The function
form computes anything, so a **code-authored** flow personalises and localises freely — and
`apps/docs/guide/i18n.md` recommended exactly that.

**A function does not serialise.** So a `.flow.json` — what the devtools recorder (7.9b),
`@guideflow/mcp` (7.11) and `guideflow export` all produce, and what ADR-014 made *the* delivery
format — carries copy frozen in one language with no personalisation. The authoring loop this
project spent three phases building emits tours a PM cannot change without a deploy, and
`I18nRegistry` translates eleven chrome strings and nothing else.

**Decision 1 — one pipeline, in the engine.**

```
the step's own content  →  locale catalogue override  →  {{token}} interpolation  →  renderer
```

In `TourEngine._resolveContent`, not in `DefaultRenderer`: core never assumes the default renderer,
and a custom `RendererContract` must receive finished content. It is one seam because the order is
load-bearing — a **translated** string containing `{{firstName}}` only resolves if the catalogue is
applied before interpolation, and that is the case a two-seam design gets wrong.

It is also the security boundary, and the boundary is drawn between **trust levels, not between
fields**:

| Source | Trust | May reach `content.html` |
|---|---|---|
| the flow's own content | ships with your app | yes |
| the locale catalogue | a file in your repo, reviewed in a PR | **yes** |
| a `{{token}}` value | **runtime, routinely a URL parameter** | **no** |

`title` and `body` are interpolated unconditionally: both leave through the renderer's `_esc`, so a
token value can only ever become visible characters.

**`content.html` is deliberately not interpolated**, and the first implementation of this got it
wrong — it did, under a docstring asserting the opposite. "Interpolate then sanitise" is genuinely
safe for element content, and not for **attribute context**: in `<a href="/r?next={{to}}">` a value
carrying a quote closes the attribute *before* the sanitiser parses anything, so untrusted data
shapes the parse tree and every gap in the allowlist becomes reachable from a URL. `AUDIT.md` §SEC
is a list of gaps that allowlist has already had, and CLAUDE.md's standing instruction for it is
"fix it by parsing, not by adding another regex" — "probably safe, the sanitiser is good" is not the
bar. Compounding it, **`sanitizeHTML` is opt-in** (ADR-009), so the exposed configuration would be
the one a developer chose *believing it was the hardened one*. That is the worst possible shape for
a security-relevant default.

The catalogue may still translate `html`, because a translation file is the same trust level as the
flow file sitting beside it. The rule is about where the data came from, not which field it is in.

**Decision 2 — the catalogue sits beside the flow, and has two maps.** Changing `StepContent` would
touch the validator, the exporter, the devtools panel, the MCP tools and every existing flow file —
a migration for no gain. A flat side catalogue is also what a translator actually wants: strings,
diffable, reviewable in a PR, generatable.

`{ steps, states }` rather than one flat map because **step ids and state ids are separate
namespaces**. Step ids are unique within a flow (`duplicate-step-id` enforces it), but nothing stops
a state being called `welcome` while a step is too. One map would silently collide.

**Decision 3 — chapters are a `label` on `StateNode`, shipped with the catalogue.** A state already
*is* a chapter, and `flowStepIndex`/`flowTotalSteps` already walk the whole flow — a twelve-step
tour across four states renders "Step 7 of 12" and nothing saying which section. This is the name.
On the state for the same reason `route` is: anything that moves a state off the NEXT-only walk
reintroduces the per-state counter bug ADR-008 paid 1.3 kB to fix. It ships **with** 8.4 because a
hardcoded English chapter label would be the one untranslatable string in an otherwise fully
translatable flow file.

**Decision 4 — NO seventh raise. The budget stays at 15.5 kB, and core got *smaller*.**

The feature costs ~380 B and took the entry to 15.68 against a 15.5 kB gate. A raise was written,
taken, and then **withdrawn**, because a genuine saving turned up that is larger than the feature.

**Two candidate savings, and the difference between them is the whole point.**

*Rejected — moving `fromTailwind`/`fromRadix`/`fromShadcn` (and the intro-compat exports) off the
entry.* It drops the measured figure by 330 B, or 1070 B with compat included. But `size-limit` has
no `import` key, so it bundles `dist/index.js` with every export live, whereas `sideEffects` is
`["**/*.css"]`. Measured against a real `import { createGuideFlow }`: **14167 B before, 14170 B
after — three bytes worse**, and the esbuild metafile lists neither module as an input. Every
bundler already shakes them away. That is a bookkeeping change dressed as a saving, and taking it
would have laundered 380 real bytes behind it.

*Taken — minifying the four injected CSS template literals at build time.* `POPOVER_CSS`,
`SPOTLIGHT_CSS` and the hotspot and hint blocks are written readably, with comments and indentation,
because they are read far more often than they are changed — and every one of those bytes shipped.
A ~20-line `onLoad` plugin in `tsup.config.ts` runs each through esbuild's CSS loader. The source is
untouched; only the emitted bytes shrink. **−570 B at the gate and −570 B for a real consumer**,
which is the test the other candidate failed.

**Net: 15.3 → 15.11 kB.** The content pipeline ships and the entry is *smaller than before it*.

Genuine trims inside the feature were measured and rejected: dropping dotted-path tokens saves 30 B
and costs `{{user.name}}`. There is no other fat.

**Consequences.**
- **Still six raises, not seven.** 12 → 12.5 → 13 → 14.5 → 15 → 15.5, measured **15.11 kB** with
  ~390 B of headroom. Every docs figure quoting a bundle size should say **~15.1 kB**.
- The CSS plugin's `onLoad` filter must match **both** path separators. A forward-slash-only filter
  matches nothing on Windows and the plugin silently does no work — which is exactly what the first
  version did, measuring a 20 B saving instead of 570 B and looking like the idea had simply failed.
- Three larger savings were measured and **not** taken, because each removes something from the
  default entry and is a breaking change deserving its own decision: `HotspotManager` (−1073 B for a
  real consumer, constructed unconditionally in `createGuideFlow`), `HintSystem` (−513 B, same
  shape), `BroadcastSync` (−174 B). Worth revisiting deliberately; not as budget-clearing for an
  unrelated feature.
- `RendererContract.renderStep` gains an optional fifth argument. Additive: an existing renderer
  that ignores it still satisfies the interface.
- **Do not assert escaping through `innerHTML` in happy-dom.** MEASURED: it parses `&lt;img&gt;`
  into a text node correctly, then returns `innerHTML` with the entities *decoded*. A string check
  there tests happy-dom's serialiser and reads as a vulnerability that is not present. Assert
  `querySelector` and `textContent`; `apps/e2e` is where serialisation is real.
- An unresolved token renders **as written**, not as a gap. A visible `{{plan}}` gets fixed; an empty
  space in a sentence does not, because nobody notices it.
- Interpolation is one pass, so a context value containing `{{...}}` cannot reach back into the
  context. Pinned by a test.
