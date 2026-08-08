---
"@guideflow/devtools": patch
---

Recorder: close the pick/record interlock, announce repeated messages, stop guessing at conversion errors

Four defects a review found in the step-editing work, all in `packages/devtools/src/recorder`.

- **The pick/record interlock was only half-closed.** The **⦿ Re-record target** button was disabled
  while recording, because inspect mode and the recorder both listen on `document` in the capture
  phase and inspect only calls `stopPropagation` — so one pick would also land in the captured-
  actions buffer. Nothing stopped the reverse: starting a recording while a pick was already
  pending reached exactly the state that was forbidden. **Record** is now disabled while a pick is
  pending (stopping never is), and `toggleRecording` refuses it off the ref as well as the
  attribute.
- **A pending pick could not be cancelled once recording started.** Recording can be armed from the
  popup, a context menu or the worker, so `disabled={recording}` on the re-record button took away
  the only way out of a pick the user had already started — and that stale pick then silently
  consumed the next element they selected for any other reason, including one the DevTools panel
  asked for. Cancelling this step's own pick is never disabled now; only starting a new one is.
- **An identical consecutive announcement was never spoken.** The live region rendered
  `{announcement}`, and React does not touch a text node whose string is unchanged — so a repeated
  message produced no DOM mutation, and a live region that does not mutate is not announced. Moving
  a step down twice in a two-step list says "Moved to position 2 of 2." both times, and a screen
  reader heard it once. Announcements now go through `nextAnnouncement`, which alternates an
  invisible U+200B so consecutive values always differ; the sentence a reader hears is unchanged.
  Pinned in `apps/e2e/tests-extension/recorder.spec.ts` on the region's **raw** `textContent` —
  `toHaveText` normalises the marker away, which is the same blind spot that let the defect exist.
- **The validation panel gave a confidently wrong diagnosis.** Any throw out of `draftToFlow` was
  reported as `duplicate-step-id` with the hint "Give every step a unique id.", so a draft that
  failed for some other reason sent the user off to check ids that were all fine. `conversionIssue`
  now infers a code and hint only when it recognises the message, and otherwise reports the real
  error and says it does not know.
