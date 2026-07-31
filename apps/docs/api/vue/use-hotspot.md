---
description: "useHotspot() Vue composable API reference — bind a GuideFlow hotspot beacon to a template ref for @guideflow/vue."
keywords: useHotspot, Vue composable, GuideFlow hotspot, @guideflow/vue
---

# useHotspot()

Registers a persistent hotspot beacon for the lifetime of the current effect scope. The beacon
is removed when the owning component unmounts, and re-created whenever the target changes — so
navigating away never leaves an orphaned pulse on the page.

Hotspots are independent of tours: they can be shown with no flow running.

## Signature

```ts
import { useHotspot } from '@guideflow/vue'

function useHotspot(target: HotspotTarget, options?: HotspotOptions): UseHotspotReturn

type HotspotTarget = string | Readonly<Ref<Element | null | undefined>>
```

| Parameter | Type                       | Description |
|-----------|----------------------------|-------------|
| `target`  | `HotspotTarget`            | A CSS selector, or a template ref holding the element |
| `options` | `HotspotOptions`           | `title`, `body`, `placement`, `color`, `size` — see [`hotspot()`](../create-guide-flow) |

`HotspotTarget` is typed as `Readonly<Ref<…>>` on purpose: `Ref<T>` is invariant in `T`, so a
narrower template ref like `ref<HTMLButtonElement | null>(null)` would not otherwise be
assignable.

## UseHotspotReturn

| Property | Type                            | Description |
|----------|---------------------------------|-------------|
| `id`     | `Readonly<Ref<string \| null>>` | Id of the live beacon, or `null` when none is mounted |
| `remove` | `() => void`                    | Remove the beacon early. Idempotent — the scope teardown calls it too. |

`id` stays `null` during SSR, and when the target cannot be resolved (core warns and returns an
empty id rather than throwing).

## Example — template ref

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useHotspot } from '@guideflow/vue'

const exportBtn = ref<HTMLButtonElement | null>(null)

useHotspot(exportBtn, { title: 'New', body: 'Export now supports CSV.' })
</script>

<template>
  <button ref="exportBtn">Export</button>
</template>
```

## Example — selector

```vue
<script setup lang="ts">
import { useHotspot } from '@guideflow/vue'

const { id, remove } = useHotspot('#billing-tab', { title: 'Moved', placement: 'right' })
</script>

<template>
  <button v-if="id" @click="remove()">Dismiss the beacon</button>
</template>
```

## Timing

| Target form    | When the beacon attaches |
|----------------|--------------------------|
| Template ref   | On the tick after mount, via a `flush: 'post'` watcher — the element is in the document before core measures it |
| Selector       | On the next tick, so a selector pointing at the component's own template resolves |

Either way, `id.value` is `null` on the first render and populated once attached.

## Reacting to clicks

The beacon emits on the instance, not through the composable:

```ts
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()
gf.on('hotspot:open', ({ id }) => console.warn('beacon clicked', id))
```

## Requirements

Must be called inside a component tree — or an effect scope — where
[`GuideFlowPlugin`](./guide-flow-plugin) is installed.

For a hotspot whose lifetime is *not* tied to a component, use `tour.hotspot()` /
`tour.removeHotspot()` from [`useTour()`](./use-tour) instead.

## See also

- [useTour()](./use-tour) — the full tour control surface
- [Vue guide](/guide/vue)
