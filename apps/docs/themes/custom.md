# Custom Tokens

Create your own theme by overriding GuideFlow's CSS custom properties.

## Available Tokens

### Popover

| Token | Description | Default |
|-------|-------------|---------|
| `--gf-popover-bg` | Background color | `#ffffff` |
| `--gf-popover-color` | Text color | `#1f2937` |
| `--gf-popover-border` | Border shorthand | `1px solid #e5e7eb` |
| `--gf-popover-border-radius` | Corner radius | `8px` |
| `--gf-popover-shadow` | Box shadow | `0 4px 16px rgba(0,0,0,0.12)` |
| `--gf-popover-padding` | Inner padding | `16px 20px` |
| `--gf-popover-max-width` | Maximum width | `320px` |
| `--gf-popover-font` | Font family | `inherit` |
| `--gf-popover-backdrop` | Backdrop filter | `none` |

### Buttons

| Token | Description | Default |
|-------|-------------|---------|
| `--gf-btn-primary-bg` | Primary button background | `#3b82f6` |
| `--gf-btn-primary-color` | Primary button text | `#ffffff` |
| `--gf-btn-secondary-bg` | Secondary button background | `transparent` |
| `--gf-btn-secondary-color` | Secondary button text | `#6b7280` |
| `--gf-btn-border-radius` | Button corner radius | `6px` |
| `--gf-btn-padding` | Button padding | `8px 16px` |

### Spotlight

| Token | Description | Default |
|-------|-------------|---------|
| `--gf-overlay-color` | Overlay background | `#000000` |
| `--gf-overlay-opacity` | Overlay opacity | `0.5` |

### Hotspot Beacon

| Token | Description | Default |
|-------|-------------|---------|
| `--gf-beacon-color` | Beacon pulse color | `#6366f1` |
| `--gf-beacon-size` | Beacon diameter | `12px` |

## Creating a Theme File

```css
/* my-theme.css */
.guideflow-popover {
  --gf-popover-bg: #0f172a;
  --gf-popover-color: #e2e8f0;
  --gf-popover-border: 1px solid #334155;
  --gf-popover-border-radius: 12px;
  --gf-popover-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  --gf-btn-primary-bg: #8b5cf6;
  --gf-btn-primary-color: #ffffff;
}
```

```ts
import '@guideflow/core/styles'
import './my-theme.css'
```

## Dark Mode

Use CSS media queries or class-based toggling:

```css
@media (prefers-color-scheme: dark) {
  .guideflow-popover {
    --gf-popover-bg: #1e293b;
    --gf-popover-color: #f1f5f9;
    --gf-popover-border: 1px solid #475569;
  }
}
```

Or with a class toggle:

```css
.dark .guideflow-popover {
  --gf-popover-bg: #1e293b;
  --gf-popover-color: #f1f5f9;
}
```
