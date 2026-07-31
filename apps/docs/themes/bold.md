---
description: GuideFlow Bold theme — a dark indigo tour popover with a violet accent and a coloured glow shadow, activated with data-gf-theme="bold".
keywords: GuideFlow bold theme, dark tour popover, violet accent tour, data-gf-theme bold
---

# Bold Theme

A dark indigo popover surface with a violet accent and a coloured glow shadow.

## Usage

```ts
import '@guideflow/core/styles'
```

```html
<html data-gf-theme="bold">
```

The bundle already contains this theme — there is no separate `bold.css` to import.

## What it overrides

| Token | Value |
|-------|-------|
| `--gf-popover-bg` | `#1e1b4b` |
| `--gf-popover-text` | `#f1f5f9` |
| `--gf-popover-border` | `rgba(255, 255, 255, 0.1)` |
| `--gf-accent-color` | `#a78bfa` |
| `--gf-accent-fg` | `#1e1b4b` |
| `--gf-shadow` | `0 12px 40px rgba(99, 102, 241, 0.35)` |
| `--gf-border-radius` | `12px` |
| `--gf-progress-bg` | `rgba(255, 255, 255, 0.15)` |

The theme changes colour, radius and shadow only — font size, weight and padding are the
defaults.
