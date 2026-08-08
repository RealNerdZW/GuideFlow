---
"@guideflow/core": minor
"@guideflow/react": minor
---

**Focus belongs to whoever last claimed it, and a finished tour now says so.**

Three accessibility defects, all of which became reachable rather than theoretical once `advanceOn`
let a step advance because the user acted.

- **The renderer no longer steals focus on every render.** It focused the popover's first control
  each time, and document order puts the header close button first — so advancing while the user was
  typing moved focus there, and their next **space** keystroke ended the tour. Focus now moves only
  when the tour is opening, when it is already inside the popover, or when it is nowhere. Pressing
  Next is unchanged. WCAG 3.2.2.
- **Focus is restored only when the tour had it.** Ending a tour used to hand focus back to a
  control captured before it started — even when the app had deliberately focused something of its
  own in response to the step's action, such as a confirm dialog. WCAG 2.4.3.
- **Completion is announced.** It was silent twice over: `Locale` had no completion string, and the
  live region was removed in the same tick that a pending announcement was scheduled for, so the
  utterance landed in a detached node. `Locale` gains `tourComplete` (twelve keys now), and
  `RendererContract.hideStep` gains an optional `reason` — `'complete'` is passed only on the
  completed path, because `hideStep` also runs on pause, abandon and dismissal, where an
  announcement would be noise.

Both focus rules read `document.activeElement` *before* the DOM changes; reading afterwards cannot
tell "the tour had focus" from "the app has focus".

The two focus fixes are mirrored in `@guideflow/react`, which had them identically. The completion
announcement is core-renderer only for now — React's live region unmounts with the popover.
