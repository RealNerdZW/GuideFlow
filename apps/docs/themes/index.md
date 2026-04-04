# Themes

GuideFlow ships with a collection of built-in themes that control the look and feel of tour popovers, spotlight overlays, and hotspot beacons.

## Available Themes

| Theme | Style | Best for |
|-------|-------|----------|
| [Minimal](./minimal) | Clean, understated | SaaS dashboards, developer tools |
| [Bold](./bold) | Vibrant, high-contrast | Consumer apps, marketing sites |
| [Glass](./glass) | Frosted glass, translucent | Modern UIs, dark mode apps |
| [Brutalist](./brutalist) | Raw, monospace, bordered | Developer tools, CLI-adjacent UIs |
| [Enterprise](./enterprise) | Neutral, accessible | Enterprise software, compliance-heavy UIs |

## Applying a Theme

Import the theme CSS alongside the base styles:

```ts
import '@guideflow/core/styles'
import '@guideflow/core/styles/themes/minimal.css'
```

## Custom Themes

You can create your own theme by overriding CSS custom properties. See [Custom Tokens](./custom) for the full list of available design tokens.

```css
.guideflow-popover {
  --gf-popover-bg: #1a1a2e;
  --gf-popover-color: #e0e0e0;
  --gf-popover-border-radius: 12px;
  --gf-popover-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```
