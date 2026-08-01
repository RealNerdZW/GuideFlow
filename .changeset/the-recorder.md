---
"@guideflow/devtools": minor
---

The Recorder: an authoring surface that can be installed, and an extension that is finally tested

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
