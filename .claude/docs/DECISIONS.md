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
- A flow with no reachable `final: true` state never completes, so completion is never persisted and
  the tour replays forever. Validation must catch this.
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
