# Glass Theme

A frosted glass, translucent theme with backdrop blur. Perfect for modern UIs and dark mode apps.

## Preview

- Semi-transparent background with backdrop blur
- Soft white text on dark surfaces
- Glowing border accents
- Elegant, floating appearance

## Usage

```ts
import '@guideflow/core/styles'
import '@guideflow/core/styles/themes/glass.css'
```

## Design Tokens

| Token | Value |
|-------|-------|
| `--gf-popover-bg` | `rgba(255,255,255,0.1)` |
| `--gf-popover-color` | `#f1f5f9` |
| `--gf-popover-border` | `1px solid rgba(255,255,255,0.2)` |
| `--gf-popover-border-radius` | `12px` |
| `--gf-popover-backdrop` | `blur(16px)` |
| `--gf-popover-shadow` | `0 8px 32px rgba(0,0,0,0.2)` |
| `--gf-btn-primary-bg` | `rgba(99,102,241,0.8)` |
| `--gf-btn-primary-color` | `#ffffff` |

## Notes

- Requires browser support for `backdrop-filter`
- Falls back to a solid dark background in unsupported browsers
