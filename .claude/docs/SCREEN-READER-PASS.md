# The manual screen-reader pass

**Status: NOT DONE.** No NVDA, JAWS or VoiceOver session has ever been run against
GuideFlow. This document does not change that. It exists so that when someone does sit
down with a screen reader, the session is forty minutes instead of a day.

---

## What was done instead, and why it is not the same thing

An automated **accessibility-tree and announcement-sequence audit**
(`apps/e2e/tests/a11y-announcements.spec.ts`), run across chromium, firefox, webkit and
Mobile Chrome. It captures two things nothing else in this repo did:

1. **Every live-region utterance, in order, tagged by which surface produced it**, with
   millisecond offsets — including with the tour renderer, the checklist, the banner and
   the survey all on one page at once.
2. **The real ARIA tree** for each surface, via `ariaSnapshot()` — what an AT derives,
   rather than what the DOM says.

That covers *what* is said and *what is exposed*. It cannot cover **how it sounds**:
pacing, whether an utterance lands while the user is still moving, verbosity fatigue,
whether the reading order feels right, or whether the whole thing is pleasant to use.
Those need ears. Nothing here is a substitute.

axe, which the suite already ran, checks *rules*. This checks *output*. Both miss the
same third thing.

---

## What the audit found

Three defects, all invisible to axe, all now fixed with regression tests.

### 1. The survey scale announced every value twice

Measured ARIA tree, before:

```
- radiogroup "How likely are you to recommend us?":
  - radio "0"
  - text: "0"      <- the visible span, exposed as its own node
  - radio "1"
  - text: "1"
  ...
```

An eleven-point NPS scale read as *"0, 0, 1, 1, 2, 2 …"*. The visible number is a
`<span>` inside the `<label>`; the label named the radio **and** the span was exposed
beside it.

Fixed by naming the input explicitly (`aria-label`) and hiding the visual copy
(`aria-hidden="true"`). Hiding the span alone would have left the radio with no
accessible name at all.

### 2. The tour announced doubled sentence punctuation

Measured live-region text, before:

```
"Step One. This is step one.. Step 1 of 3"
```

`_announce` joins title, body and step counter with `". "`, and a body that already ends
in a full stop gets two. Screen readers pause oddly on it and some voice the stray mark.

Fixed by stripping trailing `.!?` from each part before the join.

### 3. Two surfaces release held announcements in the same millisecond

Measured, on closing a tour with a banner and a survey both mounted and both holding:

```
banner:  "We shipped v2"                        at 318ms
survey:  "How likely are you to recommend us?"  at 318ms
```

Both are `polite`, so they do not overlap — they **queue**. The user hears both, back to
back, immediately after the tour's own closing behaviour.

**Not fixed, and this is the item most in need of ears.** Two queued utterances may be
perfectly fine. Three would not be, and the design permits three: the checklist holds one
too. There is no cross-package coordination and adding one would mean one package knowing
about another, which every ADR here has refused. The test asserts a ceiling of two so the
number cannot grow silently.

---

## What the audit confirmed is right

- **Nothing in the library ever interrupts.** Every region is `aria-live="polite"`; there
  is no `role="alert"` and no `aria-live="assertive"` anywhere. Asserted.
- **Docked surfaces are silent while a tour runs.** Every utterance captured during a
  tour came from the renderer.
- **The checklist says nothing on arrival** — it only speaks when an item ticks, so
  landing on a page with all three docked surfaces queues at most two utterances.
- **A step is announced once per step**, not once per re-render.
- The popover's tree is a named dialog with a heading, a progress bar, the body, a step
  counter and named buttons:

```
- dialog "Step One":
  - progressbar "Tour progress"
  - heading "Step One" [level=2]
  - button "Close": ×
  - paragraph: This is step one.
  - text: Step 1 of 3
  - button "Skip tour"
  - button "Next"
```

---

## The session script

Forty minutes. Do them in order; each builds on the last.

**Setup.** `pnpm --filter e2e exec node serve.mjs`, then open
`http://127.0.0.1:4173/apps/e2e/fixtures/index.html`. NVDA + Firefox and VoiceOver +
Safari are the two combinations that matter most; NVDA + Chrome third.

### A. A tour, start to finish (10 min)

1. Tab to **Start Tour**, activate it.
2. **Listen for what happens to focus.** Does the reader announce the dialog? Does it
   announce the step, or both, or the step twice?
3. Arrow through the popover content. Is the step counter (*"Step 1 of 3"*) useful there,
   or noise?
4. Press **Next** twice, then **Done**. Where does focus land at the end? Is it announced?
5. Repeat, exiting with **Escape** instead. Same question.

> The known risk: the step content is announced through a live region *and* is readable
> in the dialog. Nobody knows whether that reads as helpful or as stuttering.

### B. The queue on arrival (10 min)

1. Reload. Click **Mount Checklist**, then run in the console:
   ```js
   await window.__gfMountBanners([{ id: 'b', title: 'We shipped v2', body: 'Faster exports.' }])
   await window.__gfMountSurveys([{ id: 's', question: 'How likely are you to recommend us?' }])
   ```
2. Reload once more so everything mounts on arrival together.
3. **Do nothing and listen.** How many things speak before you can orient? Is the order
   sensible? Would you have preferred silence?
4. Use the rotor / landmark list. Are "Announcement" and "Survey" findable and
   distinguishable? Is "Survey" a good name, or should it be the question?

### C. The release burst (5 min) — the item most in doubt

1. With a banner and a survey mounted, start a tour.
2. Confirm nothing docked speaks during it.
3. Close the tour. **Two announcements queue in the same millisecond.** Is that
   acceptable, or does it feel like being shouted at on the way out?

> If the answer is "not acceptable", the fix is a stagger, and it has to be designed —
> the packages cannot see each other.

### D. The survey (10 min)

1. Tab to the scale. Does it announce *"How likely are you to recommend us?, radio group,
   0, 1 of 11"* or similar?
2. Arrow through the values. One announcement each, or still doubled? *(Fixed above —
   this is the confirmation.)*
3. Choose a score. Is the follow-up field's appearance announced? Should it be?
4. Submit. Is the thank-you heard? Does focus go anywhere sensible, or is it orphaned?

> Known gap: nothing moves focus after submit. The card swaps to a thank-you and the
> user's focus stays on a button that no longer exists in the same context.

### E. Checklist and RTL (5 min)

1. Tick an item. One aggregate announcement, or one per item?
2. Start a tour from a checklist row, finish it, and listen for where focus returns.
3. Set `dir="rtl"` on `<html>` and re-run A briefly.

---

## Record findings here

Append them below with the combination used (reader + browser + version). A finding with
no combination attached is not actionable — NVDA and VoiceOver disagree about plenty.

### Findings

*(none yet — the session has not been run)*
