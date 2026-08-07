/**
 * `?gf_tour=` — a link that starts a named tour in the app the recipient
 * already has.
 *
 * This is the only part of the demo-automation distribution layer that
 * transfers to an embedded library, and it is the cheap half: the whole problem
 * of "how does the viewer get to the product" disappears when the audience is
 * already inside it. A support agent pastes a link into a reply; the customer
 * opens it and lands in their own application with the guide running. No clone,
 * no hosting, no share page.
 *
 * It also makes the Zendesk / Intercom / GitBook / Mintlify integration row
 * real without writing a single integration — they all accept a URL.
 */
import type { FlowDefinition, GuidanceContext } from '../types/index.js'

import { matchAudience, matchSchedule } from './rules.js'

/** The slice of a GuideFlow instance this needs. */
export interface DeepLinkHost<TContext extends GuidanceContext = GuidanceContext> {
  listFlows: () => FlowDefinition<TContext>[]
  start: (
    flow: FlowDefinition<TContext>,
    context?: TContext,
    options?: { force?: boolean },
  ) => Promise<void>
  goTo: (stepId: string) => Promise<void>
  readonly isActive: boolean
  readonly context: TContext
}

export interface DeepLinkOptions {
  /**
   * Query parameter naming the flow. Default `'gf_tour'`.
   *
   * The step parameter is always `<param>_step`, so renaming this renames both
   * and there is no second knob to keep in sync.
   */
  param?: string
  /**
   * Remove the parameters from the address bar once the tour has started.
   * Default `true`.
   *
   * Without it a refresh restarts the tour, and the URL the user goes on to
   * bookmark or share carries the link with it. Uses `replaceState`, so it adds
   * no history entry and the back button still does what the user expects.
   */
  strip?: boolean
}

/**
 * Start the flow named by the current URL, if there is one.
 *
 * Resolves to the flow it started, or `null` — no flow named, the id is not
 * registered, the flow has not opted in with `targeting.deepLink`, its
 * `audience` or `schedule` excludes this user, or a tour is already running.
 *
 * ```ts
 * import { startFromUrl } from '@guideflow/core/targeting'
 *
 * await startFromUrl(gf)   // ?gf_tour=billing-setup&gf_tour_step=add-card
 * ```
 *
 * `createTargeting().install()` calls this for you, before its `load` trigger —
 * an explicit link beats a tour that would have auto-started anyway.
 */
export async function startFromUrl<TContext extends GuidanceContext = GuidanceContext>(
  gf: DeepLinkHost<TContext>,
  options: DeepLinkOptions = {},
): Promise<FlowDefinition<TContext> | null> {
  if (typeof window === 'undefined' || gf.isActive) return null

  const param = options.param ?? 'gf_tour'
  const url = new URL(window.location.href)
  const flowId = url.searchParams.get(param)
  if (flowId === null || flowId === '') return null

  const flow = gf.listFlows().find((f) => f.id === flowId)
  // Not registered, or registered and not marked linkable. Both are a silent
  // null rather than a warning: a `gf_tour` param is attacker-supplied, and
  // logging it back would be a small reflected-content surface for no benefit.
  if (!flow || flow.targeting?.deepLink !== true) return null

  // A link may override DELIVERY policy but never ELIGIBILITY policy.
  //
  // `frequency` and `urlPattern` say how often and where we would have *pushed*
  // this tour; someone who clicked a link has overridden that on purpose, and
  // so has the agent who sent it. `audience` and `schedule` say who the tour is
  // *for* — an author who wrote `audience: { where: { plan: 'enterprise' } }`
  // meant "not this user", and a URL does not get to overrule them.
  const t = flow.targeting
  if (t.audience !== undefined && !matchAudience(t.audience, gf.context)) return null
  if (t.schedule !== undefined && !matchSchedule(t.schedule, Date.now())) return null

  const stepParam = `${param}_step`
  const stepId = url.searchParams.get(stepParam)

  // `force`, not `progress.clearCompleted()`. The user asked for this tour by
  // clicking a link, so it must start even if they finished or dismissed it —
  // both of `start()`'s gates return with no render and no event, which is
  // exactly the "the link you sent me does nothing" report. But clearing the
  // record to get past them would ALSO un-tick `@guideflow/checklist`, which
  // projects `getCompletedFlows()`. A URL must not destroy progress the user
  // earned. `force` writes nothing.
  await gf.start(flow, undefined, { force: true })

  // A step id that names nothing is a no-op inside `goTo`, so a stale link
  // degrades to "the tour opened at the beginning" rather than to nothing.
  if (stepId !== null && stepId !== '') await gf.goTo(stepId)

  // Strip AFTER the start resolves, not before. `replaceState` is patched by
  // `watchHistory` whenever targeting is installed, so it notifies a route
  // change — and stripping first would fire that while no tour was running yet,
  // letting `autoStart('load')` win the race and open a different tour.
  //
  // Leaving the parameter is not an option: `matchUrl` anchors its patterns, so
  // a full-href `urlPattern` can never match a URL carrying `?gf_tour=…`, and
  // every such targeting rule would stay silently dead for the rest of the
  // session.
  if (options.strip !== false) {
    url.searchParams.delete(param)
    url.searchParams.delete(stepParam)
    window.history.replaceState(window.history.state, '', url.href)
  }

  return flow
}
