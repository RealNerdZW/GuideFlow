---
description: Migrate from Driver.js to GuideFlow. Concept mapping, event equivalents and a worked before/after example — including the two shape changes that make it not a drop-in replacement.
keywords: migrate from Driver.js, Driver.js alternative, GuideFlow vs Driver.js, replace Driver.js
---

# Migrating from Driver.js

GuideFlow covers the same ground as Driver.js — spotlight, popover, step navigation — but it is **not a
drop-in replacement**. Two shape changes affect every tour you port:

1. **A tour is a state machine.** `start()` takes `{ id, initial, states }`. A flat `{ id, steps: [...] }`
   object is not a valid flow and will throw.
2. **Step text lives under `content`.** `content: { title, body }`, not top-level `title`/`description`.

A tour also only emits `tour:complete` when it reaches a state marked `final: true`. Give the last state
`final: true` or your completion handler never runs.

## Concept mapping

| Driver.js | GuideFlow |
|-----------|-----------|
| `new Driver(options)` | `createGuideFlow(config)` |
| `driver.defineSteps(steps)` + `driver.start()` | `gf.start(flow)` with the steps in one state |
| `driver.highlight({ element, popover })` | a one-step flow, or `gf.hotspot(element, { title, body })` for a beacon that outlives the tour |
| `driver.moveNext()` / `driver.movePrevious()` | `gf.next()` / `gf.prev()` — both async |
| `driver.reset()` / `driver.destroy()` | `gf.stop()` ends the tour; `gf.destroy()` also releases hotspots, hints, listeners and the cross-tab channel |
| `onHighlightStarted` | `gf.on('step:enter', ({ stepId, stepIndex, target }) => …)` |
| `onDestroyStarted` | `gf.on('tour:dismiss', …)` for a user dismissal; `gf.on('tour:abandon', …)` for any early end |
| — (no equivalent callback) | `gf.on('tour:complete', …)`, fired when a `final: true` state runs out of steps |
| `element` | `target` — CSS selector, `HTMLElement`, or `null` for a centred step |
| `popover.title` / `popover.description` | `content.title` / `content.body` |
| `position` / `side` + `align` | one `placement` value, e.g. `'left-start'` |
| `padding` / `stagePadding` | `spotlight.padding` on the instance, or `padding` on a single step |
| `stageRadius` | `spotlight.borderRadius` |
| `opacity` / `overlayOpacity` | `spotlight.overlayOpacity` |
| `overlayColor` | `spotlight.overlayColor` |
| `animate` | `spotlight.animated` |
| `nextBtnText` / `prevBtnText` / `doneBtnText` | `gf.i18n.register('en', { next, prev, done })`, or `actions` on a step |
| interaction with the highlighted element | `clickThrough: true` on the step — GuideFlow blocks it by default |

### No equivalent

- **`allowClose: false`** — only partially reproducible. `spotlight: { dismissOnBackdropClick: false }`
  stops backdrop clicks, but <kbd>Esc</kbd>, the popover's × button and the Skip button always end the
  tour. (<kbd>Esc</kbd> and Skip emit `tour:dismiss` then `tour:abandon`; × emits `tour:abandon` only.)
- **`allowKeyboardControl: false`** — arrow keys and <kbd>Esc</kbd> are always bound while a tour is
  active; there is no option to turn them off.
- **`showProgress` / `progressText`** — the default renderer always shows a progress bar and a
  "Step *n* of *m*" label when a state has more than one step. Change the wording through
  `gf.i18n.register('en', { stepOf: '…{current}…{total}…' })`; there is no switch to hide it.

## Before (Driver.js)

```js
import Driver from 'driver.js';
import 'driver.js/dist/driver.min.css';

const driver = new Driver({
  animate: true,
  opacity: 0.75,
  onDestroyStarted: () => driver.reset(),
});

driver.defineSteps([
  {
    element: '#first-element',
    popover: { title: 'App Title', description: 'App description' },
  },
  {
    element: '#second-element',
    popover: { title: 'Second Feature', description: 'More details' },
  },
]);

driver.start();
```

## After (GuideFlow)

```ts
import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles';

const gf = createGuideFlow({
  spotlight: { animated: true, overlayOpacity: 0.75 },
});

gf.on('tour:abandon', ({ flowId }) => console.warn('ended early:', flowId));
gf.on('tour:complete', ({ flowId }) => console.warn('finished:', flowId));

await gf.start({
  id: 'my-tour',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'step-1',
          content: { title: 'App Title', body: 'App description' },
          target: '#first-element',
          placement: 'bottom',
        },
        {
          id: 'step-2',
          content: { title: 'Second Feature', body: 'More details' },
          target: '#second-element',
          placement: 'bottom',
        },
      ],
      // Without this the tour never emits tour:complete
      final: true,
    },
  },
});
```

## What you gain by splitting states

Keeping every step in one state, as above, is the literal translation. The reason to split is branching:
each state has its own `on` transition table, guards and entry/exit hooks, so you can send an event and
jump the user down a different path.

```ts
await gf.start({
  id: 'checkout',
  initial: 'cart',
  states: {
    cart: {
      steps: [{ id: 'items', content: { title: 'Your cart' }, target: '#cart' }],
      on: { CHECKOUT: 'payment', EMPTY: 'browse' },
    },
    browse: {
      steps: [{ id: 'catalog', content: { title: 'Find something first' }, target: '#catalog' }],
      final: true,
    },
    payment: {
      steps: [{ id: 'pay', content: { title: 'Pay securely' }, target: '#pay' }],
      final: true,
    },
  },
});

// Fire a transition from the current state's `on` table
await gf.send('CHECKOUT');
```

Note that `currentStepIndex` and `totalSteps` are scoped to the current state, so a flow split across
states counts steps per state rather than across the whole tour.
