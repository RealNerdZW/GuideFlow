---
description: Migrate from Intro.js to GuideFlow. Concept mapping, event equivalents, and the attribute scanner — including the fact that GuideFlow reads its own data-gf-* attributes, not data-intro.
keywords: migrate from Intro.js, Intro.js alternative, GuideFlow vs Intro.js, replace Intro.js
---

# Migrating from Intro.js

Read this first, because it catches out everyone porting a tour:

1. **A tour is a state machine.** `start()` takes `{ id, initial, states }`. A flat `{ id, steps: [...] }`
   object is not a valid flow and will throw.
2. **Step text lives under `content`** — `content: { title, body }`, not `intro`.
3. **The attribute scanner reads `data-gf-*`, not `data-intro`.** Intro.js attributes are ignored
   entirely; you have to rename them.
4. A tour only emits `tour:complete` when it reaches a state marked `final: true`.

## Concept mapping

| Intro.js | GuideFlow |
|----------|-----------|
| `introJs()` | `createGuideFlow()` |
| `.setOptions({ steps })` + `.start()` | `gf.start({ id, initial, states: { tour: { steps, final: true } } })` |
| `.exit()` | `gf.stop()` — or `gf.skip()` to reproduce a user-initiated exit |
| `.nextStep()` / `.previousStep()` | `gf.next()` / `gf.prev()` — both async |
| `.goToStep(n)` | `gf.goTo(stepId)` — by step id, not index; it can cross states |
| `.onbeforechange(fn)` / `.onchange(fn)` | `gf.on('step:enter', ({ stepId, stepIndex, target }) => …)` |
| `.oncomplete(fn)` | `gf.on('tour:complete', …)` — needs a `final: true` state |
| `.onexit(fn)` | `gf.on('tour:dismiss', …)` for a user exit; `gf.on('tour:abandon', …)` for any early end |
| `step.element` | `step.target` — selector, `HTMLElement`, or `null` for a centred step |
| `step.intro` | `step.content.body` (escaped text) or `step.content.html` (allowlist-sanitised markup) |
| `step.title` | `step.content.title` |
| `step.position` | `step.placement` |
| `nextLabel` / `prevLabel` / `doneLabel` | `gf.i18n.register('en', { next, prev, done })`, or `actions` on a step |
| `exitOnOverlayClick` | `spotlight: { dismissOnBackdropClick: false }` |
| `disableInteraction: false` | `clickThrough: true` on the step — GuideFlow blocks interaction by default |
| `data-step` | `data-gf-step` |
| `data-title` | `data-gf-title` |
| `data-intro` | `data-gf-body` |
| `data-position` | `data-gf-placement` |
| `introJs().addHints()` / `data-hint` | `gf.hints([{ id, target, hint }])` then `gf.showHints()` |

### No equivalent

- **`exitOnEsc: false`** — <kbd>Esc</kbd> always dismisses an active tour and cannot be unbound.
- **`showStepNumbers` / `showBullets` / `showProgress`** — the default renderer always shows a progress
  bar and a "Step *n* of *m*" label when the current state has more than one step. You can reword it with
  `gf.i18n.register('en', { stepOf: '…' })`, but not switch it off.
- **`.refresh()`** — the spotlight already tracks its target through scroll and resize.
- **`tooltipClass` / `highlightClass`** — style the built-in hooks instead (`.gf-popover` and friends for
  the popover, `[data-gf-overlay]` / `[data-gf-spotlight-cutout]` for the overlay), or supply your own
  `RendererContract`.

## Before (Intro.js)

```js
import introJs from 'intro.js';
import 'intro.js/introjs.css';

introJs().setOptions({
  steps: [
    {
      element: document.querySelector('#step1'),
      intro: 'Hello World! 👋',
    },
    {
      element: document.querySelector('#step2'),
      intro: 'This is how you do it.',
      position: 'right',
    },
  ],
}).start();
```

## After (GuideFlow — programmatic)

```ts
import { createGuideFlow } from '@guideflow/core';
import '@guideflow/core/styles';

const gf = createGuideFlow();

await gf.start({
  id: 'hello-world',
  initial: 'tour',
  states: {
    tour: {
      steps: [
        { id: '1', content: { body: 'Hello World! 👋' }, target: '#step1', placement: 'bottom' },
        { id: '2', content: { body: 'This is how you do it.' }, target: '#step2', placement: 'right' },
      ],
      // Without this the tour never emits tour:complete
      final: true,
    },
  },
});
```

`content.body` is escaped before it is rendered. If your Intro.js copy contained markup, move it to
`content.html`, which is sanitised against an allowlist — `<svg>`, `<iframe>`, `<style>`, `style=`
attributes and custom elements are stripped. Set one or the other: when both are present, `body` wins and
`html` is ignored.

## After (GuideFlow — attribute compat mode)

The scanner is Intro.js-shaped but reads GuideFlow's own attributes. Rename `data-intro` → `data-gf-body`,
`data-step` → `data-gf-step`, `data-title` → `data-gf-title`, `data-position` → `data-gf-placement`.

```html
<div data-gf-step="1" data-gf-title="Hello World" data-gf-body="Welcome! 👋">
  First element
</div>

<div data-gf-step="2" data-gf-body="This is how you do it." data-gf-placement="right">
  Second element
</div>
```

```ts
import { autoInit } from '@guideflow/core';

autoInit(); // scans the document and starts the tour
```

Elements are sorted by the numeric value of `data-gf-step` and collected into a single `final: true`
state, so navigation and the "Step *n* of *m*" counter cover the whole tour.

There is a fifth attribute with no Intro.js counterpart: `data-gf-show-if` takes a dot-notation path into
the guidance context (`featureFlags.showTour`, `roles`), and the step is skipped when it resolves falsy.
Anything that is not a plain property path is rejected with a console warning — it is not an expression
evaluator.

For control over the instance, skip `autoInit()` and drive the scanner yourself:

```ts
import { createGuideFlow, scanAttributeTour, watchAttributeTour } from '@guideflow/core';

const gf = createGuideFlow({ context: { featureFlags: { showTour: true } } });

const flow = scanAttributeTour(); // FlowDefinition | null
if (flow) await gf.start(flow);

// Rescan when the DOM changes (returns an unsubscribe function)
const stop = watchAttributeTour((next) => void gf.start(next));
```
