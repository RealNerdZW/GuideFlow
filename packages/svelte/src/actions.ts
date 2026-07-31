// ---------------------------------------------------------------------------
// Svelte actions — `use:` directives over the standalone core UI
// ---------------------------------------------------------------------------

import type { GuideFlowInstance, HotspotOptions } from '@guideflow/core'

/**
 * The shape Svelte expects back from a `use:` directive.
 *
 * Declared locally rather than imported from `svelte/action` so the package
 * carries no type dependency on a specific Svelte major — this is structurally
 * compatible with `Action<Element, HotspotOptions | undefined>` in both 4 and 5.
 */
export interface HotspotActionResult {
  update: (options?: HotspotOptions) => void
  destroy: () => void
}

export type HotspotAction = (node: Element, options?: HotspotOptions) => HotspotActionResult

/**
 * Build a `use:` action that attaches a persistent hotspot beacon to whatever
 * element it is applied to, and removes it when that element is destroyed.
 *
 * This is the Svelte counterpart to `@guideflow/vue`'s `useHotspot()`: the
 * lifetime of the hotspot follows the lifetime of the node, so nothing leaks
 * when a component unmounts.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTourStore, hotspotAction } from '@guideflow/svelte'
 *
 *   const tour = createTourStore()
 *   const hotspot = hotspotAction(tour.instance)
 * </script>
 *
 * <button use:hotspot={{ title: 'New', body: 'Export is new!' }}>Export</button>
 * ```
 */
export function hotspotAction(gf: GuideFlowInstance): HotspotAction {
  return (node: Element, options?: HotspotOptions): HotspotActionResult => {
    // core returns '' during SSR and when the target cannot be resolved.
    let id = options !== undefined ? gf.hotspot(node, options) : gf.hotspot(node)

    const remove = (): void => {
      if (id === '') return
      gf.removeHotspot(id)
      id = ''
    }

    return {
      update: (next?: HotspotOptions): void => {
        remove()
        id = next !== undefined ? gf.hotspot(node, next) : gf.hotspot(node)
      },
      destroy: remove,
    }
  }
}
