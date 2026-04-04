# createGuideFlow()

Creates and returns a `GuideFlowInstance` — the main entry point for all GuideFlow functionality.

## Signature

```ts
function createGuideFlow(config?: GuideFlowConfig): GuideFlowInstance
```

## GuideFlowConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `renderer` | `RendererContract` | `DefaultRenderer` | Custom step renderer |
| `persistence` | `PersistenceConfig` | `undefined` | Progress persistence settings |
| `context` | `GuidanceContext` | `{}` | Shared context passed to steps and guards |
| `spotlight` | `SpotlightOptions` | `{}` | Spotlight overlay options |
| `nonce` | `string` | `undefined` | CSP nonce for injected `<style>` tags |
| `injectStyles` | `boolean` | `true` | Auto-inject default CSS |
| `debug` | `boolean` | `false` | Enable debug logging |

## GuideFlowInstance

The returned instance provides:

### Tour Methods

| Method | Description |
|--------|-------------|
| `start(flow)` | Start a tour from a flow definition |
| `stop()` | Stop the current tour |
| `next()` | Advance to the next step |
| `prev()` | Go to the previous step |
| `createFlow(def)` | Create a reusable flow definition |

### Hotspots & Hints

| Method | Description |
|--------|-------------|
| `hotspot(target, options)` | Add a pulsing beacon. Returns an ID. |
| `removeHotspot(id)` | Remove a hotspot by ID |
| `hints(items)` | Register hint badges |
| `showHints()` | Show all registered hints |
| `hideHints()` | Hide all hints |

### Events

| Method | Description |
|--------|-------------|
| `on(event, handler)` | Subscribe to an event. Returns unsubscribe function. |
| `off(event, handler)` | Unsubscribe from an event |

### Other

| Property | Description |
|----------|-------------|
| `i18n` | `I18nRegistry` instance |
| `ai` | AI module (if `@guideflow/ai` is configured) |

## Example

```ts
import { createGuideFlow } from '@guideflow/core'

const gf = createGuideFlow({
  spotlight: { padding: 10, animated: true },
  persistence: { driver: 'localStorage' },
  context: { userId: 'u1', roles: ['admin'] },
})
```
