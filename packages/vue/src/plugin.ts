// ---------------------------------------------------------------------------
// GuideFlow Vue 3 Plugin
// Provides $guideflow global and injection key
// ---------------------------------------------------------------------------

import type { App, InjectionKey } from 'vue'
import { inject } from 'vue'
import { createGuideFlow, type GuideFlowConfig, type GuideFlowInstance } from '@guideflow/core'

export const GUIDEFLOW_KEY: InjectionKey<GuideFlowInstance> = Symbol('guideflow')

export interface GuideFlowPluginOptions extends GuideFlowConfig {
  instance?: GuideFlowInstance
}

export const GuideFlowPlugin = {
  install(app: App, options: GuideFlowPluginOptions = {}): void {
    const instance = options.instance ?? createGuideFlow(options)
    app.provide(GUIDEFLOW_KEY, instance)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(app.config.globalProperties as Record<string, unknown>)['$guideflow'] = instance
  },
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
