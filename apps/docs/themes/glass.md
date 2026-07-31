---
description: GuideFlow Glass theme — a translucent white tour popover with a backdrop-filter blur, activated with data-gf-theme="glass".
keywords: GuideFlow glass theme, frosted glass tour, backdrop blur popover, data-gf-theme glass
---

# Glass Theme

A translucent white popover surface with a frosted `backdrop-filter` blur.

## Usage

```ts
import '@guideflow/core/styles'
```

```html
<html data-gf-theme="glass">
```

The bundle already contains this theme — there is no separate `glass.css` to import.

## What it overrides

| Token | Value |
|-------|-------|
| `--gf-popover-bg` | `rgba(255, 255, 255, 0.72)` |
| `--gf-popover-border` | `rgba(255, 255, 255, 0.5)` |
| `--gf-shadow` | `0 8px 32px rgba(31, 38, 135, 0.18)` |
| `--gf-border-radius` | `16px` |

It also applies a non-token rule to the popover itself:

```css
backdrop-filter: blur(16px) saturate(180%);
-webkit-backdrop-filter: blur(16px) saturate(180%);
```

## Notes

- The theme does **not** override `--gf-popover-text`. Text stays the default dark
  `#111827` — which is what the 72%-white surface is designed for. If you pair Glass with dark
  mode, set `--gf-popover-bg` yourself to something dark and translucent, or the dark text will
  sit on a light panel.
- `backdrop-filter` requires browser support. Without it there is no fallback rule: you get a
  flat 72%-opaque white panel rather than a blurred one.
- The blur rule matches `[data-gf-theme="glass"] .gf-popover` and
  `.gf-popover[data-gf-theme="glass"]`. Since the default renderer appends the popover to
  `document.body`, put the attribute on `<html>` or `<body>`.
