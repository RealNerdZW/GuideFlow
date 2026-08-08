/**
 * `advanceOn` — advance a tour when the user actually does the thing.
 *
 * ADR-004 spent ~1.3 kB carving a real `clip-path` hole in the overlay so a
 * `clickThrough` step lets the user click the control it is highlighting. And
 * then nothing happened: the engine attaches exactly one listener,
 * `document.addEventListener('keydown', ...)` in `engine/tour.ts`, and nothing
 * at all on the target. The user clicked, the app responded, and the step sat
 * there waiting for **Next**. This is the missing half.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { advanceOn } from '@guideflow/core/navigation'
 *
 * const gf = createGuideFlow()
 * const stop = advanceOn(gf, {
 *   save: 'click',
 *   name: { event: 'input', when: (e) => (e.target as HTMLInputElement).value.length > 2 },
 *   plan: { event: 'change', action: 'CHOSE_PLAN' },
 * })
 * ```
 *
 * It lives on this subpath rather than in the size-gated core entry: the entry
 * has ~300 B of headroom that content variables and content i18n are already
 * competing for, and a helper hung off `step:enter` needs no engine change at
 * all. A declarative `Step.advanceOn` is the better authoring story and the only
 * form a `.flow.json` can carry — take it later, with an ADR, once this has
 * demand.
 *
 * **Always additive.** Next always still works, and a rule that can never fire
 * degrades to "the user presses Next" rather than to a stuck tour.
 */
import type { Step, TourEvents } from '../types/index.js'

/** What `advanceOn` reads off `host.currentStep`. */
type CurrentStep = Pick<Step, 'id' | 'clickThrough'> & { target?: unknown }

/**
 * The slice of a GuideFlow instance this helper uses.
 *
 * Structural rather than `GuideFlowInstance<TContext>`: `Step<T>` is
 * contravariant in `T` (`showIf` and the function `target` form both consume
 * it), so naming the full instance type would reject every instance carrying a
 * custom context and push callers into the `as unknown as` cast `index.ts`
 * already has to carry once.
 *
 * Pass the `createGuideFlow()` instance, not a bare `TourEngine`: `next` and
 * `send` on the instance are the `Object.assign` wrappers that also persist
 * progress. The prototype methods they shadow do not.
 */
export interface AdvanceOnHost {
  on: <K extends keyof TourEvents>(event: K, listener: (payload: TourEvents[K]) => void) => () => void
  next: () => unknown
  send: (event: string) => unknown
  readonly currentStep: CurrentStep | null
  readonly isActive: boolean
  readonly isPaused: boolean
}

export interface AdvanceOnRule {
  /**
   * DOM event name(s), listened for in the **capture** phase. Default `'click'`.
   *
   * Capture rather than bubble for two measured reasons: an app handler calling
   * `stopPropagation()` would otherwise silently kill the rule with no error
   * anywhere, and non-bubbling events (`focus`, `blur`) never reach a bubble
   * listener at all.
   */
  event?: string | readonly string[]
  /**
   * What counts as a hit, as a CSS selector matched with `closest()`.
   *
   * Defaults to the step's own `target` when that is a string. Supply it to
   * scope to a control *inside* the highlighted element (a row in a spotlit
   * table), or to one somewhere else entirely.
   *
   * For an `Element` or function target with no `selector`, the element
   * resolved at `step:enter` is matched by containment — which cannot survive
   * the host replacing that node, so pass a selector if it re-renders.
   */
  selector?: string
  /**
   * Final say. Return `false` to ignore this event and stay armed.
   *
   * This is what makes `event: 'input'` usable: advancing on the first
   * keystroke yanks the popover away mid-word.
   *
   * A throw means "not a match", never a crash — the same doctrine as a
   * targeting audience predicate, and deliberately unlike `Step.showIf`. One
   * bad rule must not take down the tour it is attached to.
   */
  when?: (event: Event, element: Element) => boolean
  /**
   * Wait this long after the match before advancing, ms. Default 0.
   *
   * Set 300–600 when the user's action produces something they should see land.
   * Without it the popover moves in the same frame as the click and the toast
   * the user just caused is never read.
   */
  delay?: number
  /**
   * `'next'` (the default) calls `host.next()`; any other string is dispatched
   * through `host.send()`, so a branching state can route on it.
   *
   * There is deliberately no `'end'` or `'skip'`. `end` maps to `stop()`, which
   * emits `tour:abandon` — only `next()` past the last step takes the completed
   * path that emits `tour:complete` and clears the saved snapshot. Wiring a
   * final step to `end` would file every "the user finished by doing the thing"
   * as an abandonment in `@guideflow/analytics`.
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- intentional: keeps autocomplete for the built-in while accepting any FSM event name
  action?: 'next' | (string & Record<never, never>)
}

/** A bare string is shorthand for `{ event: name }`. */
export type AdvanceOnSpec = string | AdvanceOnRule

/**
 * Event names that need the overlay's `clip-path` hole to reach the target.
 *
 * A prefix test rather than a set of every pointer event: `pointerdown`,
 * `mouseup` and friends all match, and it is smaller than enumerating them
 * against this subpath's size gate.
 */
const needsClickThrough = (name: string): boolean =>
  name === 'click' || name === 'submit' || name.startsWith('mouse') || name.startsWith('pointer')

/** Warned-about step ids, so a re-render cannot produce a wall of warnings. */
const warned = new Set<string>()

/**
 * Advance the tour when the user interacts with the page.
 *
 * Keys are step ids. Only the steps named get a listener, and at most one set
 * of listeners exists at any moment.
 *
 * **The step needs `clickThrough: true`.** Without it the overlay is
 * `pointer-events: all` across the viewport, so the click never reaches the
 * target — it hits the overlay, whose own handler calls `skip()`. The user's
 * first attempt to follow the instruction *destroys* the tour. A pointer rule
 * armed on a step without it warns once, because that is not a failure anyone
 * would diagnose from the symptom.
 *
 * **Keyboard users cannot reach the target today.** The renderer traps focus
 * inside the popover and sets `aria-modal="true"` on every step, including
 * `clickThrough` ones, so Tab never leaves the dialog. A `click` rule therefore
 * works for a mouse and not for a keyboard, and the accessible integration is
 * for the app to dispatch its own event — `document.dispatchEvent(new
 * CustomEvent('app:saved'))` — and match on that, which fires whatever the
 * input modality. Widening the trap for `clickThrough` steps is a renderer
 * change tracked separately; until it lands, prefer the custom-event form for
 * anything that must be accessible.
 *
 * @returns an idempotent teardown. Safe to call after `gf.destroy()`.
 */
export function advanceOn(
  host: AdvanceOnHost,
  rules: Readonly<Record<string, AdvanceOnSpec>>,
): () => void {
  /** Removes the live DOM listeners and cancels a pending delayed advance. */
  let detach: (() => void) | null = null

  const teardown = (): void => {
    detach?.()
    detach = null
  }

  const arm = ({ stepId, target }: TourEvents['step:enter']): void => {
    // FIRST, unconditionally. `step:enter` can fire twice for the same step
    // with no `step:exit` between: `resume()` re-runs `_renderCurrentStep()`,
    // and so does `rerender()`, which the navigation adapter calls on every
    // route change. Arming without releasing strands the previous listeners and
    // one click then advances two steps.
    teardown()

    const spec = rules[stepId]
    if (spec === undefined) return
    const rule: AdvanceOnRule = typeof spec === 'string' ? { event: spec } : spec

    // Safe to read: `_currentStep` is assigned immediately before `step:enter`
    // is emitted, with no `await` in between.
    const step = host.currentStep
    const selector =
      rule.selector ?? (typeof step?.target === 'string' ? step.target : undefined)
    if (selector === undefined && target === null) return

    const events = typeof rule.event === 'string'
      ? [rule.event]
      : (rule.event ?? ['click'])

    if (
      step?.clickThrough !== true &&
      !warned.has(stepId) &&
      events.some(needsClickThrough)
    ) {
      warned.add(stepId)
      console.warn(
        `[GuideFlow] advanceOn("${stepId}") wants a pointer event but the step has no ` +
        `clickThrough: true — so the click lands on the overlay and DISMISSES the tour ` +
        `instead of advancing it.`,
      )
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let fired = false

    const go = (): void => {
      // The step may have moved during `delay` — the user pressed Next, a route
      // re-anchored, or the tour ended. This is the engine's `_renderGeneration`
      // discipline expressed at this layer.
      if (!host.isActive || host.isPaused || host.currentStep?.id !== stepId) return
      const action = rule.action ?? 'next'
      if (action === 'next') void host.next()
      else void host.send(action)
    }

    const onEvent = (e: Event): void => {
      if (fired || !host.isActive || host.isPaused) return
      const from = e.target
      if (!(from instanceof Element)) return

      const hit = selector !== undefined
        ? from.closest(selector)
        : (target !== null && target.contains(from) ? target : null)
      // A detached node is not a null node — a script can dispatch to one, and
      // advancing off an element that left the document is exactly the trap the
      // spotlight's own `isConnected` branch exists for.
      if (hit === null || !hit.isConnected) return

      if (rule.when !== undefined) {
        try {
          if (!rule.when(e, hit)) return
        } catch {
          return
        }
      }

      // One-shot, synchronously, BEFORE any advance. `next()` moves the machine
      // before its first `await`, so two events in one frame would skip two
      // steps. Note `detach` stays installed so a later teardown still clears
      // the pending timer.
      fired = true
      remove()
      timer = setTimeout(go, rule.delay ?? 0)
    }

    const root = document
    const remove = (): void => {
      for (const name of events) root.removeEventListener(name, onEvent, true)
    }
    for (const name of events) root.addEventListener(name, onEvent, true)

    detach = (): void => {
      remove()
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  }

  const offs = [
    host.on('step:enter', arm),
    // The payload is deliberately ignored: `send()`, `goTo()` and `prev()` move
    // the machine before emitting, so its `stepId` names the step being
    // *entered*, not the one being left. Matching on it would inherit that.
    host.on('step:exit', teardown),
    // `step:exit` is NOT a superset of the terminal paths, which is the obvious
    // and wrong assumption here. `send()` moves the machine first and only then
    // calls `_emitStepExit()`, which reads the machine's *current* step — and
    // for an ordinary `done: { final: true }` state carrying no steps that is
    // null, so the emit is skipped while the once-only flag is still set. The
    // tour completes having never emitted `step:exit`, and a helper subscribed
    // only to it keeps its listener for the life of the page.
    host.on('tour:complete', teardown),
    host.on('tour:abandon', teardown),
    // `pause()` does NOT emit `step:exit`. It hides the spotlight — which sets
    // `pointer-events: none` on the overlay, making the WHOLE page clickable —
    // and emits only `tour:pause`. Without this a paused tour advances on the
    // user's next click on a control it has stopped highlighting. There is no
    // `tour:resume` subscription because `resume()` re-renders, which re-emits
    // `step:enter` and re-arms through the normal path.
    host.on('tour:pause', teardown),
    // The spotlight also drops while waiting for a route or a target, on
    // purpose, so the page stays clickable there too.
    host.on('step:waiting', teardown),
  ]

  return (): void => {
    for (const off of offs) off()
    teardown()
  }
}
