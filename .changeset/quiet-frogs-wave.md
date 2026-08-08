---
"@guideflow/checklist": minor
---

**A finished tour can be replayed from the checklist.**

A done row used to be inert, and the reason was true when it was written: *"core has no
`clearCompleted`, so a completed flow cannot be replayed, and rendering an inert control would
promise an action that silently does nothing."*

Both halves have since stopped being true. `progress.clearCompleted()` landed in 7.10b — and
`start(flow, ctx, { force: true })` is the better mechanism, because it skips the completed and
dismissed gates and **writes nothing**. Clearing the record instead would un-tick the very row the
user just selected, so their reward for re-reading a guide would be losing the tick they earned.

A **flow-backed** done row is an operable control again, announced as "Completed — select to do it
again". A **manually ticked** one stays inert: there is no flow to re-run, and that is the dead
button the original reasoning was right about.
