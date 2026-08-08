# `.claude/` — Claude Code assets for GuideFlow.js

Everything in here is **committed and shared**. Only `settings.local.json` and `local/` are
gitignored (per-developer state).

Start at [`../CLAUDE.md`](../CLAUDE.md) for the operating manual, then come here.

## Documents (`docs/`)

| File | What it is | Read it when |
|---|---|---|
| [`AUDIT.md`](docs/AUDIT.md) | The full engineering audit — **325 verified findings (22 P0, 119 P1)**, each with file:line evidence and a fix. | Always. This is the source of truth for "what's wrong". |
| [`audit-findings.json`](docs/audit-findings.json) | The same findings, machine-readable. Filter by area/severity/status; mark `"status": "resolved"` as you fix them. | Automating, filtering, or reporting progress. |
| [`REMEDIATION-PLAN.md`](docs/REMEDIATION-PLAN.md) | The ordered work queue derived from the audit. Phases 0–6, checkbox tasks, acceptance criteria. | You're about to do work. Pick the next unchecked task. |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the FSM engine, render pipeline, persistence and adapters actually fit together, with the invariants you must not break. | Before editing `packages/core`. |
| [`TESTING-STRATEGY.md`](docs/TESTING-STRATEGY.md) | Current coverage reality, the e2e harness rebuild, and the test pyramid target. | Adding tests, or fixing the Playwright suite. |
| [`SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) | Trust boundaries, threat model, and the rules for the sanitizer, the extension bridge and AI key handling. | Touching the renderer, the extension, or `@guideflow/ai`. |
| [`PRODUCT-ROADMAP.md`](docs/PRODUCT-ROADMAP.md) | Competitive gap analysis and the feature sequence to a credible 1.0. | Deciding what to build next. |
| [`EXPANSION-PLAN.md`](docs/EXPANSION-PLAN.md) | **Phase 8.** Grades the competitor teardown into shipped / adopt / reframe / different-product, and sequences the part that transfers. | Before acting on anything in `COMPETITOR-TEARDOWN.md`. |
| [`COMPETITOR-TEARDOWN.md`](docs/COMPETITOR-TEARDOWN.md) | Teardown of **guideflow.com** — a *different product* that shares this project's name. Source material, not a plan. Truncated at §11.7. | Understanding what the adjacent category sells. Read `EXPANSION-PLAN.md` first. |
| [`MCP-AND-SKILLS.md`](docs/MCP-AND-SKILLS.md) | Recommended MCP servers and skills for this project, with rationale and setup. | Setting up the workspace, or wondering "is there a tool for this?". |
| [`DECISIONS.md`](docs/DECISIONS.md) | Architecture decision log. Append-only. | Making or reversing a structural choice. |

## Skills (`skills/`)

Invoke with `/<name>`. Each encodes a repeatable GuideFlow workflow so it is done the same way twice.

| Skill | Purpose |
|---|---|
| `/verify` | Full local gate: build → type-check → lint → test → size. Run before claiming any task done. |
| `/gf-package-audit` | Deep single-package audit against this repo's conventions and the audit checklist. |
| `/gf-a11y-review` | WCAG 2.2 AA review of the tour UI surface, with the GuideFlow-specific checklist. |
| `/gf-flow-authoring` | Author or review a `FlowDefinition` — FSM correctness, guards, `final` states, targets. |
| `/gf-extension-dev` | Build, load, and manually exercise the MV3 devtools extension. |
| `/gf-release` | Changeset → version → publish, with the pre-flight checks that CI does not do. |
| `/gf-adapter-parity` | Check React/Vue/Svelte adapters expose the same capability surface. |

## Agents (`agents/`)

Specialised subagents for fan-out work. Launch via the Agent tool with `subagent_type`.

| Agent | Purpose |
|---|---|
| `gf-core-auditor` | Read-only deep reader of `packages/core` internals. FSM/render/persistence bug hunting. |
| `gf-security-reviewer` | Adversarial reviewer for the sanitizer, extension messaging, and AI data flow. |
| `gf-docs-truth-checker` | Cross-checks every documented API against real code signatures. |

## Commands (`commands/`)

| Command | Purpose |
|---|---|
| `/fix-next` | Pick the next unchecked task from `REMEDIATION-PLAN.md`, implement it, test it, tick it off. |
| `/audit-refresh` | Re-run the multi-agent audit and update `AUDIT.md` in place. |

## Settings

`settings.json` carries the shared permission allowlist (read-only inspection commands, the standard
build/test/lint invocations) so routine work does not prompt. Personal overrides belong in
`settings.local.json`, which is gitignored.
