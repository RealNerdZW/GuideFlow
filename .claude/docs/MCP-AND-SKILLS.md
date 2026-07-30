# MCP servers and skills for GuideFlow

What to connect, why it earns its place *in this specific repo*, and what to skip.

GuideFlow is a browser-UI library with an FSM engine, a browser extension, an LLM integration and an
npm release pipeline. That shape makes a small number of MCP servers genuinely high-leverage and
makes most of the popular ones irrelevant. The section that matters most is the first one.

---

## 1. MCP servers — recommended

### Tier 1 — connect these

#### Playwright MCP — *the highest-value addition to this project*

```bash
claude mcp add playwright -- npx -y @playwright/mcp@latest
```

**Why it matters here specifically.** GuideFlow's entire product is *pixels and focus in a real
browser*: does the spotlight cutout land on the target, does the popover flip when it would overflow,
does Tab escape the dialog, does the tour survive a scroll. None of that is observable from unit
tests in `happy-dom`, and this repo's Playwright suite **has never actually run** (see
`AUDIT.md`). An MCP-driven browser lets Claude verify a fix by *looking at it* instead of asserting
it from source.

Concretely, it unblocks:
- verifying spotlight/popover geometry against a live `pnpm demo`
- reproducing focus-trap and arrow-key defects a human reported
- taking before/after screenshots for a UI change
- rebuilding the e2e harness with tests that were actually observed to pass first
- running axe against a live tour instead of a fixture that does not load

> Already connected in this workspace. Note it is *complementary to*, not a replacement for,
> `apps/e2e` — MCP drives exploratory verification, `apps/e2e` is the regression gate.

#### Chrome DevTools MCP

```bash
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

Performance traces, console, and network inspection against a real Chrome. Two uses here that
Playwright MCP does not cover well:

- **Extension debugging.** `packages/devtools` is an MV3 extension whose service worker is killed
  after ~30 s idle and whose `postMessage` bridge crosses three JS worlds. Console + network access
  across those contexts is the difference between debugging and guessing.
- **Runtime cost of the tour overlay.** The spotlight re-runs `_update()` on every scroll and resize
  event. A trace tells you whether that is causing layout thrash on a busy page — a question the
  12 kB bundle budget says nothing about.

#### Context7

```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
```

Fetches current, version-pinned docs for a library at the moment you need them. This repo sits on a
lot of fast-moving surface where a stale memory produces confidently wrong code: Svelte 5 runes vs
Svelte 4 stores (the peer range allows both), Vue 3 reactivity, React 19, Vitest 1.x, tsup/rollup
output options for the extension bundle, Turborepo 1 → 2 (`pipeline` → `tasks`), and Playwright's
config surface.

#### GitHub MCP

```bash
claude mcp add --transport http github https://api.githubusercontent.com/mcp/
```

The project lives at `github.com/RealNerdZW/GuideFlow` with three Actions workflows and a
Changesets release bot. Being able to read failing Actions logs, triage issues, and open the release
PR without shelling out to `gh` is a real time saver — particularly for the release flow, where the
"chore: version packages" PR is the mechanism.

### Tier 2 — connect when the matching work starts

| Server | Connect when | Why |
|---|---|---|
| **Cloudflare** (`cloudflare-bindings`, `cloudflare-observability`) | You build the flow-hosting backend | `packages/cli/src/commands/push.ts` ships pointed at `https://api.guideflow.dev/v1/flows`, **a service that does not exist**. Workers + D1 (flow storage) + KV (edge-cached flow delivery) + R2 (media) is the cheapest credible way to make that endpoint real, and it is a genuine product gap, not a nice-to-have. |
| **shadcn/ui** | You build `guideflow studio` | The visual editor is currently the weakest headline claim. shadcn components + Tailwind give you a credible editor UI fast without inventing a design system. Already available in this workspace. |
| **Figma** | You formalise the theming system | `packages/core/src/styles/tokens.css` plus `fromTailwind`/`fromRadix`/`fromShadcn` already imply a token pipeline. Figma variables → design tokens closes it. Already available in this workspace. |
| **Sentry** | The library reports its own errors | `tour:error` is emitted and then swallowed by the host app. A first-party error-reporting story is table stakes for a library embedded in other people's products. |
| **Postman** | You publish the Cloud API | Spec-first design + contract tests for the `push`/flow-delivery API. Already available in this workspace. |

### Explicitly not recommended

- **Filesystem MCP** — Claude Code's native Read/Write/Glob/Grep already cover this, with better
  permission integration.
- **Database MCPs (Postgres/Mongo/BigQuery)** — GuideFlow has no database. Skip until the Cloud
  backend exists, and then pick the one matching what you actually chose.
- **Slack / Notion / Jira / CRM connectors** — single-maintainer OSS project. Pure overhead.
- **Computer-use / desktop control** — Playwright MCP covers browser work far more precisely.

---

## 2. Skills

### Already in this repo (`.claude/skills/`)

| Skill | Use it for |
|---|---|
| `/verify` | The full local gate. Run before claiming *any* task done. |
| `/gf-package-audit` | Deep audit of one package: packaging, exports, docs truth, tests, safety. |
| `/gf-a11y-review` | WCAG 2.2 AA pass over the tour UI. |
| `/gf-flow-authoring` | Author or debug a `FlowDefinition`. Solves most "my tour is broken" reports. |
| `/gf-extension-dev` | Build, load and manually exercise the MV3 extension. |
| `/gf-release` | Changesets release, including the pre-flight checks CI does not do. |
| `/gf-adapter-parity` | Keep React/Vue/Svelte from drifting apart. |

### Worth adding next

Ordered by value to this repo. Use the `skill-creator` skill to scaffold each one.

1. **`/gf-ai-provider`** — the checklist for adding or maintaining an `AIProvider`. The three existing
   providers each hand-parse `JSON.parse()` of raw model output with no structured-output mode, no
   markdown-fence stripping, no retry, no timeout and no abort signal. Encode the correct pattern once
   so provider four does not repeat it. Should reference the built-in **`claude-api`** skill for
   current Anthropic model ids, pricing and tool-use patterns — that skill exists precisely because
   model ids go stale, and `packages/ai` has stale ones.

2. **`/gf-perf-budget`** — bundle size *and* runtime cost. `size-limit` is configured only for
   `core`; the adapters, `ai` and `analytics` have no budget at all. Add per-package budgets, plus a
   runtime protocol (scroll-with-tour-active trace, popover reposition cost, `serializeDOM` payload
   size and token count).

3. **`/gf-analytics-taxonomy`** — event names, required properties, PII rules, and the consent gate.
   Right now step-level events ship `flow_id: undefined`, and `url`/`referrer` are sent to third
   parties with no scrubbing. Fix it once, then encode the rule.

4. **`/gf-migrate-compat`** — the compatibility story for driver.js, intro.js and shepherd.js users.
   The README promises intro.js attribute support that `intro-compat.ts` does not implement. A skill
   that defines "supported attribute → GuideFlow equivalent → test" keeps the claim honest.

5. **`/gf-studio`** — once the visual editor is real: how to run it, what it serves, how a recorded
   flow round-trips through `export`/`push`.

### Built-in skills already available and worth using here

| Skill | When |
|---|---|
| `claude-api` | **Any** work in `packages/ai`. Model ids, pricing, structured outputs, streaming, tool use. Load it *before* editing a provider — the current defaults are stale. |
| `security-review` | Before merging anything touching the renderer, the extension, or the CLI. |
| `code-review` | PR review pass. |
| `simplify` | After a large refactor, for reuse/clarity cleanup. Quality only — not a bug hunt. |
| `frontend-design` | Studio and demo UI work. |
| `skill-creator` | Scaffolding the five skills above. |
| `mcp-builder` | If you ever ship a **GuideFlow MCP server** — see below. |
| `dataviz` | The analytics dashboard, if you build one. |

---

## 3. The interesting inversion: ship a GuideFlow MCP server

Everything above is about tools *for building* GuideFlow. There is a product idea in the other
direction, and it is the most credible route to the "AI-powered" claim in the README.

Today `@guideflow/ai` means "call an LLM from the browser with your API key in the bundle" — which is
both a security problem (`AUDIT` §SEC) and a thin feature. An **MCP server that exposes a product's
tours as tools** inverts that:

```
guideflow.list_flows()            → what onboarding exists for this product
guideflow.get_flow(id)            → the FSM definition
guideflow.author_flow(spec)       → generate a validated FlowDefinition
guideflow.validate_flow(flow)     → FSM correctness, selector stability, a11y lint
guideflow.simulate(flow, url)     → drive it headlessly, return step-by-step screenshots
```

That makes tour authoring an agentic workflow in any MCP client, keeps API keys server-side where
they belong, and turns `guideflow validate` and the visual studio into the same engine. Use the
`mcp-builder` skill to scaffold it. Tracked as a Phase 6 item in `REMEDIATION-PLAN.md`.

---

## 4. Setting up

```bash
# project-scoped (writes .mcp.json, shared with the team)
claude mcp add --scope project playwright -- npx -y @playwright/mcp@latest
claude mcp add --scope project context7  -- npx -y @upstash/context7-mcp@latest

# user-scoped (yours only)
claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest

claude mcp list          # verify connection
```

Servers needing OAuth (GitHub, Cloudflare, Figma, Sentry, Postman) must be authorised from an
**interactive** session — `/mcp` in the terminal, or the connector settings on claude.ai. They cannot
be authorised from a headless or non-interactive run.

Commit `.mcp.json` so the toolchain travels with the repo. Keep tokens in the environment, never in
the file.
