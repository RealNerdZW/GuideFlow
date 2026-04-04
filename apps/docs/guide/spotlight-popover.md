# Spotlight & Popover

GuideFlow's spotlight overlay draws an animated SVG cutout around the target element, directing user attention. The popover anchors to the target with smart positioning.

## Spotlight Configuration

Configure the spotlight globally when creating the instance:

```ts
const gf = createGuideFlow({
  spotlight: {
    padding: 8,          // px around the highlighted element
    borderRadius: 4,     // corner radius of the cutout
    animated: true,       // smooth transitions between targets
    overlayColor: '#000', // overlay background color
    overlayOpacity: 0.5,  // overlay opacity (0–1)
  },
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `padding` | `number` | `8` | Padding around highlighted element (px) |
| `borderRadius` | `number` | `4` | Corner radius of spotlight cutout (px) |
| `animated` | `boolean` | `true` | Animate spotlight transitions |
| `overlayColor` | `string` | `'#000'` | Overlay background color |
| `overlayOpacity` | `number` | `0.5` | Overlay opacity (0–1) |

## Click-Through

By default, the overlay blocks clicks outside the spotlight. Enable click-through per step:

```ts
{
  id: 'interactive-step',
  content: { title: 'Try clicking the button' },
  target: '#action-btn',
  clickThrough: true, // user can interact with the highlighted element
}
```

## Popover Placements

The popover automatically positions itself relative to the target. Available placements:

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
| `center` | Centered on screen (no target) |

## Auto-Scroll

By default, GuideFlow scrolls the target element into view. Disable per step:

```ts
{
  id: 'no-scroll',
  content: { title: 'Already visible' },
  target: '#visible-element',
  scrollIntoView: false,
}
```

## CSP Compliance

GuideFlow injects styles for the spotlight overlay. For Content Security Policy compliance, pass a nonce:

```ts
const gf = createGuideFlow({
  nonce: 'abc123',  // added to all injected <style> tags
})
```

## Custom Renderer

Replace the default popover with your own renderer:

```ts
const gf = createGuideFlow({
  renderer: {
    render(step, actions) {
      // Return your custom DOM element
      const el = document.createElement('div')
      el.innerHTML = `<h3>${step.content.title}</h3>`
      return el
    },
    destroy() {
      // Clean up
    },
  },
})
```
