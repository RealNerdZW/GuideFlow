---
"@guideflow/core": minor
"@guideflow/react": minor
---

Accessibility: focus management, live-region announcements, and honest progress counters

**Focus.** The popover declares `role="dialog" aria-modal="true"`, which promises assistive
technology that the rest of the page is inert — but Tab walked straight out of it into the dimmed
page behind the overlay, and closing the tour dropped focus on `<body>`. Both `DefaultRenderer` and
`<GuidePopover>` now trap Tab and Shift+Tab inside the dialog and hand focus back to whatever held it
before the tour opened.

**Announcements.** The popover element is reused across steps, so a screen reader saw no new node
and read nothing; moving focus only read the focused button. Each step is now pushed into a polite
live region that sits outside the popover.

**Keyboard.** The document-level handler called `preventDefault()` on arrow keys with no check for
what the user was actually typing into, so a caret could not move while a tour was running — worst
on `clickThrough` steps, which exist precisely so the user can interact with the page. Arrow keys are
now ignored when the event targets an input, textarea, select, `contenteditable`, or a widget role,
during IME composition, when modified, or when another handler already claimed the key. Escape still
closes the tour from anywhere, because it is a keyboard user's only way out.

**Semantics.** `aria-labelledby` pointed at a `-title` element the renderer does not emit when a step
has no title, leaving the dialog with no accessible name; it now falls back to a localised
`aria-label`, and `aria-describedby` is dropped when there is no body. The progress bar announced
`aria-valuenow="50"` — now it reports a step count with an `aria-valuetext` of "Step 2 of 4" and an
accessible name.

**Motion and contrast.** `prefers-reduced-motion` now disables the popover animation, the spotlight
cutout transition, and the smooth scroll (the last two are set from script, so CSS alone could not
reach them). `forced-color-adjust: none` has been removed from the forced-colors block, where it was
opting the popover *out* of the palette the user asked the OS for. Muted text moved from `opacity:
0.5` (3.4:1, failing WCAG AA) to a `--gf-muted-opacity` token at 0.72, and the default accent moved
from `#6366f1` to `#4f46e5` because white on indigo-500 measures 4.46:1 against a 4.5:1 requirement.

**RTL.** `rtl.css` carried three double flips that undid the browser's own correct mirroring — most
visibly `flex-direction: row-reverse` on the action row, which put Back/Next back in left-to-right
order for RTL readers. They are gone. The hint badge, positioned from script, is mirrored in JS.

**Progress counters.** `totalSteps` and `currentStepIndex` counted the current *state*, not the flow,
so a two-state tour reported "Step 1 of 1" in each state and the renderer drew a **Done** button on
step one. They now count along the path a `next()`-only run actually takes, falling back to the
current state's own numbers when the tour is somewhere that path does not reach.

**Done button.** The last step's primary button dispatched `end`, which maps to `stop()` and reports
the tour as *abandoned* — so clicking Done never emitted `tour:complete`, never cleared the saved
snapshot, and the tour reopened on the next visit. It now dispatches `next`, matching what
`@guideflow/react` already did.

The bundle budget for `@guideflow/core` moves from 13 kB to 14.5 kB gzip (measured: 13.91 kB). See
ADR-008 for why this was taken rather than deferred.
