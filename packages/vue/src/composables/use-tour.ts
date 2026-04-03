// ---------------------------------------------------------------------------
// useTour — Vue 3 composable for controlling a GuideFlow tour
// ---------------------------------------------------------------------------

import { ref, readonly, onUnmounted, type Ref } from 'vue'
import { useGuideFlow } from '../plugin.js'
import type { FlowDefinition, GuidanceContext } from '@guideflow/core'

export interface UseTourReturn {
  isActive: Readonly<Ref<boolean>>
  currentStepId: Readonly<Ref<string | null>>
  currentStepIndex: Readonly<Ref<number>>
  totalSteps: Readonly<Ref<number>>
  start: (flow?: FlowDefinition | string, context?: GuidanceContext) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (stepId: string) => Promise<void>
  send: (event: string) => Promise<void>
  stop: () => void
}

/**
 * Vue composable for tour control.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useTour } from '@guideflow/vue'
 * const tour = useTour()
 * </script>
 * <template>
 *   <button @click="tour.start(myFlow)">Start Tour</button>
 * </template>
 * ```
 */
export function useTour(flowId?: string): UseTourReturn {
  const gf = useGuideFlow()

  const isActive = ref(gf.isActive)
  const currentStepId = ref(gf.currentStepId)
  const currentStepIndex = ref(gf.currentStepIndex)
  const totalSteps = ref(gf.totalSteps)

  const syncState = (): void => {
    isActive.value = gf.isActive
    currentStepId.value = gf.currentStepId
    currentStepIndex.value = gf.currentStepIndex
    totalSteps.value = gf.totalSteps
  }

  const cleanups: Array<() => void> = []
  cleanups.push(gf.on('tour:start', syncState))
  cleanups.push(gf.on('tour:complete', syncState))
  cleanups.push(gf.on('tour:abandon', syncState))
  cleanups.push(gf.on('step:enter', syncState))
  cleanups.push(gf.on('step:exit', syncState))

  onUnmounted(() => {
    cleanups.forEach((fn) => fn())
  })

  return {
    isActive: readonly(isActive),
    currentStepId: readonly(currentStepId),
    currentStepIndex: readonly(currentStepIndex),
    totalSteps: readonly(totalSteps),

    start: async (flow?: FlowDefinition | string, context?: GuidanceContext): Promise<void> => {
      const target = flow ?? flowId
      if (!target) return
      await gf.start(target, context)
    },

    next: () => gf.next(),
    prev: () => gf.prev(),
    goTo: (id: string) => gf.goTo(id),
    send: (event: string) => gf.send(event),
    stop: () => gf.stop(),
  }
}
