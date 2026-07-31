---
description: GuideFlow Brutalist theme — black-on-white tour popovers with square corners and a hard offset shadow, activated with data-gf-theme="brutalist".
keywords: GuideFlow brutalist theme, square tour popover, hard shadow tour, data-gf-theme brutalist
---

# Brutalist Theme

Black on white, square corners, and a hard 4px offset shadow instead of a blur.

## Usage

```ts
import '@guideflow/core/styles'
```

```html
<html data-gf-theme="brutalist">
```

The bundle already contains this theme — there is no separate `brutalist.css` to import.

## What it overrides

| Token | Value |
|-------|-------|
| `--gf-popover-bg` | `#ffffff` |
| `--gf-popover-text` | `#000000` |
| `--gf-popover-border` | `#000000` |
| `--gf-accent-color` | `#000000` |
| `--gf-accent-fg` | `#ffffff` |
| `--gf-shadow` | `4px 4px 0 #000000` |
| `--gf-border-radius` | `0px` |
| `--gf-border-radius-sm` | `0px` |
| `--gf-btn-radius` | `0px` |

Plus one non-token rule that thickens the popover outline:

```css
[data-gf-theme="brutalist"] .gf-popover { border: 2px solid #000; }
```

## Notes

The theme does not set a font. If you want monospace type, declare `--gf-font-family` yourself:

```css
[data-gf-theme="brutalist"] {
  --gf-font-family: ui-monospace, 'SFMono-Regular', 'Courier New', monospace;
}
```
