---
description: Take the next unchecked task from the remediation plan, implement it, prove it, and tick it off.
---

Work the GuideFlow remediation queue.

## Steps

1. Read `.claude/docs/REMEDIATION-PLAN.md`. Find the **first unchecked** `- [ ]` task in the
   earliest incomplete phase. If the user named a task id in `$ARGUMENTS`, use that one instead.
2. Read the corresponding finding in `.claude/docs/AUDIT.md` for the evidence, the impact and the
   proposed fix. Open the cited file and confirm the finding still holds — the code may have moved.
3. Re-read the relevant sections of `CLAUDE.md` (conventions, and §5 architecture if the task touches
   `packages/core`).
4. Implement the fix. Keep it scoped to that one task — if you find an adjacent problem, note it for
   the audit rather than widening the change.
5. **Add or update a test that fails without the fix.** Every audit finding names the test that
   should pin it. A fix without a test does not count as done.
6. Run `/verify`. Paste the real output. If anything regressed, fix it before continuing.
7. If the change is user-visible in a published package, run `pnpm changeset` and write the summary
   for a consumer.
8. If the fix changes or contradicts documentation, update `apps/docs/` and `README.md` in the same
   change. Never leave a doc claiming something the code no longer does.
9. Tick the checkbox in `REMEDIATION-PLAN.md` and append a one-line note: what changed, and the test
   that pins it.

## Report

- Task id and title
- Files changed
- The test that now pins it, and proof it fails without the fix
- `/verify` result
- Whether a changeset was written
- Anything adjacent you noticed but deliberately did not touch
