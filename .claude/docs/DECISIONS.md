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
