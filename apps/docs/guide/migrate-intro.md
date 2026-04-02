# Migrating from Intro.js

## Concept mapping

| Intro.js | GuideFlow |
|----------|-----------|
| `introJs()` | `createGuideFlow()` |
| `.setOptions({ steps })` | `gf.start({ id, steps })` |
| `.start()` | `gf.start(flow)` |
| `.exit()` | `gf.end()` |
| `data-intro` attributes | `data-gf-step`, `data-gf-title`, `data-gf-body` |
| `data-position` | `data-gf-placement` |
| `.onbeforechange(fn)` | `gf.on('step:enter', fn)` |
| `.oncomplete(fn)` | `gf.on('tour:end', fn)` |
| `.onexit(fn)` | `gf.on('tour:skip', fn)` |

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

gf.start({
  id: 'hello-world',
  steps: [
    { id: '1', body: 'Hello World! 👋', target: '#step1', placement: 'bottom' },
    { id: '2', body: 'This is how you do it.', target: '#step2', placement: 'right' },
  ],
});
```

## After (GuideFlow — attribute compat mode)

GuideFlow ships with an Intro.js–compatible attribute scanner. Add the attributes to your HTML and call `autoInit()`:

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
autoInit(); // scans DOM and starts the tour
```
