# @guideflow/devtools

**Browser DevTools extension for GuideFlow.js — the Recorder, a flow inspector and an event log.**

Not published to npm and not on the Chrome Web Store. Chrome and Edge only:
`--load-extension` is a Chromium feature and there is no Firefox or Safari build.

## Install

Download `guideflow-devtools-<version>.zip` from the
[CI artifacts](https://github.com/RealNerdZW/GuideFlow/actions) or a release, unzip it, then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select the unzipped folder

Or build it yourself:

```bash
pnpm install
pnpm --filter @guideflow/devtools build     # → packages/devtools/dist
pnpm --filter @guideflow/devtools package   # → guideflow-devtools-<version>.zip
```

## What it does

**The Recorder** (`recorder.html`) is the authoring surface. Open it from the toolbar icon or
from the DevTools panel; it records clicks and field changes on the tab you point it at, turns
them into steps, validates the result with `@guideflow/core/authoring`, and exports a
`.flow.json` you can commit.

It is an ordinary extension page rather than a DevTools tab for a specific reason: **Playwright
cannot open a `devtools_page`**, so anything living in the panel could never be tested. See
ADR-012 and ADR-013.

**The DevTools panel** inspects. Events, registered flows, saved drafts, settings. It no longer
edits — that was the Builder tab, and it is gone.

## Requirements for the page under test

**The extension only detects tours on a page that exposes the instance itself.** The library
never sets `window.__guideflow` — that is deliberate, so importing GuideFlow does not add a
global to your app:

```ts
if (import.meta.env.DEV) {
  ;(window as unknown as { __guideflow?: unknown }).__guideflow = gf
}
```

Without it, recording and element picking still work — they operate on the DOM — but the badge
stays off, the flow list is empty, and "Preview" cannot start a tour.

## Authoring hooks

| Attribute | Effect |
|---|---|
| `data-gf-id="…"` | The selector engine prefers this above everything, including `data-testid`. Put it on elements you want tours to point at. |
| `data-testid` (and `data-test-id`, `data-test`, `data-cy`, `data-qa`, `data-pw`) | Preferred over `aria-label` and over any structural path. |
| `data-gf-private` | Nothing inside this subtree contributes an id, test id or label to a recorded selector. Field *contents* are never recorded anywhere. |

A recorded selector is only accepted if it re-queries to exactly one element. When nothing does,
the step is flagged rather than saved with a selector that points somewhere else.

## What is not tested

The e2e suite (`apps/e2e/tests-extension`) drives the built extension in real Chromium — the
service worker, the content script, detection, recording across a navigation, the Recorder, and
the packaged zip. It cannot reach:

- the DevTools panel as a DevTools panel (no API, no CDP path)
- the popup as a popup
- context menus
- the permission prompt a Chrome Web Store install would show — a `--load-extension` profile
  reports host permissions as already granted, so a green run proves nothing about it

## Licence

MIT © John Mugabe
