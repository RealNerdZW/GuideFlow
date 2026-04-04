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

## Development

```bash
# Build the extension
pnpm --filter @guideflow/devtools build

# Load in Chrome
# 1. Navigate to chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select packages/devtools/dist
```

## Links

- [Source](https://github.com/johnmugabe/GuideFlow/tree/master/packages/devtools)
