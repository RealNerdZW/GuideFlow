---
description: The real GuideFlow CSS custom properties — every token declared in tokens.css, which ones change the default rendering, and how to build your own theme.
keywords: GuideFlow custom theme, CSS custom properties tour, tour design tokens, gf-popover-bg, gf-accent-color
---

# Custom Tokens

GuideFlow has no theme API. A theme is just a block of CSS custom properties, so you build one by
re-declaring the tokens from `packages/core/src/styles/tokens.css`.

```ts
import '@guideflow/core/styles'
import './my-theme.css'
```

```css
/* my-theme.css */
:root {
  --gf-popover-bg: #0f172a;
  --gf-popover-text: #e2e8f0;
  --gf-popover-border: #334155;
  --gf-border-radius: 12px;
  --gf-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  --gf-accent-color: #8b5cf6;
  --gf-accent-fg: #ffffff;
}
```

Scope it however you like, but the selector must match an **ancestor of the popover**. The default
renderer appends its popover, the spotlight overlay and hotspot beacons straight to
`document.body`, so `:root`, `html` and `body` are the safe choices. A selector on your app root
will not reach them.

## Tokens that change the default rendering

| Token | Default | Affects |
|---|---|---|
| `--gf-popover-bg` | `#ffffff` | Popover surface; hotspot and hint tooltip surface |
| `--gf-popover-text` | `#111827` | Popover text and tooltip text |
| `--gf-popover-border` | `rgba(0, 0, 0, 0.08)` | Popover border **colour** (the width is fixed at `1px`) |
| `--gf-popover-width` | `320px` | Popover width, capped at `calc(100vw - 32px)` |
| `--gf-accent-color` | `#6366f1` | Primary button background, focus outlines, progress-bar fill, hotspot beacon, hint badge |
| `--gf-accent-fg` | `#ffffff` | Primary button text |
| `--gf-border-radius` | `10px` | Popover and tooltip corner radius |
| `--gf-border-radius-sm` | `6px` | Feeds `--gf-btn-radius` |
| `--gf-btn-radius` | `var(--gf-border-radius-sm)` | Button corner radius |
| `--gf-shadow` | `0 8px 32px rgba(0,0,0,.16), 0 2px 8px rgba(0,0,0,.08)` | Popover and tooltip shadow |
| `--gf-font-family` | `system-ui, …` | Popover and hint typography |
| `--gf-font-size` | `14px` | Popover body text |
| `--gf-line-height` | `1.6` | Popover body text |
| `--gf-spacing` | `16px` | Popover padding |
| `--gf-progress-bg` | `rgba(0, 0, 0, 0.1)` | Progress-bar track |
| `--gf-hotspot-size` | `12px` | Hotspot beacon diameter |

Note that the border and shadow tokens hold a **colour** and a **shadow value** respectively, not
CSS shorthand — `--gf-popover-border: 1px solid #ccc` will not work, use `--gf-popover-border: #ccc`.

## Tokens with no effect today

These are declared in `tokens.css` but do not currently reach the rendered output. They are
documented here so you do not waste time setting them.

| Token | Why |
|---|---|
| `--gf-overlay-color` | No rule reads it. The dim colour comes from the `spotlight.overlayColor` option |
| `--gf-overlay-opacity` | Only a stylesheet fallback; the spotlight writes an inline `box-shadow` from `spotlight.overlayOpacity` on every update, which wins |
| `--gf-z-overlay` | The overlay's `z-index: 999998` is hard-coded in the injected spotlight CSS |
| `--gf-z-popover` | Read by `popover.css`, but the renderer's injected CSS hard-codes `999999` |
| `--gf-arrow-size` | `popover.css` styles `.gf-popover-arrow`, but the default renderer never creates an arrow element |
| `--gf-spacing-sm` | The injected renderer CSS hard-codes the equivalent margins |
| `--gf-font-size-sm` | Same |
| `--gf-btn-padding` | Same |
| `--gf-btn-font-size` | Same |
| `--gf-progress-fill` | The injected renderer CSS fills the progress bar from `--gf-accent-color` instead |

The last six are read by the bundled `popover.css`, but with `injectStyles` left on (the default)
the renderer appends its own equivalent rules to `<head>` at runtime. Same specificity, later in
the cascade, so the injected rule wins. They do take effect if you opt out of injection and rely
on the imported stylesheet alone:

```ts
createGuideFlow({ injectStyles: false })
```

## Styling the spotlight

The overlay is not token-driven — it is configured in JavaScript:

```ts
createGuideFlow({
  spotlight: {
    padding: 8,
    borderRadius: 4,
    animated: true,
    overlayColor: '#000',
    overlayOpacity: 0.5,
    dismissOnBackdropClick: true,
  },
})
```

`overlayColor` is composed with `overlayOpacity` when it is a hex colour. An `rgba()` / `hsla()`
value carries its own alpha and is used verbatim, with `overlayOpacity` ignored.

## Dark mode

The bundled `dark.css` already ships a dark palette, applied automatically under
`@media (prefers-color-scheme: dark)` and manually via `[data-gf-dark]` or `.gf-dark`:

```html
<body data-gf-dark>
```

To supply your own instead, override the same tokens:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --gf-popover-bg: #1e293b;
    --gf-popover-text: #f1f5f9;
    --gf-popover-border: #475569;
  }
}
```

## High contrast

`high-contrast.css` maps the popover onto system colours under `@media (forced-colors: active)`,
and offers an explicit `[data-gf-high-contrast]` / `.gf-high-contrast` opt-in that switches to a
black surface, white border and yellow accent.

## RTL

`rtl.css` keys off the standard `dir` attribute — set `dir="rtl"` on `<html>` and the popover
footer, action row and hotspot tooltip anchoring flip. No GuideFlow-specific attribute is needed.
