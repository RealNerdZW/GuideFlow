---
description: GuideFlow Minimal theme — a near-monochrome tour popover theme with a lighter shadow and tighter corner radii, activated with data-gf-theme="minimal".
keywords: GuideFlow minimal theme, clean tour popover, data-gf-theme minimal
---

# Minimal Theme

An understated, near-monochrome variant: a near-black accent instead of the default indigo,
tighter corners and a softer shadow.

## Usage

```ts
import '@guideflow/core/styles'
```

```html
<html data-gf-theme="minimal">
```

The bundle already contains this theme — there is no separate `minimal.css` to import.

## What it overrides

These are the only declarations in the `[data-gf-theme="minimal"]` block. Everything else falls
through to the defaults in `tokens.css`.

| Token | Value |
|-------|-------|
| `--gf-shadow` | `0 2px 12px rgba(0, 0, 0, 0.10)` |
| `--gf-border-radius` | `6px` |
| `--gf-border-radius-sm` | `4px` |
| `--gf-popover-border` | `rgba(0, 0, 0, 0.12)` |
| `--gf-accent-color` | `#18181b` |
| `--gf-accent-fg` | `#ffffff` |
| `--gf-progress-fill` | `#18181b` |

Typography, padding and popover width are unchanged from the defaults.
