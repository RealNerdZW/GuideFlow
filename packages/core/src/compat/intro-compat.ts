// ---------------------------------------------------------------------------
// Intro.js Compatibility Mode
// Scans DOM for data-gf-* attributes and builds a FlowDefinition automatically
// ---------------------------------------------------------------------------

import type { FlowDefinition, GuidanceContext, Step, PopoverPlacement } from '../types/index.js'
import { isBrowser } from '../utils/ssr.js'

const ATTR_STEP = 'data-gf-step'
const ATTR_TITLE = 'data-gf-title'
const ATTR_BODY = 'data-gf-body'
const ATTR_PLACEMENT = 'data-gf-placement'
const ATTR_CONDITION = 'data-gf-show-if'

/**
 * Scan the document for elements with data-gf-step attributes and generate
 * a FlowDefinition. Steps are ordered by the numeric value of data-gf-step.
 *
 * @example
 * ```html
 * <button data-gf-step="1" data-gf-title="Save" data-gf-body="Click here to save">
 * ```
 */
export function scanAttributeTour(
  root?: Document | Element,
  flowId = 'attribute-tour',
): FlowDefinition | null {
  if (!isBrowser()) return null

  const container = root ?? document
  const elements = Array.from(container.querySelectorAll(`[${ATTR_STEP}]`))

  if (elements.length === 0) return null

  // Sort by step number
  elements.sort((a, b) => {
    const aNum = parseInt(a.getAttribute(ATTR_STEP) ?? '0', 10)
    const bNum = parseInt(b.getAttribute(ATTR_STEP) ?? '0', 10)
    return aNum - bNum
  })

  const steps: Step[] = elements.map((el, idx) => {
    const titleAttr = el.getAttribute(ATTR_TITLE)
    const bodyAttr = el.getAttribute(ATTR_BODY)
    const placement = (el.getAttribute(ATTR_PLACEMENT) ?? 'bottom') as PopoverPlacement
    const conditionAttr = el.getAttribute(ATTR_CONDITION)

    let showIf: ((ctx: GuidanceContext) => boolean) | undefined
    if (conditionAttr) {
      const path = conditionAttr.trim()
      // Validate: only allow safe dot-notation property paths (e.g. "context.userId", "featureFlags.showTour")
      if (/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(path)) {
        showIf = (ctx: GuidanceContext): boolean => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let current: any = ctx
            for (const segment of path.split('.')) {
              if (current == null) return false
              current = current[segment]
            }
            return !!current
          } catch {
            return false
          }
        }
      } else {
        console.warn(
          `[GuideFlow] Invalid data-gf-show-if expression on step ${idx + 1}: ` +
          `only dot-notation property paths are allowed (e.g. "featureFlags.showTour"). ` +
          `Received: "${path}"`,
        )
      }
    }

    return {
      id: `${flowId}-step-${idx + 1}`,
      target: el as HTMLElement,
      content: {
        ...(titleAttr !== null ? { title: titleAttr } : {}),
        body: bodyAttr ?? '',
      },
      placement,
      ...(showIf !== undefined ? { showIf } : {}),
    }
  })

  const stateSteps = steps.reduce<Record<string, { steps: Step[]; on: Record<string, string>; final?: boolean }>>(
    (acc, step, idx) => {
      const stateId = `step-${idx + 1}`
      const isLast = idx === steps.length - 1
      acc[stateId] = {
        steps: [step],
        on: isLast ? {} : { NEXT: `step-${idx + 2}` },
        ...(isLast ? { final: true } : {}),
      }
      return acc
    },
    {},
  )

  return {
    id: flowId,
    initial: 'step-1',
    states: stateSteps,
  }
}

/**
 * Watch for dynamically added attribute-tour elements using MutationObserver.
 */
export function watchAttributeTour(
  callback: (flow: FlowDefinition) => void,
  root?: Element,
): () => void {
  if (!isBrowser()) return () => { /* noop */ }

  const target = root ?? document.body
  const obs = new MutationObserver(() => {
    const flow = scanAttributeTour()
    if (flow) callback(flow)
  })
  obs.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: [ATTR_STEP] })
  return () => obs.disconnect()
}
