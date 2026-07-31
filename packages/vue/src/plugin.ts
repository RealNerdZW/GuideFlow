// ---------------------------------------------------------------------------
// GuideFlow Vue 3 Plugin
// Provides $guideflow global and injection key
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowConfig, type GuideFlowInstance } from '@guideflow/core'
import type { App, InjectionKey } from 'vue'
import { inject } from 'vue'

export const GUIDEFLOW_KEY: InjectionKey<GuideFlowInstance> = Symbol('guideflow')

export interface GuideFlowPluginOptions extends GuideFlowConfig {
  instance?: GuideFlowInstance
}

export const GuideFlowPlugin = {
  install(app: App, options: GuideFlowPluginOptions = {}): void {
    const instance = options.instance ?? createGuideFlow(options)
    app.provide(GUIDEFLOW_KEY, instance)
    app.config.globalProperties.$guideflow = instance
  },
}

/**
 * Type `this.$guideflow` for Options API components.
 *
 * Without this augmentation the plugin set a global property that TypeScript
 * knew nothing about, so `this.$guideflow.start(...)` was a compile error and
 * the documented Options API usage did not type-check — AUDIT
 * `vue-guideflow-global-untyped`. Declaring it here means every consumer that
 * imports anything from `@guideflow/vue` picks the type up automatically.
 */
declare module 'vue' {
  interface ComponentCustomProperties {
    $guideflow: GuideFlowInstance
  }
}

/**
 * Access the GuideFlow instance injected by the plugin.
 * Throws if called outside a component tree where the plugin is installed.
 */
export function useGuideFlow(): GuideFlowInstance {
  const gf = inject(GUIDEFLOW_KEY)
  if (!gf) {
    throw new Error('[GuideFlow] useGuideFlow() called outside plugin scope. Install the GuideFlowPlugin.')
  }
  return gf
}
