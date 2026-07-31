---
description: "Use GuideFlow from a CDN with a plain script tag — no bundler, no build step. jsDelivr and unpkg URLs, version pinning, and the global API."
keywords: GuideFlow CDN, jsDelivr, unpkg, script tag, no build step, vanilla JS product tour
---

# Using GuideFlow from a CDN

`@guideflow/core` ships a self-contained IIFE build with no imports and no dependencies, so it works
from a plain `<script>` tag. No bundler, no build step, no npm install.

This is the fastest way to try GuideFlow, and the right choice for a server-rendered app that has no
JavaScript build pipeline.

## Quick start

```html
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@guideflow/core@0.1/dist/styles/index.css" />
  </head>
  <body>
    <button id="start">Take the tour</button>
    <div id="sidebar">Sidebar</div>

    <script src="https://cdn.jsdelivr.net/npm/@guideflow/core@0.1/dist/index.global.js"></script>
    <script>
      // The IIFE build exposes the whole package namespace as `GuideFlow`.
      var gf = GuideFlow.createGuideFlow()

      document.getElementById('start').addEventListener('click', function () {
        gf.start({
          id: 'welcome',
          initial: 'main',
          states: {
            main: {
              steps: [
                {
                  id: 'step-1',
                  target: '#sidebar',
                  placement: 'right',
                  content: { title: 'Welcome!', body: 'This is your dashboard.' },
                },
              ],
              final: true,
            },
          },
        })
      })
    </script>
  </body>
</html>
```

Everything exported from the package is on the `GuideFlow` global — `createGuideFlow`, `createMachine`,
`SpotlightOverlay`, `ProgressStore`, `I18nRegistry`, `DefaultRenderer`, and the rest.

## URLs

Both major npm CDNs work. jsDelivr is used in the examples above.

| | URL |
|---|---|
| jsDelivr | `https://cdn.jsdelivr.net/npm/@guideflow/core@0.1/dist/index.global.js` |
| unpkg | `https://unpkg.com/@guideflow/core@0.1/dist/index.global.js` |
| Styles | `.../dist/styles/index.css` |

Both CDNs also honour the `jsdelivr` and `unpkg` fields in `package.json`, so the bare package
specifier resolves to the same file:

```html
<script src="https://cdn.jsdelivr.net/npm/@guideflow/core@0.1"></script>
```

### Pin your version

The examples pin the minor (`@0.1`), which picks up patch releases but not breaking changes.

| Specifier | Resolves to | Use when |
|---|---|---|
| `@guideflow/core@0.1.9` | exactly that version | production — fully reproducible |
| `@guideflow/core@0.1` | latest `0.1.x` | you want patches automatically |
| `@guideflow/core` | latest, any version | prototyping only |

**Do not ship an unpinned specifier to production.** GuideFlow is pre-1.0; a minor bump can change
behaviour.

## Additional stylesheets

`index.css` is the base. The optional themes are separate files:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@guideflow/core@0.1/dist/styles/index.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@guideflow/core@0.1/dist/styles/dark.css" />
```

See [Theming](../themes/) for what each stylesheet provides and which custom properties it defines.

## Content Security Policy

GuideFlow injects a `<style>` element at runtime. Under a strict CSP, pass your nonce:

```js
var gf = GuideFlow.createGuideFlow({ nonce: 'YOUR_NONCE' })
```

Or set `injectStyles: false` and load every stylesheet yourself via `<link>`.

## What is not on the CDN

Only `@guideflow/core` ships an IIFE build. The framework adapters (`@guideflow/react`,
`@guideflow/vue`, `@guideflow/svelte`) and the optional packages (`@guideflow/ai`,
`@guideflow/analytics`) are ESM/CJS only — they are meant to be bundled, and each expects its
framework as a peer.

If you need those without a bundler, load them as ES modules with an import map, or install them
with npm.

## Bundler users

If you have a build step, install the package instead — you get types, tree-shaking and a smaller
payload:

```bash
pnpm add @guideflow/core
```

See [Installation](./installation).
