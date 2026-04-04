# GuidePopover

Standalone popover component that can be used independently of the tour system.

## Usage

```tsx
import { GuidePopover } from '@guideflow/react'

function FeatureHighlight() {
  return (
    <GuidePopover
      target="#new-feature"
      placement="bottom"
      content={{
        title: 'New Feature!',
        body: 'Check out this new capability.',
      }}
    />
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `target` | `string \| Element` | Yes | CSS selector or DOM element to anchor to |
| `placement` | `PopoverPlacement` | No | Position relative to target (default: `'bottom'`) |
| `content` | `StepContent` | Yes | `{ title?, body?, html? }` |

## Notes

- Useful for one-off tooltips outside of a tour context
- Handles positioning and scroll tracking automatically
- Can be used without `TourProvider`
