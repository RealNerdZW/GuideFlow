// ---------------------------------------------------------------------------
// useHotspot — bind a persistent hotspot beacon to a template ref or selector
// ---------------------------------------------------------------------------

import type { HotspotOptions } from '@guideflow/core'
import { nextTick, onScopeDispose, readonly, ref, watch, type Ref } from 'vue'

import { useGuideFlow } from '../plugin.js'

/**
 * Either a CSS selector, or a template ref.
 *
 * `Readonly<Ref<…>>` rather than `Ref<…>` so that a narrower template ref —
 * `ref<HTMLButtonElement | null>(null)`, which is what `ref="el"` produces —
 * is assignable. `Ref<T>` is invariant in `T`; the readonly view is not.
 */
export type HotspotTarget = string | Readonly<Ref<Element | null | undefined>>

export interface UseHotspotReturn {
  /** Id of the live hotspot, or `null` when none is mounted. */
  id: Readonly<Ref<string | null>>
  /** Remove the hotspot early. Idempotent; the scope teardown calls it too. */
  remove: () => void
}

/**
 * Register a GuideFlow hotspot for the lifetime of the current effect scope.
 *
 * The hotspot is removed when the owning component unmounts (or the enclosing
 * `effectScope()` is stopped), and re-created whenever the target ref changes.
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref } from 'vue'
 * import { useHotspot } from '@guideflow/vue'
 *
 * const exportBtn = ref(null)
 * useHotspot(exportBtn, { title: 'New', body: 'Export is new!' })
 * </script>
 * <template><button ref="exportBtn">Export</button></template>
 * ```
 */
export function useHotspot(target: HotspotTarget, options?: HotspotOptions): UseHotspotReturn {
  const gf = useGuideFlow()

  const id = ref<string | null>(null)
  // Mirrored in a plain local so `attach()` never *reads* the ref it writes —
  // inside a watcher that would register a self-dependency and loop.
  let activeId: string | null = null
  let disposed = false

  const remove = (): void => {
    if (activeId === null) return
    gf.removeHotspot(activeId)
    activeId = null
    id.value = null
  }

  const attach = (el: string | Element | null | undefined): void => {
    remove()
    if (el === null || el === undefined || disposed) return
    // core returns '' during SSR and when the target cannot be resolved.
    const created = options !== undefined ? gf.hotspot(el, options) : gf.hotspot(el)
    if (created === '') return
    activeId = created
    id.value = created
  }

  if (typeof target === 'string') {
    // Defer a tick: a selector usually points at this component's own template,
    // which has not been rendered yet during setup().
    void nextTick(() => attach(target))
  } else {
    // `immediate` fires synchronously in setup() while a template ref is still
    // null — a no-op — then again with the element once it is mounted.
    // `flush: 'post'` so the beacon is positioned against a target that is
    // already in the DOM; the attach therefore lands on the tick after mount.
    const stop = watch(target, (el) => attach(el), { immediate: true, flush: 'post' })
    onScopeDispose(stop)
  }

  onScopeDispose(() => {
    disposed = true
    remove()
  })

  return { id: readonly(id), remove }
}
