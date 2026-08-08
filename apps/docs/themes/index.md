---
description: GuideFlow ships 5 built-in themes — Minimal, Bold, Glass, Brutalist and Enterprise — activated with the data-gf-theme attribute, plus dark mode, high contrast and RTL stylesheets.
keywords: GuideFlow themes, product tour theme, tour popover styles, data-gf-theme, CSS custom properties
---

# Themes

GuideFlow's look is driven entirely by **CSS custom properties**. The built-in themes are nothing
more than blocks that re-declare those properties, keyed on a `data-gf-theme` attribute.

```ts
createGuideFlow({ theme: 'bold' })   // or configure({ theme }) at any time
```

That sets the attribute on `<html>` — not on the popover, because the spotlight overlay, hotspot
beacons and hint badges are all portalled to `document.body` and read the same properties. Only the
root themes every surface. Set the attribute yourself if you would rather; nothing else is
involved.

## One stylesheet

Everything ships in a single bundle:

```ts
import '@guideflow/core/styles'
```

That resolves to `dist/styles/index.css`, which imports:

| File | Contains |
|---|---|
| `tokens.css` | The `:root` custom-property defaults |
| `popover.css` | Base popover, button, progress-bar and arrow rules |
| `themes.css` | All five `[data-gf-theme="…"]` blocks |
| `dark.css` | Dark colour tokens |
| `rtl.css` | `[dir="rtl"]` layout flips |
| `high-contrast.css` | `forced-colors` and explicit high-contrast tokens |

Individual files are reachable via the `./styles/*` subpath if you want to cherry-pick, e.g.
`@guideflow/core/styles/themes.css`. **There is no per-theme file** — `minimal.css`, `bold.css`
and friends do not exist.

## Applying a theme

Set `data-gf-theme` on `<html>` or `<body>`:

```html
<html data-gf-theme="minimal">
```

```ts
document.documentElement.setAttribute('data-gf-theme', 'brutalist')
```

The attribute must sit on an **ancestor of the popover**. The default renderer appends its
popover, the spotlight overlay and hotspot beacons directly to `document.body`, so anything
deeper than `<body>` — an app root div, for example — will not reach them.

## Available themes

| Theme | Attribute value | What it changes |
|---|---|---|
| [Minimal](./minimal) | `minimal` | Near-black accent, tighter radii, lighter shadow |
| [Bold](./bold) | `bold` | Dark indigo surface, violet accent, glow shadow |
| [Glass](./glass) | `glass` | Translucent white surface + `backdrop-filter` blur |
| [Brutalist](./brutalist) | `brutalist` | Black-on-white, square corners, hard offset shadow |
| [Enterprise](./enterprise) | `enterprise` | Muted slate surface, blue accent, Inter font stack |

Each theme overrides a handful of tokens and inherits the rest from `tokens.css`. None of them
change typography weight, padding or spacing except where the page says so.

## Dark mode

`dark.css` applies dark tokens two ways:

- automatically under `@media (prefers-color-scheme: dark)`, scoped to `:root`
- explicitly via `[data-gf-dark]` or `.gf-dark` on any ancestor

```html
<body data-gf-dark>
```

Because `dark.css` is imported *after* `themes.css`, the automatic `:root` block wins over a theme
applied to `<html>`. Put `data-gf-theme` on `<body>` if you want the theme's colours to survive the
OS dark-mode preference.

## High contrast

`high-contrast.css` handles Windows High Contrast / forced-colors mode automatically. You can also
opt in explicitly with `[data-gf-high-contrast]` or `.gf-high-contrast`, which switches to a
black surface, white border and yellow accent.

## RTL

`rtl.css` keys off the standard `dir` attribute — no GuideFlow-specific opt-in:

```html
<html dir="rtl">
```

It reverses the popover footer and action rows, and mirrors hotspot tooltip anchoring.

## Custom themes

Declare the tokens yourself under any selector. See [Custom Tokens](./custom) for the full
verified list.

```css
:root {
  --gf-popover-bg: #1a1a2e;
  --gf-popover-text: #e0e0e0;
  --gf-border-radius: 12px;
  --gf-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  --gf-accent-color: #8b5cf6;
  --gf-accent-fg: #ffffff;
}
```
