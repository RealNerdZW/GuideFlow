---
description: Re-run the multi-agent GuideFlow audit and update AUDIT.md and REMEDIATION-PLAN.md in place.
---

Refresh the engineering audit.

This is a **large, fan-out job**. Confirm with the user before starting if they have not explicitly
asked for a full re-audit — a scoped `/gf-package-audit <pkg>` is usually what is wanted.

## Steps

1. Establish ground truth first, in the main session — do not delegate this:
   ```bash
   pnpm install
   pnpm turbo run build type-check lint test --filter=!storybook --filter=!docs --filter=!e2e
   pnpm --filter @guideflow/core size
   ```
   Record the real numbers. Update the "known-good baseline" table in `CLAUDE.md` §3 if it moved.

2. Fan out one reader per dimension. Give each the rule: *read the actual files, quote verbatim, cite
   `file:line`, no speculation*. Dimensions:

   | Dimension | Scope |
   |---|---|
   | core-engine | `packages/core/src/**` — FSM, render pipeline, spotlight, persistence, i18n, lifecycle |
   | security | sanitizer, extension bridge, AI keys and PII, analytics, CLI, supply chain |
   | build-packaging | manifests, tsup, tsconfig, turbo, eslint, workflows, lockfile, cross-platform scripts |
   | adapters | react / vue / svelte parity and framework lifecycle correctness |
   | ai-package | providers, validation, brain, dom-context, cost and reliability |
   | analytics-package | collector, transports, experiments, privacy |
   | devtools-extension | MV3 build wiring, worker lifecycle, recorder, panel UX |
   | cli | init / export / validate |
   | tests-docs-truth | coverage map, and every doc claim vs real code |
   | a11y-i18n-ux | WCAG 2.2 AA, reduced motion, contrast, RTL, mobile |

   The `gf-core-auditor`, `gf-security-reviewer` and `gf-docs-truth-checker` agents in
   `.claude/agents/` cover three of these directly.

3. **Verify adversarially.** For each dimension's findings, run a second pass whose job is to
   *refute*: re-open the cited file, confirm the quote is verbatim, look for the guard the finder
   missed. Drop anything that cannot be reproduced from the source. Correct miscalibrated severities.

4. Run a completeness critic over the surviving set: which files did nobody open? Which defects live
   at a seam between two packages? What would a competitor have that this does not?

5. Merge into `.claude/docs/AUDIT.md`:
   - Keep stable finding ids so history is traceable.
   - Mark fixed findings **RESOLVED** with the commit or PR, and move them to the resolved log at the
     bottom. Do not delete them.
   - Add new findings with the next free id.
   - Update the summary counts and the date.

6. Re-sequence `.claude/docs/REMEDIATION-PLAN.md` so phases still make sense, preserving every
   already-ticked checkbox.

7. Report to the user: findings added, findings resolved, net change by severity, and the single
   most important thing to do next.
