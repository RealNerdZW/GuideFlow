---
description: GuideFlow Enterprise theme — a muted slate tour popover with a blue accent and an Inter-first font stack, activated with data-gf-theme="enterprise".
keywords: GuideFlow enterprise theme, neutral tour popover, enterprise onboarding tour, data-gf-theme enterprise
---

# Enterprise Theme

A muted slate surface with a conservative radius and a blue primary accent.

## Usage

```ts
import '@guideflow/core/styles'
```

```html
<html data-gf-theme="enterprise">
```

The bundle already contains this theme — there is no separate `enterprise.css` to import.

## What it overrides

| Token | Value |
|-------|-------|
| `--gf-popover-bg` | `#f8fafc` |
| `--gf-popover-text` | `#1e293b` |
| `--gf-popover-border` | `#e2e8f0` |
| `--gf-accent-color` | `#2563eb` |
| `--gf-accent-fg` | `#ffffff` |
| `--gf-shadow` | `0 4px 16px rgba(0, 0, 0, 0.10)` |
| `--gf-border-radius` | `8px` |
| `--gf-border-radius-sm` | `4px` |
| `--gf-font-family` | `'Inter', system-ui, sans-serif` |

## Notes

This is the only built-in theme that changes typography, and it asks for **Inter** first.
GuideFlow does not bundle or load that font — if Inter is not already available in your app, the
stack falls back to `system-ui`.
