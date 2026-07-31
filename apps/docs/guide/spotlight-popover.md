---
description: GuideFlow's spotlight overlay dims the page around a target element and the popover anchors to it with viewport-aware fallback placement. Configuration reference.
keywords: GuideFlow spotlight, popover tooltip, guided tour overlay, smart positioning tooltip
---

# Spotlight & Popover

The spotlight dims the page around the target element and cuts a hole over it;
the popover anchors to the target and flips to a fallback placement when the
preferred one does not fit the viewport.

## Spotlight Configuration

Spotlight defaults are set once, when the instance is created:

```ts
const gf = createGuideFlow({
  spotlight: {
    padding: 8,           // px around the highlighted element
    borderRadius: 4,      // corner radius of the cutout
    animated: true,       // transition the cutout between targets
    overlayColor: '#000', // colour of the dimmed area
    overlayOpacity: 0.5,  // 0–1, applied to a hex overlayColor
    dismissOnBackdropClick: true,
  },
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `padding` | `number` | `8` | Padding around the highlighted element (px). A step's own `padding` overrides it for that step only |
| `borderRadius` | `number` | `4` | Corner radius of the cutout (px) |
| `animated` | `boolean` | `true` | Animate position/size changes between targets |
| `overlayColor` | `string` | `'#000'` | Colour of the dimmed area |
| `overlayOpacity` | `number` | `0.5` | Opacity 0–1 |
| `dismissOnBackdropClick` | `boolean` | `true` | Clicking the dimmed area dismisses the tour (`tour:dismiss` → `tour:abandon`) |
| `nonce` | `string` | `''` | CSP nonce for the spotlight's own `<style>` tag |

`overlayColor` and `overlayOpacity` compose like this: a hex colour (`#000`,
`#112233`) is converted to `rgba()` using `overlayOpacity`; a colour that already
carries alpha (`rgba(…)`, `hsla(…)`) is used verbatim and `overlayOpacity` is
ignored; anything else (a named colour, `var(--x)`) is passed straight through.

Per-step overrides are limited to `padding` and `clickThrough` — the other
options are instance-wide.

## Click-Through

By default the overlay swallows clicks outside the cutout. `clickThrough` turns
`pointer-events` off for the whole overlay, so the user can interact with the
page underneath:

```ts
{
  id: 'interactive-step',
  content: { title: 'Try clicking the button' },
  target: '#action-btn',
  clickThrough: true,
}
```

While `clickThrough` is on, backdrop-click dismissal is suppressed for that step.

## Popover Placements

`placement` is a *preference*. If the popover does not fit, GuideFlow tries the
opposite side, then the perpendicular sides, and finally `center`.

| Placement | Description |
|-----------|-------------|
| `top` | Centered above |
| `top-start` | Above, aligned left |
| `top-end` | Above, aligned right |
| `bottom` | Centered below |
| `bottom-start` | Below, aligned left |
| `bottom-end` | Below, aligned right |
| `left` | Centered to the left |
| `left-start` | Left, aligned top |
| `left-end` | Left, aligned bottom |
| `right` | Centered to the right |
| `right-start` | Right, aligned top |
| `right-end` | Right, aligned bottom |
| `center` | Centered in the viewport |

A step with no `target` is always rendered `center`, over a fully dimmed page.
The popover re-positions on scroll and resize.

## Auto-Scroll

The target is scrolled into view before the spotlight is drawn, with a 150 ms
settle before positioning. Disable per step:

```ts
{
  id: 'no-scroll',
  content: { title: 'Already visible' },
  target: '#visible-element',
  scrollIntoView: false,
}
```

## CSP Compliance

GuideFlow injects two independent stylesheets: the popover CSS (from the
renderer) and the spotlight CSS. They read the nonce from **different places**,
so set both:

```ts
const gf = createGuideFlow({
  nonce: 'abc123',                  // popover, hotspot and hint styles
  spotlight: { nonce: 'abc123' },   // spotlight overlay styles
})
```

Set `injectStyles: false` to suppress the renderer's stylesheet entirely and ship
your own — the imported `@guideflow/core/styles` bundle is separate and always
under your control.

## Custom Renderer

`core` never assumes the built-in renderer. Any object implementing
`RendererContract` can be passed as `renderer`; it must be supplied to
`createGuideFlow()`, since `configure({ renderer })` is ignored.

```ts
import type { RendererContract, Step, StepContent } from '@guideflow/core'

class MyRenderer implements RendererContract {
  private el: HTMLElement | null = null
  private onAction: ((action: string) => void) | null = null

  // Required
  renderStep(step: Step, content: StepContent, index: number, total: number): void {
    this.el ??= document.body.appendChild(document.createElement('div'))
    this.el.textContent = `${content.title ?? ''} (${index + 1}/${total})`
    this.el.onclick = () => this.onAction?.('next')
  }
  hideStep(): void {
    this.el?.remove()
    this.el = null
  }
  renderHotspot(): void {}
  destroyHotspot(): void {}
  renderHint(): void {}
  destroyHints(): void {}

  // Optional
  setActionHandler(handler: (action: string) => void): void {
    this.onAction = handler
  }
}

const gf = createGuideFlow({ renderer: new MyRenderer() })
```

`renderStep` receives the **resolved** content — async `content` functions have
already been awaited. Implement the optional `setI18n(registry)` hook if you want
`gf.i18n.use(locale)` to affect your strings, and `onInit(config)` to pick up
`nonce` and `injectStyles`.
