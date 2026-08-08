---
"@guideflow/devtools": minor
---

Recorder: edit a recorded tour instead of recording it again

"One bad step means re-record the whole thing" is the most common reason a recorder is abandoned
after the first session. The Recorder could already reorder by dragging, delete, and edit every
field. Three things were missing, and this adds them.

- **Insert a step anywhere.** Every card carries **＋ Above** and **＋ Below**, and an empty draft
  offers **Add a step by hand** — so a step forgotten in the middle no longer means starting over.
  The new step is deliberately blank: an empty title is a `step-missing-content` error, so the
  validation panel names what is missing the moment it appears, and the caret is already in it.
- **Re-record ONE step's target.** **⦿ Re-record target** puts the page into inspect mode; the next
  element you click in your app becomes that step's target, and its title and body are untouched.
  It reuses inspect rather than recording on purpose — recording appends a stream of actions, which
  is exactly the shape that cannot repair a single step. It is addressed by step id, not index, so
  reordering the list while you are away in your app cannot rewrite the wrong step.
- **Reorder from the keyboard.** The existing drag-and-drop was mouse-only, and `dragstart` has no
  keyboard equivalent, so **↑** / **↓** on each card are not a convenience — they are the whole of
  reordering for anyone not using a pointer. Focus follows the step it moved (React re-inserts the
  node to reorder it, and a node that leaves the document resets focus to `<body>`), falling back to
  the opposite button when the step lands at an end and disables the one that got it there. Every
  reorder, insert and deletion is announced in a live region that is mounted before it has anything
  to say.

### Fixed: the Recorder's buttons never reached the page

Measured while testing the above, and broken since the Recorder shipped. The service worker decides
whether a message came from one of our own extension pages by testing `sender.tab === undefined`.
That is true of the popup and the DevTools panel — and **false of the Recorder**, which is an
extension page in an ordinary tab, so Chrome populates `sender.tab` for it exactly as it does for a
content script. Every privileged request it made fell through the provenance gate and got no
response at all: **Record, Preview, Check, Save and clearing the capture buffer were all dead**. Two
of them report success without reading the reply, which is why nothing ever said so, and every
existing test armed recording from the worker instead of clicking the button. The gate now
classifies by `sender.origin`, which the browser sets and a page cannot claim, and an e2e test
clicks the Record button and waits for the badge to appear in the page.

### Also fixed: colliding step ids

New step ids were derived from the list length, which is only safe while steps can arrive but never
leave. Delete `step-2` out of three steps and the next id is `step-3`, which is still there — and a
duplicate id makes `draftToFlow` throw, so Preview and Export switch off with no visible cause. Ids
are now scanned for a free one. With insertion added, this went from unlikely to routine.

Smaller a11y fixes on the same surface: the delete and check buttons had no accessible name, and no
accessible name on a card is a substring of another's.
