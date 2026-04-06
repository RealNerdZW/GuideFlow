---
description: Migrate from Driver.js to GuideFlow. GuideFlow is a drop-in replacement with a more expressive API, built-in AI capabilities, and first-class TypeScript support.
keywords: migrate from Driver.js, Driver.js alternative, GuideFlow vs Driver.js, replace Driver.js
---

# Migrating from Driver.js

GuideFlow is a drop-in replacement for Driver.js with a more expressive API, AI capabilities, and a first-class TypeScript experience.

## Concept mapping

| Driver.js | GuideFlow |
|-----------|-----------|
| `new Driver()` | `createGuideFlow()` |
| `driver.highlight({ element, popover })` | `gf.start({ id, steps: [{ target, title, body }] })` |
| `driver.drive(steps)` | `gf.start({ id, steps })` |
| `driver.destroy()` | `gf.destroy()` |
| `onHighlightStarted` | `gf.on('step:enter', handler)` |
| `onDestroyStarted` | `gf.on('tour:end', handler)` |
| `allowClose` | `step.allowDismiss` |
| `stagePadding` | `config.spotlight.padding` |

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

const gf = createGuideFlow({ spotlight: { opacity: 0.75 } });

gf.on('tour:end', () => console.log('Tour ended'));

gf.start({
  id: 'my-tour',
  steps: [
    {
      id: 'step-1',
      title: 'App Title',
      body: 'App description',
      target: '#first-element',
      placement: 'bottom',
    },
    {
      id: 'step-2',
      title: 'Second Feature',
      body: 'More details',
      target: '#second-element',
      placement: 'bottom',
    },
  ],
});
```
