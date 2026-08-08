# Expansion plan — Phase 8

What to take from `COMPETITOR-TEARDOWN.md`, what to decline, and the sequence for the part that
transfers.

> **Read `COMPETITOR-TEARDOWN.md` first.** This document is the response to it. It does not repeat
> its contents; it grades them.
>
> `AUDIT.md` is what is broken. `REMEDIATION-PLAN.md` is the ordered queue. `PRODUCT-ROADMAP.md` is
> the strategy. **This is the expansion queue**, and it lands as Phase 8 of the remediation plan.

---

## 1. The finding that shapes everything below

`COMPETITOR-TEARDOWN.md` is a teardown of **guideflow.com**. This repository is **GuideFlow.js**.
They share a name and they are not the same product.

| | GuideFlow.js — this repo | guideflow.com — the teardown |
|---|---|---|
| Runs on | the customer's **real application** | a **captured clone** of it |
| Audience | that application's **own signed-in users** | **prospects** who do not have the product |
| Job to be done | onboarding, feature adoption, in-app help | pre-sales demos, pipeline generation |
| Shape | an MIT npm library you `import` | a hosted SaaS you log in to |
| Backend | **none, by decision** (ADR-014) | required — capture storage, hosting, CRM sync |
| Money | none; the library is the funnel | $35 – $2,999+/month, seat-based |
| Competes with | driver.js, intro.js, Shepherd, react-joyride | Navattic, Storylane, Reprise, Walnut, Arcade |

This is not a pedantic distinction. It changes the answer to most of the document:

- **§11's build order starts with the wrong thing for us.** Items 1–5 are *capture* — screenshot
  capture, a Chrome capture client, HTML/DOM snapshotting, element addressing over the snapshot,
  auto-linking. Every one exists to reconstruct an application the viewer cannot run. **We run
  inside the real application.** The DOM is already there, live, and `@guideflow/core/selector`
  already addresses it. Capture is the competitor's central technical problem and it is *not a
  problem we have*.
- **Four of the seven use-case segments are unreachable at any level of effort.** §6.1 Marketing,
  §6.2 Sales, §6.3 Pre-Sales and §6.5 Partnerships all require an audience that does not have the
  product. Three transfer — §6.4 Support, §6.6 internal Training, §6.7 Onboarding — and two of those
  three are already served by what shipped in Phases 7.8 through 7.11.
- **The distribution and hosting layer (§4 Stage 4, §8) requires a backend**, which ADR-014 decided
  against on evidence, after deleting `guideflow push` and its dead endpoint.
- **§9's monetisation logic does not apply.** It advises paywalling HTML capture. We have no
  paywall, no seats and no capture.

**So the instruction "implement them" cannot be followed literally, and should not be.** Doing so
means building a demo-automation SaaS: a different product, in a different category, against funded
incumbents, requiring a backend this project deliberately does not have. It would reverse ADR-002
(zero dependencies, hard size budget), ADR-014 (no server) and ADR-019 (no credentials anywhere)
simultaneously — and it would recreate precisely the failure mode Phases 4–7 spent their time
deleting: features that exist in a document and not in the code.

**What this plan is instead:** a real subset transfers, and several items are load-bearing gaps that
nothing in the audit had named — including one where the repo has already paid for the expensive
half and is not collecting on it. They make the library materially more competitive *in its own
category*, and none needs a server.

> **The source document is truncated.** `COMPETITOR-TEARDOWN.md` ends mid-sentence at line 333,
> inside item 7 of the build order — items 7+ were never captured. The triage below covers §§3–10 in
> full and §11 items 1–6. If the missing tail matters, re-capture it and re-grade.

---

## 2. The correction that matters more than the triage

**The binding constraint on this project is no longer capability. It is distribution.**

The audit has no open P0s. Twelve packages ship. 1260 unit tests and 391 e2e tests pass across four
browsers. Targeting, frequency capping, checklists, banners, surveys, versioning, SPA routing, the
a11y work and the static-asset delivery story have all landed. Measured against
`PRODUCT-ROADMAP.md` §2's own table, the two red cells — SPA route changes and accessibility — are
both closed.

What is *not* closed is anything that lets a stranger find, install or trust it:

| Blocker | Status |
|---|---|
| **The devtools extension cannot be installed** | `private: true`, no store listing. Task 7.9c — the only pending item in the entire remediation plan |
| **The extension detects almost no real application** | `window.__guideflow` is set by `apps/demo` and the e2e fixture — **never by the library**. See 8.2 |
| **The accessibility claim still cannot be made** | No manual screen-reader pass has ever been run. `SCREEN-READER-PASS.md` is written and waiting |
| **The README leads with a pitch the roadmap says to drop** | "AI-Powered Product Tours"; `PRODUCT-ROADMAP.md` §1 recommends leading with the engine |
| **No published browser-support matrix; core coverage below 90%** | `PRODUCT-ROADMAP.md` §5, unchecked |

`PRODUCT-ROADMAP.md` §2 names the devtools extension as one of only two things nothing else in the
OSS tier has. It currently reaches **zero** real applications, for a reason CLAUDE.md already
records and that costs about forty bytes to fix.

**A thirteenth package does less for adoption than shipping the extension and running one NVDA
session.** Phase 8 is worth building. It should not jump the queue ahead of §2's list, and 8.2
belongs in that list rather than in this one.

---

## 3. Triage

Every capability in §§3–7, sorted. Four buckets.

### 3.1 Already shipped — do not rebuild

The teardown is a checklist of a mature product, so much of it reads as missing when it is not.
**Roughly twenty-one of its capabilities already ship here under different names.** Check this table
before building anything from that document.

| Teardown capability | What already does it |
|---|---|
| Guidance overlays: tooltips, spotlights, popups, hotspots (§4.2) | `packages/core` — the renderer, `hotspot.ts`, `hint.ts` |
| Branching, multi-button popups (§3.1, §4.2) | `StateNode.on` + `StepAction.action` naming any FSM event. Branching is the *default* here, not a feature |
| Checklists with progress and jump-to (§4.2) | `@guideflow/checklist`, ADR-011 |
| Surveys, in-demo feedback (§4.2, §6.6) | `@guideflow/survey`, ADR-018 |
| CTAs, multiple per flow (§4.2) | `Step.actions` |
| Announcements / interactive changelog (§6.1, §6.7) | `@guideflow/banner`, ADR-017 |
| Conditional show/hide by visitor (§3.2) | `Step.showIf`, `FlowTargeting.audience` |
| Templates, demo library (§4.2) | `.flow.json` + `@guideflow/mcp` + the recorder |
| Demo versioning (§4.2) | `flowId@version`, `versioning.ts`, ADR-014 |
| Change history, one-click restore (§4.6) | git. Flow files are source — a *feature* of the static-asset decision |
| Aggregate + session analytics, drop-off, time per step (§4.5) | `AnalyticsCollector`. **Aggregation is host-side — see 8.6** |
| Segment, Mixpanel, Amplitude sync (§7) | `packages/analytics/src/transports/` — five ship, incl. PostHog which the teardown omits |
| Webhooks, Zapier, Make, Resthooks (§7) | `WebhookTransport`; Zapier and Make consume webhooks |
| Slack / Teams / email alerting (§4.5) | `WebhookTransport` → the host's automation. A library must not hold a Slack token |
| REST / Analytics / Workflow API (§7) | the instance *is* the API; events are the seam |
| A/B testing variants | `ExperimentEngine` — the teardown does not even claim this |
| Autoplay, step transitions (§4.2) | engine + `motion.css`, honouring `prefers-reduced-motion` |
| Branding: colours, fonts, themes, dark mode (§4.2) | `packages/core/src/tokens` + a pluggable `RendererContract` |
| Localization — *of the chrome only* (§5) | `I18nRegistry`. **Step content is not covered — see 8.4** |
| Offline (§4.4) | already true; a flow file is a static asset with nothing to phone home to |
| PII blur / redaction risk (§2, §4.2, §8) | not applicable. We never copy the page — the user's own data stays in their own session |

### 3.2 Adopt — Phase 8

| # | Teardown capability | Becomes |
|---|---|---|
| 8.1 | Auto-linking, "step transitions" (§3.4, §4.2) | **`advanceOn`** — advance when the user does the thing |
| 8.2 | Remote control / cross-frame events (§7) | Opt-in `window.__guideflow`, so the extension finds real apps |
| 8.3 | Dynamic variables `{{FIRST_NAME}}` (§4.3, §11.6) | Content interpolation from `GuidanceContext` |
| 8.4 | AI translation, 100+ languages (§5) | A serialisable per-locale content dimension |
| 8.5 | Public / custom links (§4.4), ticket walkthroughs (§6.4) | `?gf_tour=` deep-link start on the targeting subpath |
| 8.6 | Funnels, drop-off, path analysis (§4.5) | `computeFunnel(events)` in `@guideflow/analytics` |
| 8.7 | Demo Page / Demo Center (§3.2, §3.3) | `@guideflow/resource-centre` — closes an open audit finding |
| 8.8 | Insert / reorder / re-record one step (§4.1) | Recorder UI work, no library bytes |
| 8.9 | Chapters (§4.2) | A `label` on `StateNode`, shipped **with** 8.4 |
| 8.10 | AI translation tooling (§5) | `extract_strings` + `translate_flow` MCP tools |
| 8.11 | Heap, Google Analytics (§7) | Two transports; four of six already ship |
| 8.12 | Changelogs, help-centre embedding, ABM (§6.1, §6.4) | Documentation recipes over shipped parts |

### 3.3 Reframe — the job is real, the shape is wrong

- **Embed any iframe or third-party widget (§4.2).** `sanitize.ts` blocks `iframe` deliberately and
  should keep blocking it — a sanitiser that admits iframes is not a sanitiser. The escape hatch
  already exists: implement `RendererContract`. Document it; do not widen the allowlist.
- **Lead forms, consent capture, calendar booking (§4.2).** `@guideflow/survey` has the answer seam
  and the host owns the endpoint. What a library must **not** do is store leads or hold a Calendly
  key. Document the routing; add no storage.
- **Visitor identification and Clearbit-style enrichment (§4.5).** Third-party data-brokerage inside
  an end user's session. In the teardown's model the viewer is an anonymous prospect; in ours they
  are the customer's **signed-in user**, whose identity the customer already knows and who did not
  consent to enrichment. It contradicts `packages/analytics/src/privacy.ts` line for line. Decline.
- **Lead scoring and routing (§4.5).** Belongs where the CRM is — server-side, over the events we
  already emit. 8.6 is the client-side half that is honestly ours.
- **Presenter mode with private notes (§4.2, §3.5).** Built for a rep presenting a clone. The in-app
  equivalent is `Step.meta`, which exists and already reaches analytics.
- **HTML capture, the 5% worth keeping.** Capture a DOM *fingerprint* per step for selector-drift
  detection in CI — "this selector no longer matches" is a real problem for a live-DOM library.
  Stop there. That is a hash, not a snapshot, and not a hosting tier.

### 3.4 Different product — not in this repository

Each needs a capture engine, a hosted backend, or a sales organisation.

| Capability | What it actually requires |
|---|---|
| Screenshot / video / HTML-DOM capture (§4.1, §11.1–3) | A capture client, a snapshot format, asset rewriting, and storage for all of it |
| Sandbox — freely clickable clone (§3.4) | HTML capture + auto-linking + hosting |
| Live Demo — emulated backend via proxy (§3.5) | A proxy tier, per-session reset, dataset injection. A distributed system |
| Mobile Demo — device mirroring, frame library (§3.6) | A mobile capture pipeline and a rendering host |
| Hosted Demo Center, custom domains, white-label (§3.3, §4.4) | Multi-tenant hosting, TLS provisioning, a CDN |
| Public links with expiry, password/domain gating, auth tokens (§4.4) | An authorization service |
| MP4 / GIF / PDF export (§4.4) | Server-side rendering and encoding |
| Real-time co-editing, presence, cursors, comments (§4.6) | CRDTs or OT, a websocket tier, and accounts |
| SSO / SAML / SCIM, RBAC, folders, workspaces (§4.6, §8) | An identity system. There are no accounts here |
| AI voiceover, avatars, video clones, dataset generator (§5) | Media generation infrastructure, per-minute cost, a billing relationship |
| AI visitor/account recognition (§4.5) | An identity-resolution data vendor |
| SOC 2 Type II, DPAs, subprocessor list, 99.9% SLA (§8) | A company. **A library that processes and stores no data needs none of it** — that is the strongest privacy posture in the table, not the weakest |
| Seat-based pricing, five tiers (§9) | A business model. This is MIT-licensed |

**If the demo-automation product is genuinely wanted, it is a separate repository, a separate
product decision and a separate business.** The honest accounting on reuse: `@guideflow/core/selector`
and the recorder's capture UX transfer. The FSM engine, persistence, targeting, the four dock
packages and the entire a11y investment do not — they all assume a live application and a
logged-in user. Twelve packages, and roughly two files cross over. It could reasonably be a
*customer* of this library. It must not be built inside it.

---

## 4. Phase 8 — the work

House rules apply: one concern per changeset, a test with every change, a changeset for every
user-visible change, no silent budget raises.

### 8.1 `advanceOn` — advance when the user actually does the thing

> **Shipped.** See ADR-020. The helper form was taken; a declarative `Step.advanceOn` was not.
> The keyboard limitation it surfaced is registered as **8.1b**, not hidden.

**The highest-leverage item in the document, and the repo has already paid for the expensive half.**

ADR-004 / Phase 7.2 spent ~1.3 kB rebuilding the overlay so `clickThrough` carves a real `clip-path`
hole and the user can genuinely click the spotlit control. **And then nothing happens.** Measured:
the engine attaches exactly one listener — `document.addEventListener('keydown', …)` at
[tour.ts:655](../../packages/core/src/engine/tour.ts#L655) — and nothing at all on the target. The
spotlight's only other listeners are a backdrop-dismiss click and scroll/resize.

So a `clickThrough` step invites the user to press the button, the app responds, and the tour sits
there waiting for **Next**. `apps/docs/guide/accessibility.md` already describes these as steps that
"ask the user to interact with the page". `advanceOn` does not exist anywhere in the repo — verified
by grep across `packages/` and `apps/docs/`.

Shepherd ships `advanceOn`. driver.js ships `onNextClick`. This is table stakes in the tier
GuideFlow actually competes in, it is what makes the §6.4 support use case work, and stripped of the
SaaS it is the one true idea in the teardown: **the difference between "read this" and "do this".**
Every engagement figure §6 leads with rests on people doing rather than watching.

**Shape — helper first, declarative field only if usage asks.**

`step:enter` already carries the resolved element
([types/index.ts:451](../../packages/core/src/types/index.ts#L451)) and `next()` / `send()` are
public. So a helper on `@guideflow/core/navigation` costs the **core entry zero bytes**:

```ts
advanceOn(gf, { stepId: 'save', event: 'click' })
```

A declarative `Step.advanceOn` is the better authoring story and the one a `.flow.json` can carry —
but it is core bytes (~200–300 B) against 300 B of headroom. **Ship the helper first**, measure
demand, and take the field with an ADR if it earns it.

**Tests.** Listener attached on enter and removed on exit; removed on pause, stop and destroy; not
leaked across a fast next/prev (the `_renderGeneration` discipline applies); no advance when the
target is detached. **E2E is mandatory** — `clip-path` hit-testing does not exist in happy-dom.

### 8.2 Opt-in `window.__guideflow` — let the extension find real applications

> **Shipped.** Cost ~90 B, not the estimated 40 — `configure()` support and the identity-guarded
> teardown were both needed. Core entry 15.29 / 15.5 kB.

The highest value-per-byte item in the whole document, and it belongs in §2's distribution list.

`PRODUCT-ROADMAP.md` §2 names the devtools extension as one of two things nothing else in the OSS
tier has. The extension detects tours through `window.__guideflow`. **No package in `packages/*`
ever assigns it** — only `apps/demo/src/main.tsx:195` and the e2e fixture. CLAUDE.md already records
this as the explanation for every "the extension doesn't detect my app" report.

So the unique feature reaches zero real applications unless a developer guesses an undocumented
global.

```ts
createGuideFlow({ exposeGlobal: true })   // or import '@guideflow/core/devtools'
```

**Must be opt-in, not default** — the global lets any script on the page drive the tour, which is
fine when the developer asked for it and is not fine by default. ~40 B behind a flag, or literally
zero as a documented one-liner. Ship it with the store listing (7.9c) so the extension arrives with
something to detect.

### 8.3 Content variables — `{{token}}` interpolation

**The gap, precisely.** `Step.content` accepts `StepContent | (() => MaybePromise<StepContent>)`. The
function form can compute anything, so a **code-authored** flow already personalises freely, and
`apps/docs/guide/i18n.md` recommends exactly that.

**A function does not serialise.** So a `.flow.json` — the output of the recorder (7.9b), of
`@guideflow/mcp` (7.11), of `guideflow export`, and the whole static-asset delivery model of
ADR-014 — **can carry no personalisation at all.** The authoring loop this project spent three
phases building produces tours whose text is frozen at author time.

That is the gap between "a PM can edit the tour" and "a PM can edit the tour *and use the user's
name*". It is not in `AUDIT.md`.

```jsonc
{ "id": "welcome", "content": { "title": "Welcome back, {{firstName}}", "body": "Your {{plan|team}} plan is ready." } }
```

- Resolved from `GuidanceContext` — already an open `Record<string, unknown>`, already how targeting
  audiences read host data. No new configuration surface.
- `{{token|fallback}}` supplies a default. A missing token with no fallback **renders the raw token
  and warns once** under `config.debug` — an empty sentence is a worse failure than a visible one,
  because nobody notices it.
- **Hard constraint: text only.** Resolved tokens go through the renderer's `_esc` and **never** into
  `content.html`. A variable expanded into the html field is an injection sink that walks straight
  past the ADR-009 sanitiser seam, and `GuidanceContext` is routinely fed from URL parameters.
- **Where:** the engine's content-resolution path, not `DefaultRenderer` — `core` never assumes the
  default renderer (§5.4), and a custom `RendererContract` must receive resolved content too.

**Budget.** ~150–250 B against 300 B of headroom. This competes directly with a declarative
`Step.advanceOn` for the same headroom — see §5.

### 8.4 Content localisation, and 8.9 chapters with it

> **Shipped with 8.3** as one pipeline. See ADR-022 — including the seventh size raise and
> the `content.html` rule, which the first implementation got wrong.

**Same root cause, same seam.** `Locale` is a closed interface of **eleven chrome strings**.
`apps/docs/guide/i18n.md:11` says so outright: *"it does not translate your step content"* — and
offers the same `content`-as-function workaround a flow file cannot hold.

So **a `.flow.json` tour exists in exactly one language, permanently.** Localisation is an
enterprise procurement checkbox and no OSS competitor ships it.

**Shape — a catalogue beside the flow, not a change to `StepContent`.**

```ts
gf.i18n.registerContent('es', { welcome: { title: 'Bienvenido de nuevo, {{firstName}}', body: '…' } })
```

1. Changing `StepContent` inline would touch the validator, the exporter, the devtools panel, the
   MCP tools and every existing flow file — a migration for no gain.
2. **Translators want a file of strings, not your state machine.** A flat `stepId → { title, body }`
   map is sendable, diffable, reviewable in a PR, and generatable by 8.10.
3. Untranslated keys fall through to the flow's own content, so a partial translation degrades one
   string at a time instead of failing.

**Composition with 8.3 is why these ship together.** One resolution pipeline, one place:

```
raw content → locale catalogue override → variable interpolation → renderer
```

A translated string containing `{{firstName}}` therefore works — the case that matters, and the one
a two-seam design gets wrong.

**8.9 chapters ships here, not earlier.** The FSM already *is* the chapter structure: states are
chapters, and `flowStepIndex`/`flowTotalSteps` already walk the flow-wide path. What is missing is a
`label?: string` on `StateNode` surfaced through `RendererContract` — a 12-step tour across four
states renders "Step 7 of 12" and nothing saying which section. Tens of bytes. **It must not ship
before localisation**: a hardcoded English chapter label is a regression against a flow file that is
otherwise fully translatable.

**Regression risk, checked.** `@guideflow/react`'s `GuidePopover` reads `gf.i18n`
([GuidePopover.tsx:206](../../packages/react/src/components/GuidePopover.tsx#L206)) — the *instance*
registry. The audit's `react-guidepopover-ignores-instance-i18n` is **fixed in code**, so localised
content will reach React. **The warning is stale in two places** and must go in this changeset —
`CLAUDE.md` §5.5 and the `::: warning React GuidePopover` block in `apps/docs/guide/i18n.md` — or
8.4 ships documented as broken on the largest adapter. *(A live doc-truth defect; it stands whether
or not 8.4 is built.)* Verify the headless renderer's `setI18n` and the componentless Vue/Svelte
adapters too.

### 8.5 `?gf_tour=` — a link that starts a named tour

> **Shipped.** See ADR-021. Two things the design panel changed: `start(flow, ctx, { force: true })`
> rather than clearing the completion record, which would un-tick `@guideflow/checklist`; and
> `audience`/`schedule` are *not* overridden — a link overrides delivery policy, not eligibility.

The only survivor of the teardown's entire distribution layer, and the cheapest possible answer to
all of Stage 4: **the distribution problem disappears when the audience is already inside the
product.** A support agent pastes a link; the customer lands in their own app with the guide
running. No clone, no hosting. It also makes the Zendesk / Intercom / GitBook / Mintlify row real
without writing a single integration — they all accept a URL.

Verified absent: `StartTrigger` is `'manual' | 'load' | 'selector' | 'event'`
([types/index.ts:333](../../packages/core/src/types/index.ts#L333)) and `URLSearchParams` appears
nowhere in `packages/core/src`.

Lands on the **targeting subpath**, which already owns the `watchHistory` subscription (ADR-016), so
the core entry pays nothing. Add a "copy launch link" affordance to the recorder.

**One trap that must be handled or the feature silently no-ops:** `start()` checks `isCompleted`
*before* the snapshot version gate ([index.ts:390](../../packages/core/src/index.ts#L390) vs
[:399](../../packages/core/src/index.ts#L399)). A replay link for a user who already finished the
tour returns silently — no render, no event. It needs `progress.clearCompleted(userId, flowId)`
first, which is exactly what 7.10b added.

### 8.6 `computeFunnel(events)` in `@guideflow/analytics`

> **Shipped**, plus a defect it surfaced: the three `step.*` events carried no `flow_id`, so a
> step id — unique only within a flow — arrived unattributed. Fixed in the collector.

The collector emits everything §4.5's drop-off analysis needs and leaves the arithmetic to the host.
A **pure function** — events in, per-step reached/completed/dropped out — turns a raw stream into
the number everyone asks for, with no storage, no dashboard, no backend. It is also the honest half
of "path analysis": we can compute a funnel over one client's events; cross-session aggregation is
the host's warehouse and stays there.

### 8.7 The resource centre

> **Shipped as four additions to `@guideflow/checklist`, not as a package — ADR-023.**
> A commissioned sceptic won: the audit finding asks for *one* adjacent primitive, and
> ~1,500 of the proposed ~1,900 lines were a near-copy of the checklist. The section below
> is kept for the reasoning that survived; the packaging decision did not.

Closes the last unclosed quarter of **`no-checklists-surveys-banners-resource-centre`**
([AUDIT.md:1013](AUDIT.md)) — checklists shipped in 7.8, banners in 7.8b, surveys in 7.8c. It is
also the one item on `PRODUCT-ROADMAP.md` §2's list of what the commercial tier sells that this
teardown actually supplies, wearing a Demo Center costume (§3.2, §3.3) — and §6.4's "guides embedded
in the help centre" is the in-app version of the same thing.

**Correction.** This section used to say the resource centre was "the only structural reason a user
cannot restart a tour they have already seen". That stopped being true in Phase 8.7's own
groundwork: `@guideflow/checklist` replays a flow-backed done row through
`start(…, { force: true })` — and `force`, not the `clearCompleted` this section originally named,
because clearing would un-tick the very row that launched it.

So the justification is not replay. It is two other things, both structural:

1. **It is the only surface that survives onboarding.** `ChecklistDefinition.hideWhenComplete`
   defaults to *true* and the checklist is permanently dismissible — both correct for a checklist,
   because a list that lingers after you finish is nagging. The consequence is that
   replay-from-the-checklist reaches only users who have neither finished nor dismissed. A help
   launcher is permanent by definition.
2. **It is the only surface that answers "I am stuck on *this page*, now"** — §6.4's job, and the
   one segment of the teardown that genuinely transfers.

A docked launcher plus panel over an **author-declared** list of resources — flows, links and
actions in one list, grouped by an optional heading — showing completion for flow rows through the
same `ProgressStore` projection the checklist uses.

**Author-declared, not auto-populated from `gf.listFlows()`**, and that is forced rather than
chosen: `FlowDefinition` carries `id` and no title, so an auto-built list could only label rows with
internal ids. Adding a title to `FlowDefinition` would make it content, which immediately needs a
catalogue key and an `I18nRegistry` lookup — 8.4's whole argument — so it is a bigger decision than
this package.

**Non-negotiables, inherited from the three that shipped:**

- Zero bytes reach `core`; `core` never imports it. One CSS custom property, as ADR-017 and ADR-018
  each cost.
- A fresh single-segment `setRecord` suffix. `completed`, `caps`, `checklist`, `banner` and `survey`
  are taken — `completed` overwrites core's array byte for byte.
- **`dock-drift.test.ts` grows from three implementations to four.** `createLiveRegion` /
  `setTourActive` are duplicated deliberately; edits land in all of them.
- Refcounted `retainStyles` / `releaseStyles`. `injectStyles` de-dupes by id, so an unconditional
  `removeStyles` on the first `destroy()` silently unstyles every survivor — `@guideflow/checklist`
  shipped that bug once.
- Scaffold at the fixed group's **current** version, never `1.0.0`.
- **Two frictions to settle up front:** `bottom-end` is already the default dock for *both*
  `mountChecklist` and `mountSurvey`, and neither can detect the other; and it needs a flow registry
  — confirm `gf.listFlows()` covers it before designing a second one.
- Mount it in `apps/demo` in the same change and extend `smoke.mjs`. A surface whose only consumer
  is a test fixture is what the 7.8b design panel caught.
- Four docked surfaces on one page is a real a11y question: extend `a11y-announcements.spec.ts`. The
  two-surface announcement collision measured in Phase 6 is still open and a fourth makes it likelier.

### 8.8 Recorder: insert, reorder, re-record one step

The one capture-side behaviour in §4.1 that does not depend on storing a clone. *"One bad step means
re-record the whole thing"* is the most common reason a recorder is abandoned after the first
session. Recorder UI work over `draftToFlow` — **no library bytes, no new package** — and the serial
extension project in `apps/e2e/tests-extension` already exists to prove it.

### 8.10 `extract_strings` and `translate_flow` MCP tools

The honest version of §5's AI translation, and the inversion ADR-019 already committed to: **the
client is the model.** `extract_strings` reads a flow and emits 8.4's catalogue skeleton;
`translate_flow` takes a filled catalogue and validates it against the flow — every key resolves to
a real step, no step lost a `{{token}}` in translation.

Both stay **read-only and key-free** like the four tools already registered. The operator's MCP
client translates with its own credentials and a human reviews the diff before it is committed:
cheaper, safer and more reviewable than an AI call in an end user's browser, which is what
`PRODUCT-ROADMAP.md` §3 Phase F.4 already argued.

### 8.11 Google Analytics and Heap transports

Four of the six analytics tools in §7 already ship. GA4 and Heap are missing — two files against an
existing one-method `interface.ts`. GA4 is the most-installed analytics tool in existence. **Lowest
priority here; do it when someone asks.** Raise the analytics coverage ratchet, never lower it.

### 8.12 Documentation recipes — no new code

Per working agreement 6, a documented feature must exist. Each is a page in `apps/docs/guide/`:

- **Interactive changelog / feature launch** (§6.1) — `@guideflow/banner` + a flow targeted at users
  who have not seen the feature.
- **Guides in a help centre** (§6.4) — 8.5's deep link + a `url` targeting rule + 8.7's launcher.
- **ABM-style personalisation** (§6.1) — 8.3's variables from `GuidanceContext`. Include the security
  note: **a URL parameter is attacker-controlled**, so it interpolates as text and never reaches
  `content.html`.
- **Answer routing for surveys and lead capture** (§4.2) — the `onAnswer` seam to the host's own
  endpoint, with the storage question answered: the library stores nothing.
- **Cross-frame remote control** (§7) — `postMessage` over the public API, with the `event.origin`
  discipline `packages/devtools/src/content/inspector.ts` already applies to its relay.

---

## 5. Sequencing, and the one contentious budget conversation

| Item | Core bytes | New package | Size |
|---|---|---|---|
| 8.1 `advanceOn` helper | **0** (subpath) | — | S |
| 8.2 `exposeGlobal` | ~40 B | — | XS |
| 8.3 variables | ~150–250 B | — | M |
| 8.4 content i18n + 8.9 chapters | ~150–200 B | — | M |
| 8.5 deep link | 0 (targeting subpath) | — | S |
| 8.6 funnel | 0 | — | S |
| 8.7 resource centre | 0 | ✅ 13th | L |
| 8.8 recorder editing | 0 | — | M |
| 8.10 MCP tools | 0 | — | S |
| 8.11 GA/Heap | 0 | — | S |
| 8.12 recipes | 0 | — | S |

**Order: 8.2 → 8.1 → 8.5 → 8.6 → 8.3 + 8.4 + 8.9 → 8.7 → 8.10 → 8.8 → 8.11 → 8.12.**

8.2 is forty bytes and unblocks the extension, so it goes first and ships with 7.9c. 8.1 is the
highest-leverage item and costs the core entry nothing as a helper. 8.5 and 8.6 are cheap and
independent. Then the content pair, which is the differentiating work and the only real budget
question. 8.7 is the largest single piece. 8.12 documents whatever actually shipped, so it goes last.

**The budget conversation, stated once.** Core is at **15.2 kB against 15.5 kB — 300 B of headroom**,
after six raises. Three Phase 8 items want core bytes: `exposeGlobal` (~40 B), variables (~150–250 B)
and content i18n (~150–200 B) — plus a declarative `Step.advanceOn` (~200–300 B) if the helper earns
it. **They do not all fit.** CLAUDE.md is explicit: *"the next addition should look for a real saving
before asking for a seventh."*

So: **look for the saving first, and take at most one raise for the whole phase**, in the changeset
that needs it, with a real `pnpm --filter @guideflow/core size` figure and an ADR — the way ADR-014
did. Do **not** take three separate raises, and do **not** hide variables behind a
`createGuideFlow({ interpolate })` seam purely to dodge the gate: ADR-009's opt-in was right for a
640 B sanitiser most consumers never use, and would be wrong for a 200 B feature every flow file
wants. If the saving is not there and the raise is refused, ship 8.1/8.2/8.5/8.6/8.7 — which is most
of the phase — and take the content pair on its own merits later.

---

## 6. Regression discipline

The instruction was to upgrade without regressing. The specific hazards:

1. **The size budget is the first thing to break.** See §5. Any raise needs an ADR, a measurement in
   the same changeset, and a docs sweep — every figure quoting a bundle size updates together.
2. **`StepContent` must not change shape.** 8.4 is a side catalogue for exactly this reason.
3. **Interpolation order is a security boundary.** Interpolate → sanitise → escape, and never into
   `content.html`. Reversing it turns `GuidanceContext` — routinely fed from URL parameters — into
   an XSS vector. Pin the order with a test that fails loudly if it flips.
4. **`advanceOn` must not leak listeners.** Attach on enter, detach on exit, pause, stop and destroy,
   and respect `_renderGeneration` so a fast next/prev cannot leave one behind.
5. **`exposeGlobal` must stay opt-in.** Default-on hands any script on the page control of the tour.
6. **A fourth docked surface must not break the other three.** Extend `dock-drift.test.ts`; do not
   exempt the new one. Re-run the announcement audit with four regions live.
7. **A new package joins the changesets fixed group at the current version.** `1.0.0` majors all
   twelve packages, then majors them again as every `>=0.1.9 <1.0.0` peer falls out of range.
8. **`pnpm test` proves nothing about layout, focus or pointer capture.** 8.1 and 8.7 must be
   verified in `apps/e2e`; happy-dom has no layout engine and no `clip-path` hit-testing.
9. **Every user-visible change needs a changeset.** Six are already unreleased and will take all
   twelve packages to `0.2.0` together.

---

## 7. Exit criteria

- [x] A `clickThrough` step advances when the user clicks the highlighted control, proven in e2e
- [x] `createGuideFlow({ exposeGlobal: true })` makes the devtools extension detect a real app
- [x] A `.flow.json` with no JavaScript at all renders personalised, translated content
- [x] `{{token}}` resolves from `GuidanceContext`, with fallbacks, escaped in every path, never into `content.html`
- [x] A locale catalogue is registrable, partial, and falls through per key
- [x] The stale React `GuidePopover` i18n warning is gone from `CLAUDE.md` and `apps/docs`
- [x] A link starts a named tour in the recipient's own app, including for a user who already finished it
- [x] `no-checklists-surveys-banners-resource-centre` closed — three surfaces plus the checklist's help-centre mode (ADR-023)
- [ ] Four docked surfaces coexist on one page with a clean announcement audit
- [x] `computeFunnel` turns collector events into per-step drop-off
- [ ] Build, type-check, lint, unit and e2e all green; `core` inside its stated budget

**Declined, not deferred:** capture of any kind, hosting, public link infrastructure, a sandbox, a
clone, MP4/GIF/PDF export, SSO, collaborative editing, AI voice or avatars, visitor enrichment, lead
scoring, or SOC 2. §3.4 has the reasoning.

---

## 8. One decision that is not ours to make: the name

All three independent review passes raised this unprompted, so it is recorded here rather than left
implicit.

**guideflow.com is an established, funded SaaS in an adjacent category using the same word**, with
named customers (Amplitude, DocuSign, PandaDoc) and presumably a trademark. That is a trademark, SEO
and npm-confusion problem that exists **today**, independent of any feature decision, and it gets
worse the moment this library gets traction.

Adopting their capability list — or their "show don't tell" framing — converts an accidental
collision into a real one *in the same category*. That is the argument for keeping the two products
clearly distinct, which is what §§1 and 3.4 do.

**Right now a rename costs a `repo.config.json` edit and `pnpm sync-repo`** — the script propagates
owner, author, URLs, source headers and the LICENCE holder, and is idempotent. After the npm
packages have adoption it costs a deprecation, a migration guide and a permanent redirect.

**This is a business decision for the owner, not an engineering one, and nothing in Phase 8 depends
on it.** It should be decided on its own merits and on its own timeline — but it should be decided
before 1.0, not after.
