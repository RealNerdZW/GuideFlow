# @guideflow/devtools

## 0.2.0

### Minor Changes

- c29870c: Stop recording input values, and single-source the extension version.

  **The recorder no longer captures what you typed.** Every `input` step carried a
  `value`, and the sensitive-field redaction added alongside it wrote
  `'[redacted]'` for password and hidden inputs, credential/OTP/payment
  `autocomplete` tokens, and anything inside a `[data-gf-private]` subtree.

  The panel never displayed that field. `BuilderTab` renders only `action`,
  `selector`, `label` and `tagName`, both when listing recorded actions and when
  importing them into the builder. Recorded steps are persisted to
  `chrome.storage`, so the field was pure liability — and not collecting it is
  strictly better than redacting it. `value` and `redacted` are gone from the
  `GF_RECORDED_STEP` payload and from the `RecordedStep` type, along with
  `isSensitiveField()` and `readFieldValue()`, which existed solely to guard
  `value`.

  **Label redaction is unaffected.** `[data-gf-private]` still replaces an
  element's label with `[redacted]`, because the label _is_ rendered in the panel.

  **The version now comes from one place.** `manifest.json` and `package.json`
  said `0.1.9`, the popup hardcoded `v0.2.0` in two spots, and the panel's About
  card hardcoded `v0.1.9`. `package.json` is now the single source: the Vite build
  injects `version` into `dist/manifest.json` — the source manifest no longer
  carries the key — and defines `__GF_VERSION__` for the panel and popup. A
  prerelease suffix is stripped for Chrome's dotted-integer `version` and kept in
  `version_name`.

  For that to hold, the package was removed from the changesets `ignore` array,
  which was the one thing freezing its version: `private: true` blocks publishing
  but not versioning, since `privatePackages.version` defaults to `true`. The
  extension is still never published, and is not git-tagged either.

- 931b914: The Recorder: an authoring surface that can be installed, and an extension that is finally tested

  ## The Recorder

  The Builder tab has moved out of the DevTools panel into `recorder.html`, an ordinary extension
  page. Open it from the toolbar icon or the panel's **Open Recorder** button.

  The move is not cosmetic. **Playwright cannot open a `devtools_page`**, and there is no CDP path
  to one, so anything living in the panel could never be tested — which is the state the extension
  has been in for four phases. An extension page opens at a URL, and a test can drive it.

  It also fixes three defects structurally rather than patching them:
  - **Recording no longer dies on a page navigation.** A page load destroys the content script and
    every variable in it, so recording used to end silently while the UI still read "Stop Rec". The
    service worker owns the flag now and the content script asks for it on load.
  - **Closing the Recorder no longer throws away captured steps.** They live in the worker, not in
    a React component.
  - **Popup-armed recording captures something.** It captured nothing at all before, by
    construction: each step was posted at the DevTools port and dropped when that was absent.

  Drafts are mirrored into `chrome.storage.session`, so closing the Recorder — or an evicted
  service worker — no longer loses unsaved work.

  Everything the Recorder knows about flows comes from `@guideflow/core/authoring`, so what you
  preview, what you save and what you export can no longer disagree. It shows validation inline and
  **disables Preview and Export while the draft has errors**. Export writes `.flow.json`, which is
  what `guideflow validate` and `guideflow push` expect — the Builder wrote `.json`, which neither
  picked up.

  ## A packaged download

  ```bash
  pnpm --filter @guideflow/devtools package   # → guideflow-devtools-<version>.zip
  ```

  CI builds and uploads it on every push. Unzip, then Load unpacked at `chrome://extensions`.
  Until now the only way to obtain the extension was to clone the repo and build it.

  ## The extension is exercised in a browser, for the first time

  Ten Playwright specs drive the **built** extension in real Chromium: the service worker
  registers, the content script injects, the Phase 3 nonce handshake and relay allowlist carry a
  real `GF_DETECTED` to the badge, recording survives a navigation, steps buffer with no UI open,
  the Recorder validates and refuses a broken draft, and the packaged zip unpacks to something
  Chrome will load.

  Also fixed along the way: `optional_host_permissions` is removed (nothing ever requested it, and
  an ungranted optional host permission can silently withhold the content script); context menus
  are re-registered with `removeAll()` first, so they survive an extension update; the page-world
  bridge no longer fails permanently and silently when a page CSP blocks it; the active-tour
  tracker reads the fields `tour:start` actually carries; and the panel and popup no longer swallow
  the result of a command that never reached the page.

  ## Breaking

  The panel's **Builder tab is gone**. Authoring happens in the Recorder. Tours saved by the old
  Builder still open — the Recorder migrates the legacy flat `{ id, name, steps }` shape.

### Patch Changes

- b0790d5: Fix the extension icons, which were never square

  Measured from the PNG headers: `icon-16.png` was 15×16, `icon-48.png` was 46×48
  and `icon-128.png` was 122×128 — a few pixels narrow each, from the day they
  were added. Chrome renders those squashed, and the Chrome Web Store requires an
  exact 128×128 for a listing.

  Regenerated centred on square canvases, so the artwork is padded rather than
  stretched, and at bit depth 8 rather than 16 — which takes the 128px icon from
  17.7 kB to 8.1 kB.

  `store-readiness.test.ts` now reads each PNG's IHDR chunk and asserts it matches
  the size its manifest key claims, so an icon named for a size it is not cannot
  ship again.

- edfa115: Targeting now hears every route change; `clearCompleted` lands; the DevTools event list can no longer rot

  **`startTrigger: 'load'` only ever fired on the back button.** `install()` wired
  a bare `popstate` listener, so a `history.pushState` navigation — how React
  Router, Vue Router in history mode and Next.js move between routes — re-evaluated
  nothing at all. The documentation said "on every route change". It now uses the
  same `watchHistory` the routing seam does: the Navigation API where the browser
  has it (no patching), a cooperative wrapper where it does not, and coalescing so
  a router calling `replaceState` three times notifies once. Costs 380 B on the
  opt-in targeting subpath, whose gate moves 2.5 → 2.75 kB (ADR-016). **The core
  entry is untouched.**

  **A flow registered after `install()` was invisible to the `selector` trigger.**
  The candidate list was filtered exactly once, and the observer was only created
  if a selector flow already existed — so the recipe in `guide/hosting-flows.md`,
  where flows arrive from a `fetch`, could not use selector triggers at all. Both
  halves are fixed; there is no ordering rule left to remember.

  Two further defects found by the same probe:
  - **The `selector` trigger could start the wrong flow.** `evaluateFlow` marks a
    flow eligible on `startTrigger === 'selector'` alone — it has no document and
    never asks whether _that_ flow's selector matches. So an element appearing for
    one flow started whichever selector flow had the higher priority. A tour whose
    own selector matched nothing would run.
  - **The observer never stopped.** Closing a selector-started tour and then
    mutating the DOM restarted it, and would again on the next mutation, forever,
    unless a frequency cap happened to be configured. A `selector` trigger now
    fires once per flow per page load.

  **New: `ProgressStore.clearCompleted(userId, flowId?)`** — "let this user see
  that tour again". It clears every version of the flow, and leaves dismissals,
  resume points, targeting caps and checklist state alone. Previously the only
  option was `resetUser()`, which takes all of them.

  **Decided, not drifted: dismissal stays keyed on the flow id** while completion
  is `flowId@version` (ADR-015). Completing a tour says _I have seen this content_,
  so a republish is worth showing; dismissing one says _do not interrupt me_, which
  editing the tour does not answer. It is opt-in per flow, and `clearDismissed` is
  public for an author who disagrees. Pinned by tests in both directions.

  **DevTools**: both event-name lists are now `Object.keys({…} satisfies
Record<keyof TourEvents, true>)`, so an event added to or renamed in core fails
  to compile instead of silently going unreported. They had already rotted —
  `tour:dismiss` shipped in Phase 6 and reached neither, so the panel could not
  show a dismissal.

- Updated dependencies [ef40833]
- Updated dependencies [bbd09a8]
- Updated dependencies [463b07d]
- Updated dependencies [93214ff]
- Updated dependencies [4bfc44a]
- Updated dependencies [7c72cb2]
- Updated dependencies [9cde7b4]
- Updated dependencies [301ed81]
- Updated dependencies [cb7169d]
- Updated dependencies [a49e235]
- Updated dependencies [d01266d]
- Updated dependencies [c994a5b]
- Updated dependencies [8dc6621]
- Updated dependencies [b81409f]
- Updated dependencies [8dc6621]
- Updated dependencies [b5dd516]
- Updated dependencies [07b094b]
- Updated dependencies [42412fb]
- Updated dependencies [c8bcaa7]
- Updated dependencies [dc687bb]
- Updated dependencies [4981071]
- Updated dependencies [4981071]
- Updated dependencies [84670f2]
- Updated dependencies [edfa115]
- Updated dependencies [37e9cb7]
- Updated dependencies [e98d6fd]
- Updated dependencies [26164ec]
  - @guideflow/core@0.2.0
