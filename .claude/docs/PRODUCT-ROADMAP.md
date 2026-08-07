# Product roadmap

Where GuideFlow stands against the field, and the sequence that gets it to a credible 1.0.

`AUDIT.md` covers what is broken. This document covers what is *missing* — and it is more honest
about strategy than a feature list usually is, because the current positioning has a gap in it.

---

## 1. Honest positioning

The README leads with **"AI-Powered Product Tours"**. That is not what the library is today.

What it actually is, and is genuinely good at: **a small, strict, framework-agnostic tour engine
whose flows are real state machines.** Zero runtime dependencies, 11 kB gzip, strict TypeScript,
React/Vue/Svelte adapters, persistence with cross-tab sync, hotspots and hints, i18n scaffolding, a
pluggable renderer, and an analytics package. Nothing else in the open-source tier models tours as
state machines, and nothing else in the tier ships a devtools extension.

What "AI-powered" currently means: `@guideflow/ai` can call OpenAI/Anthropic/Ollama from the browser
to generate steps from a DOM snapshot, classify user intent, and answer questions. It has no
structured-output mode, no retries, no timeouts, no cost controls, and the documented setup pattern
ships an API key to the client. The intent signal is emitted but never wired to anything. `compress()`
contains a dead persistence branch.

**The strategic call to make now:** either invest until the AI story is genuinely differentiating, or
lead with the FSM engine and treat AI as one capability among several. Leading with a claim the code
does not support is the single biggest credibility risk in the project — a developer who tries
`gf.ai.generate()` from the README and finds it needs a proxy they must build themselves does not
come back.

Recommendation: **lead with the engine, keep AI as a strong second act**, and make the AI act real
(§4). The engine is defensible today; the AI layer is not.

---

## 2. Competitive position

### Open-source tier — the actual competition

| | GuideFlow | driver.js | intro.js | Shepherd | react-joyride |
|---|---|---|---|---|---|
| Size (gzip) | 11 kB | ~5 kB | ~10 kB | ~30 kB (+popper) | ~15 kB |
| Runtime deps | **0** | 0 | 0 | floating-ui | react |
| State-machine flows | **✅ unique** | ❌ | ❌ | ❌ | ❌ |
| Framework adapters | React/Vue/Svelte | vanilla | vanilla | vanilla + wrappers | React only |
| TypeScript strictness | **very high** | good | fair | good | good |
| Persistence + cross-tab | **✅** | ❌ | ❌ | ❌ | ❌ |
| Analytics package | **✅** | ❌ | ❌ | events only | callbacks |
| A/B testing | **✅** | ❌ | ❌ | ❌ | ❌ |
| Devtools extension | **✅ unique** | ❌ | ❌ | ❌ | ❌ |
| AI generation | **✅ unique (partial)** | ❌ | ❌ | ❌ | ❌ |
| **SPA route changes** | **❌** | ❌ | ❌ | ✅ | ✅ |
| Focus trap / a11y | **partial** | partial | partial | ✅ | ✅ |
| GitHub adoption | new | ~20k★ | ~22k★ | ~13k★ | ~7k★ |

Read that table honestly: GuideFlow wins on architecture and loses on maturity and adoption. The two
red cells — **SPA route changes** and **accessibility** — are the ones that actually block adoption,
because they are the first things a real integration hits.

### Commercial tier — where the money is

Userpilot, Appcues, Pendo, Chameleon, Intercom Product Tours. GuideFlow has the *engine*; they sell
the **workflow around the engine**: a no-code editor, hosted flow storage, audience targeting,
scheduling and frequency capping, checklists, surveys/NPS, banners, a resource centre, and a
dashboard. None of that exists here.

You do not need all of it. Two of those claims used to be made without anything behind them: a
`guideflow push` pointed at `https://api.guideflow.dev/v1/flows`, a service that never existed, and
a `guideflow studio` documented as "the visual tour editor" while actually being a Vite dev server
that injected one boolean. **Both commands were deleted** — `studio` in Phase 7.9, `push` in
Phase 7.10 (ADR-014) — and hosted flow storage was answered without a backend: a `.flow.json` is a
static asset you serve from your own CDN (`apps/docs/guide/hosting-flows.md`).

What genuinely remains from that list is the *workflow*, not the delivery: a no-code editor with
review and rollback, server-side audience selection, a resource centre, and a dashboard. Targeting,
scheduling, frequency capping, checklists, banners and surveys/NPS have since shipped.

Of those four, only the resource centre and the editor are buildable without a backend — the
resource centre is `EXPANSION-PLAN.md` §8.7, and the editor is the recorder (Phase D) once it can
be installed.

---

## 3. Roadmap

Sequenced so each phase unblocks the next. Phases A and B are prerequisites for calling anything else
done.

### Phase A — Make the claims true (weeks 1–3)

Not new features. Closing the gap between README and reality.

- Fix or retract: intro.js attribute migration, `overlayColor`, per-instance i18n, `guideflow studio`,
  `guideflow export`, the dead publish endpoint, the devtools "coming soon" note.
  *(Done. `studio` and `push` were deleted rather than fixed; the rest were fixed.)*
- Fix the P0/P1 engine and security findings in `AUDIT.md`.
- Rebuild the e2e harness so visual behaviour can be verified at all.
- Publish a browser support matrix and a bundle-size table.

Exit criterion: every claim on the README front page is demonstrably true.

### Phase B — Table stakes (weeks 3–8)

The things whose absence ends an evaluation.

1. **SPA route-change handling.** There is currently *zero* handling — no `popstate`, no
   `pushState` interception, nothing. A tour that spans two routes is the most common real
   requirement in the category and GuideFlow cannot do it. Needs: a step-level `waitForTarget` with
   timeout, a `route` hint per step, a history adapter, and re-anchoring after navigation. **Highest
   single-item impact on the roadmap.**
2. **Accessibility to WCAG 2.2 AA.** Focus trap, focus restore, `inert` background, live-region
   announcements, and the arrow-key handler that currently hijacks typing. Not polish — a11y is a
   procurement gate in every enterprise sale.
3. **Target-only interaction.** `clickThrough: true` currently makes the *whole page* clickable, so
   "let the user actually click the highlighted button" is unimplementable. Requires the overlay
   rework in ADR-004.
4. **Adapter parity + a plain `<script>` build.** `core` already emits an IIFE global that is
   undocumented and untested — the cheapest reach win available.
5. **Flow validation.** `guideflow validate` plus a dev-mode runtime check: unreachable states, no
   `final`, duplicate step ids, selectors that match nothing.

### Phase C — Differentiate on the engine (months 2–4)

Turn the state-machine bet into visible advantage.

- **Targeting rules** as guards on the flow itself — audience, feature flags, route, first-seen date,
  and frequency capping ("show at most once per 7 days"). This is what Appcues sells, and the FSM
  makes it natural rather than bolted on.
- ~~**Checklists** — a persistent multi-tour progress widget.~~ **Shipped** as
  `@guideflow/checklist` (Phase 7.8). A projection of `ProgressStore`, not a second source of
  truth; zero bytes reach core. See ADR-011.
- **Banners** — a docked, non-blocking announcement surface. This is the part that is genuinely
  missing.
  **Correction:** the `target: null` centred modal is *not* a hand-rolled workaround. It is a
  supported single-step flow that renders `role="dialog"` + `aria-modal="true"`, suppresses the
  progress bar and step counter, traps and restores focus, and announces through the live region.
  It is now documented at `apps/docs/guide/announcements.md` and pinned by an e2e spec. Its real
  limits are that the overlay blocks the page, only one can be up at a time, dismissal lands in
  the tour funnel as `tour:dismiss` + `tour:abandon`, and the × and Skip button need a custom
  renderer to remove — not that it is a hack.
- **Flow versioning** — `flowId@version`, so a persisted snapshot from an old version does not restore
  into a changed state graph. Today it silently can, and `restore()` does not even clamp `stepIndex`.
- ~~**Surveys / NPS** as a step type feeding the analytics pipeline.~~ **Shipped** as
  `@guideflow/survey` (Phase 7.8c) — and *not* as a step type. A step-type survey lands in the
  tour funnel, so submitting one would emit `tour:complete` and analytics would count every NPS
  response as a completed tour. It is a docked card, like the checklist and the banner. See
  ADR-018.

### Phase D — The authoring loop (months 3–6)

Make the devtools extension the on-ramp, and delete the vaporware.

- Finish the recorder: pick → annotate → reorder → **export a valid `FlowDefinition`** → import back.
- Selector quality is the make-or-break: stable, unique, resilient to Tailwind and CSS-module hashes,
  with a confidence score and a manual override.
- **Then** build a real `guideflow studio` on top of that engine — same code, in-page instead of in
  DevTools. Ship the extension to the Chrome Web Store (it is `private: true` and has no packaging
  job today, so nobody can install it).
- `guideflow validate` and `guideflow doctor`.

### Phase E — Hosting, if you want a business (months 6+)

Only if there is a commercial intent. `push.ts` already implies it.

- Flow storage and edge delivery (Cloudflare Workers + D1 + KV is the cheapest credible stack — see
  `MCP-AND-SKILLS.md`).
- Publish/preview/rollback, and a self-host story from day one — open-source developers will not adopt
  a library whose good parts are hostage to a SaaS.
- An analytics dashboard over the events the collector already emits.

### Phase F — Make "AI-powered" real

Do this **after** Phase A, and only with the security model fixed.

1. **Ship a `ProxyProvider` and make it the documented default.** Keys belong on a server. This is a
   correctness fix disguised as a feature.
2. **Structured outputs** — JSON schema / tool-use mode instead of `JSON.parse()` on prose. Plus
   retries, timeouts, abort signals, and a spend cap. Reliability is the differentiator, not the model.
3. **Wire intent to action.** `intent:detected` is emitted and connected to nothing. An
   `onIntent: { confused: 'help-flow' }` mapping turns a demo into a product.
4. **AI-assisted authoring, not AI-at-runtime.** Generating a tour at build/author time — reviewed by
   a human, committed to the repo — is more valuable, cheaper, and safer than generating one in every
   user's browser. This reframing makes the AI story defensible.
5. **Ship a GuideFlow MCP server** (`list_flows`, `author_flow`, `validate_flow`, `simulate`). It makes
   tour authoring agentic in any MCP client, keeps keys server-side, and shares an engine with
   `validate` and the studio. See `MCP-AND-SKILLS.md` §3.

---

### Phase G — Expansion (Phase 8 in the remediation queue)

See **[`EXPANSION-PLAN.md`](./EXPANSION-PLAN.md)**, which grades
[`COMPETITOR-TEARDOWN.md`](./COMPETITOR-TEARDOWN.md) — a teardown of **guideflow.com**, a hosted
demo-automation SaaS that shares this project's name and is a different product.

Three things from it are worth stating here because they change §2 and §5:

1. **`clickThrough` is a half-feature.** ADR-004 spent ~1.3 kB carving a `clip-path` hole so the
   user can genuinely click the highlighted control, and the engine has no way to notice that they
   did — its only listener is `document` `keydown`. **`advanceOn` is the highest-leverage single
   item now on the roadmap**, and it is table stakes against Shepherd and driver.js.
2. **A `.flow.json` can carry neither variables nor translations.** `Step.content`'s function form
   covers both for code-authored flows and does not serialise, so the entire ADR-014 static-asset
   authoring path — recorder, MCP, `export` — emits tours whose copy is frozen in one language at
   author time. Nothing in the OSS tier has this; the commercial tier sells it.
3. **The binding constraint is distribution, not capability.** No open P0s, twelve packages, 1260
   unit and 391 e2e tests. What blocks adoption is that the devtools extension is unlistable
   (7.9c), the library never sets `window.__guideflow` so the extension detects almost no real
   application, no manual screen-reader pass has run, and this document's own §1 recommendation to
   stop leading with "AI-Powered Product Tours" is unactioned.

**Not adopted, with reasoning in `EXPANSION-PLAN.md` §3.4:** capture of any kind, hosting, sandboxes,
clones, SSO, collaborative editing, AI voice/avatars, visitor enrichment, lead scoring, SOC 2. Those
require a backend and a company; §4 below already says so.

`EXPANSION-PLAN.md` §8 also records a name-collision risk that is the owner's decision, not an
engineering one.

---

## 4. What not to build

- **A general-purpose animation or positioning library.** Use the budget on tours.
- **More framework adapters before the existing three reach parity.** Vue and Svelte ship no
  components and no tests; a fourth adapter deepens the hole.
- **A design system.** Theme tokens plus a pluggable renderer already cover it.
- **A hosted SaaS before the OSS library is genuinely good.** The library is the funnel.
- **More AI surface area before the AI security model is fixed.** Every feature added on top of a
  client-side key pattern is a feature that has to be rewritten.

---

## 5. Definition of 1.0

Ship 1.0 when all of these are true:

- [ ] Every README claim is demonstrably true
- [ ] No open P0 or P1 in `AUDIT.md`
- [ ] SPA route changes handled, with tests
- [ ] WCAG 2.2 AA verified by automated **and** manual screen-reader testing
- [ ] E2E suite runs in CI across Chromium, Firefox and WebKit
- [ ] ≥ 90 % coverage in `core`; every package has real tests
- [ ] React, Vue and Svelte at documented parity
- [ ] Published browser support matrix and per-package size budgets
- [ ] `SECURITY.md`, `CONTRIBUTING.md`, a maintained `CHANGELOG.md`, and a versioning policy
- [ ] A working install path for the devtools extension
- [ ] Either a real studio, or the claim removed
