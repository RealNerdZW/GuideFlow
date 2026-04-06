---
description: "@guideflow/core — Zero-dependency FSM engine for JavaScript product tours, spotlights, hotspots and hints. Works with React, Vue, Svelte or plain JS."
keywords: "@guideflow/core, product tour engine, FSM tour library, zero-dependency tour, TypeScript tour"
---

# @guideflow/core

**Zero-dependency FSM engine for product tours, spotlights, hotspots, and hints.**

[![npm version](https://img.shields.io/npm/v/@guideflow/core.svg)](https://www.npmjs.com/package/@guideflow/core)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@guideflow/core?label=gzip)](https://bundlephobia.com/package/@guideflow/core)

The core engine behind GuideFlow. Framework-agnostic — use it with vanilla JS or pair it with a framework adapter.

## Installation

```bash
npm install @guideflow/core
```

## Key Exports

| Export | Description |
|--------|-------------|
| `createGuideFlow()` | Main factory — returns a `GuideFlowInstance` |
| `createMachine()` | Low-level FSM state machine |
| `TourEngine` | Tour lifecycle management |
| `SpotlightOverlay` | Animated SVG cutout overlay |
| `HotspotManager` | Persistent pulsing beacons |
| `HintSystem` | Hint badge management |
| `ProgressStore` | localStorage / IndexedDB persistence |
| `BroadcastSync` | Cross-tab sync via BroadcastChannel |
| `I18nRegistry` | Translation registry with locale fallback |
| `DefaultRenderer` | Built-in step renderer |

## Links

- [npm](https://www.npmjs.com/package/@guideflow/core)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/core)
- [Quick Start](/guide/quick-start)
- [API Reference](/api/create-guide-flow)
