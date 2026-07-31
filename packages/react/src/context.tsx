'use client'

// ---------------------------------------------------------------------------
// GuideFlow React Context & Provider
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowConfig, type GuideFlowInstance } from '@guideflow/core'
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { warnOnce } from './internal/dev.js'
import { createHeadlessRenderer, type HeadlessRenderer } from './renderer/headless-renderer.js'

/**
 * Which layer draws the popover.
 *
 * - `'core'` (default) — core's `DefaultRenderer` builds and positions the
 *   popover DOM itself. `<GuidePopover>` renders nothing in this mode.
 * - `'react'` — the provider hands core a {@link HeadlessRenderer}, so nothing
 *   is drawn until you mount `<GuidePopover>` (or your own component reading
 *   `useTourRenderer()`). **Mount one, or the tour runs invisibly** — the
 *   spotlight still appears, but there is no popover.
 */
export type TourRendererMode = 'core' | 'react'

export interface TourContextValue {
  /** The instance every hook and component reads. */
  instance: GuideFlowInstance
  /** The headless renderer in `renderer="react"` mode; `null` in `'core'` mode. */
  renderer: HeadlessRenderer | null
}

const GuideFlowContext = createContext<TourContextValue | null>(null)

export interface TourProviderProps {
  children: ReactNode
  config?: GuideFlowConfig
  /** Provide an existing instance instead of creating one. The caller keeps ownership. */
  instance?: GuideFlowInstance
  /**
   * Selects who draws the popover — see {@link TourRendererMode}. Defaults to
   * `'core'`, which is the behaviour every existing app already gets.
   *
   * A renderer can only be chosen when the instance is *created*, so if you
   * also pass `instance`, build it with your own headless renderer and pass
   * that same object here.
   */
  renderer?: TourRendererMode | HeadlessRenderer
}

/**
 * Wrap your app (or a section) with TourProvider to share a GuideFlow instance.
 *
 * An instance the provider creates from `config` is **destroyed on unmount**;
 * one you pass as `instance` is left alone, because you own it.
 *
 * @example
 * ```tsx
 * // core draws the popover (default)
 * <TourProvider config={{ debug: true }}>
 *   <App />
 * </TourProvider>
 * ```
 *
 * @example
 * ```tsx
 * // React draws the popover — <GuidePopover> is required
 * <TourProvider renderer="react">
 *   <App />
 *   <GuidePopover />
 * </TourProvider>
 * ```
 */
export function TourProvider({
  children,
  config,
  instance,
  renderer = 'core',
}: TourProviderProps): React.JSX.Element {
  // `config` is read once, on first render — documented, and unchanged.
  const configRef = useRef(config)
  const ownedRef = useRef<TourContextValue | null>(null)
  // Bumped when an owned instance is destroyed, so a StrictMode remount (or any
  // remount) rebuilds one instead of handing out a dead instance.
  const [generation, setGeneration] = useState(0)

  const suppliedRenderer = typeof renderer === 'object' ? renderer : null
  const wantsReactRenderer = renderer === 'react' || suppliedRenderer !== null

  const value = useMemo<TourContextValue>(() => {
    if (instance) {
      if (renderer === 'react') {
        // We cannot swap a renderer after construction: createGuideFlow() wires
        // the action handler and i18n registry into it at factory time, and
        // configure({ renderer }) is explicitly ignored by core. Say so rather
        // than quietly rendering two popovers or none.
        warnOnce(
          'provider-react-renderer-with-instance',
          '[GuideFlow] <TourProvider renderer="react"> is ignored when you also pass `instance`: ' +
            'a renderer can only be set when the instance is created. Build it with ' +
            '`createGuideFlow({ renderer: createHeadlessRenderer() })` and pass that same renderer ' +
            'object to <TourProvider renderer={...}>. Falling back to core\'s renderer — ' +
            '<GuidePopover> will render nothing.',
        )
      }
      return { instance, renderer: suppliedRenderer }
    }

    if (!ownedRef.current) {
      const base = configRef.current ?? {}
      const headless = wantsReactRenderer ? suppliedRenderer ?? createHeadlessRenderer() : null
      if (headless !== null && base.renderer !== undefined) {
        warnOnce(
          'provider-renderer-prop-overrides-config',
          '[GuideFlow] <TourProvider> received both `config.renderer` and renderer="react". ' +
            'The React headless renderer wins; drop one of the two.',
        )
      }
      const created = createGuideFlow(headless !== null ? { ...base, renderer: headless } : base)
      ownedRef.current = { instance: created, renderer: headless }
    }
    return ownedRef.current
  }, [instance, renderer, suppliedRenderer, wantsReactRenderer, generation])

  useEffect(() => {
    // A caller-supplied instance is the caller's to destroy.
    if (instance) return undefined

    const owned = ownedRef.current
    if (owned === null) return undefined

    return () => {
      // Under StrictMode React runs setup → cleanup → setup on mount. The first
      // cleanup destroys the instance and clears the ref; the re-render that
      // `setGeneration` schedules builds a fresh one. This guard stops the
      // second cleanup — which still closes over the *old* value — from
      // destroying that replacement.
      if (ownedRef.current !== owned) return
      owned.instance.destroy()
      ownedRef.current = null
      // A no-op after a real unmount (React 18 ignores it); the remount path
      // needs it to rebuild.
      setGeneration((g) => g + 1)
    }
  }, [instance, value])

  return (
    <GuideFlowContext.Provider value={value}>
      {children}
    </GuideFlowContext.Provider>
  )
}

/**
 * Access the provider's instance *and* its renderer.
 * Throws if used outside a `<TourProvider>`.
 */
export function useTourContext(): TourContextValue {
  const ctx = useContext(GuideFlowContext)
  if (!ctx) {
    throw new Error('[GuideFlow] useGuideFlow must be used inside a <TourProvider>')
  }
  return ctx
}

/**
 * Access the nearest GuideFlow instance from context.
 * Throws if used outside a `<TourProvider>`.
 */
export function useGuideFlow(): GuideFlowInstance {
  return useTourContext().instance
}

/**
 * The headless renderer backing this provider, or `null` when core owns the
 * popover. Use it to build your own popover component:
 *
 * @example
 * ```tsx
 * const renderer = useTourRenderer()
 * const state = useSyncExternalStore(
 *   renderer?.subscribe ?? noopSubscribe,
 *   renderer?.getSnapshot ?? (() => null),
 *   () => null,
 * )
 * ```
 */
export function useTourRenderer(): HeadlessRenderer | null {
  return useTourContext().renderer
}

export { GuideFlowContext }
