// ---------------------------------------------------------------------------
// GuideFlow React Context & Provider
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowConfig, type GuideFlowInstance } from '@guideflow/core'
import React, { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

const GuideFlowContext = createContext<GuideFlowInstance | null>(null)

export interface TourProviderProps {
  children: ReactNode
  config?: GuideFlowConfig
  /** Provide an existing instance instead of creating one */
  instance?: GuideFlowInstance
}

/**
 * Wrap your app (or a section) with TourProvider to share a GuideFlow instance.
 *
 * @example
 * ```tsx
 * <TourProvider config={{ debug: true }}>
 *   <App />
 * </TourProvider>
 * ```
 */
export function TourProvider({ children, config, instance }: TourProviderProps): React.JSX.Element {
  const configRef = useRef(config)
  const gf = useMemo(() => {
    if (instance) return instance
    return createGuideFlow(configRef.current ?? {})
  }, [instance])

  return (
    <GuideFlowContext.Provider value={gf}>
      {children}
    </GuideFlowContext.Provider>
  )
}

/**
 * Access the nearest GuideFlow instance from context.
 * Throws if used outside a <TourProvider>.
 */
export function useGuideFlow(): GuideFlowInstance {
  const ctx = useContext(GuideFlowContext)
  if (!ctx) {
    throw new Error('[GuideFlow] useGuideFlow must be used inside a <TourProvider>')
  }
  return ctx
}

export { GuideFlowContext }
