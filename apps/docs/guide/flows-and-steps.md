# Flows & Steps

A **flow** is a state machine that defines your tour. Each state contains an array of **steps** — the individual tooltips, spotlights, and actions your users see.

## Flow Definition

```ts
const flow = gf.createFlow({
  id: 'onboarding',
  initial: 'setup',
  context: { completedSteps: 0 },
  states: {
    setup: {
      steps: [
        { id: 'profile', content: { title: 'Set up your profile' }, target: '#profile-form' },
        { id: 'avatar', content: { title: 'Add a photo' }, target: '#avatar-upload' },
      ],
      on: { NEXT: 'features' },
      onExit: (ctx) => { ctx.completedSteps++ },
    },
    features: {
      steps: [
        { id: 'dashboard', content: { title: 'Your dashboard' }, target: '#dashboard' },
      ],
      final: true,
    },
  },
})
```

## Step Configuration

Each step describes a single tooltip or action in the tour.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique step identifier |
| `target` | `string \| Element \| null` | CSS selector or DOM element to anchor to |
| `content` | `StepContent \| () => StepContent` | Title, body, or raw HTML |
| `placement` | `PopoverPlacement` | Tooltip position relative to target |
| `showIf` | `(ctx) => boolean` | Conditionally skip this step |
| `clickThrough` | `boolean` | Allow clicks to pass through the spotlight |
| `scrollIntoView` | `boolean` | Auto-scroll target into view (default `true`) |
| `actions` | `StepAction[]` | Override default next/prev/skip buttons |

## StepContent

```ts
interface StepContent {
  title?: string
  body?: string
  html?: string  // raw HTML (use with caution)
}
```

Content can also be a function (sync or async) that returns `StepContent`, enabling dynamic content:

```ts
{
  id: 'user-greeting',
  content: async () => ({
    title: `Welcome back, ${await fetchUserName()}!`,
    body: 'Let\'s pick up where you left off.',
  }),
  target: '#header',
}
```

## Placements

Available `PopoverPlacement` values:

`top` `top-start` `top-end` `bottom` `bottom-start` `bottom-end` `left` `left-start` `left-end` `right` `right-start` `right-end` `center`

## Conditional Steps

Use `showIf` to conditionally include or skip steps based on context:

```ts
{
  id: 'admin-panel',
  content: { title: 'Admin Settings' },
  target: '#admin',
  showIf: (ctx) => ctx.roles?.includes('admin') ?? false,
}
```

## Custom Actions

Override the default navigation buttons:

```ts
{
  id: 'feedback',
  content: { title: 'How was the tour?' },
  target: '#feedback',
  actions: [
    { label: 'Great!', action: 'end' },
    { label: 'Show me more', action: 'next' },
    { label: 'Skip', action: 'skip' },
  ],
}
```
