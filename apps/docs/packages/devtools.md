---
description: "@guideflow/devtools — Browser DevTools extension for visual tour building and flow inspection. Manifest V3 Chrome extension with AI-assisted tour authoring."
keywords: "@guideflow/devtools, tour builder extension, visual tour builder, GuideFlow DevTools, Chrome extension tour"
---

# @guideflow/devtools

**Browser DevTools extension for visual tour building and flow inspection.**

::: warning Coming Soon
The DevTools extension is currently in development and not yet published to browser extension stores.
:::

## Features (Planned)

- Visual tour builder — create tours by clicking on elements
- Flow inspector — view active tour state, step data, and context
- Event log — monitor tour events in real-time
- Export — generate flow definitions from visual recordings

## Architecture

- Manifest V3 Chrome extension
- React-based panel UI
- Content script injects into inspected pages
- Background service worker manages state

## Installing

::: warning Not on the Chrome Web Store yet
There is no store listing. Publishing one needs a Google developer account, a US$5 fee, a
privacy policy and a manual review — none of which is a code change. The listing copy,
the privacy policy and a step-by-step runbook are written and waiting in
[`packages/devtools/store/`](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/devtools/store).

Until then, install it from a release zip or build it yourself.
:::

### From a release zip

Download `guideflow-devtools-<version>.zip` from the
[CI artifacts](https://github.com/RealNerdZW/GuideFlow/actions), unzip it, then load the
unzipped folder as below.

### From source

```bash
pnpm --filter @guideflow/devtools build
```

Then in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `packages/devtools/dist`

The extension makes **no network calls of any kind** — a test fails the build if one
appears — and stores everything in your own browser profile.

## Links

- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/devtools)
