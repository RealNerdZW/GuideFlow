// ---------------------------------------------------------------------------
// Public types.
//
// A banner is a docked, non-blocking announcement. It exists to close the four
// limits `apps/docs/guide/announcements.md` records against the `target: null`
// modal announcement — the overlay blocks the page, only one can be up at a
// time, dismissal lands in the tour funnel as `tour:dismiss` + `tour:abandon`,
// and the × / Skip chrome needs a custom renderer to remove. Nothing else.
//
// ONE is visible at a time, chosen by DERIVATION rather than pushed: the
// controller holds every definition and exposes the highest-priority eligible
// undismissed one. That mirrors `createTargeting().autoStart()` and the
// checklist's projection discipline — the visible banner is a function of
// state, never an imperative queue a caller mutates.
//
// See ADR-017.
// ---------------------------------------------------------------------------

import type { AudienceRule, FlowSchedule, GuidanceContext, GuideFlowInstance } from '@guideflow/core'
import type { BlockReason } from '@guideflow/core/targeting'

// ── Definition (input) ─────────────────────────────────────────────────────

/**
 * Visual weight. Deliberately no `'error'`.
 *
 * An error tone is the thing that makes `role="alert"` look like the obvious
 * next commit, and `role="alert"` is assertive — it would cut a running tour's
 * step announcement in half. Tone is a colour, never a politeness level.
 */
export type BannerTone = 'neutral' | 'info' | 'success' | 'warning'

export interface BannerAction {
  label: string
  /** Visual weight only. Both are buttons; neither closes the banner by itself. */
  variant?: 'primary' | 'secondary'
  /** Start this flow. Ignored when `onSelect` is set. */
  flowId?: string
  /** Runs instead of `flowId` when both are set. */
  onSelect?: () => void | Promise<void>
  /**
   * Record a dismissal when this action is taken. Default `false`.
   *
   * One field, one default, whatever the sibling fields say — an action whose
   * behaviour depended on which of `flowId` / `onSelect` was set would be two
   * lines that look identical and behave differently.
   */
  dismisses?: boolean
}

/**
 * Who sees this banner, where, and when.
 *
 * A deliberate subset of `FlowTargeting`, and the three fields are evaluated by
 * core's own `matchUrl` / `matchAudience` / `matchSchedule` — imported, not
 * reimplemented. Those carry behaviour a fresh copy would lose: a throwing
 * audience predicate means "not eligible" rather than a crash, and an
 * unparseable date bound is ignored rather than blocking forever.
 *
 * `frequency` and `startTrigger` are absent on purpose. A banner is not
 * *started*, it is *shown*, so there is no trigger; and it is shown until
 * dismissed, so there is nothing to rate-limit.
 */
export interface BannerTargeting<TContext extends GuidanceContext = GuidanceContext> {
  /** Glob or RegExp against `location.href`. */
  urlPattern?: string | RegExp
  audience?: AudienceRule | ((context: TContext) => boolean)
  schedule?: FlowSchedule
  /** Higher wins. Ties keep registration order. Default `0`. */
  priority?: number
}

export interface BannerDefinition<TContext extends GuidanceContext = GuidanceContext> {
  id: string
  title: string
  /**
   * Plain text, rendered with `textContent`.
   *
   * Not HTML, and not `content.html` with a sanitiser. That removes the
   * escaping surface rather than re-implementing core's `_esc` a third time,
   * and an announcement bar is one sentence — the case for markup in it is
   * weak enough not to pay for a sanitiser at this boundary.
   */
  body?: string
  tone?: BannerTone
  actions?: readonly BannerAction[]
  /** Show a × that records a dismissal. Default `true`. */
  dismissible?: boolean
  targeting?: BannerTargeting<TContext>
  /**
   * Opaque revision marker for this banner's CONTENT.
   *
   * **Omit it and a dismissal is permanent**, which is ADR-015's rule: "don't
   * show me this again" is about interruption, and editing the copy does not
   * answer that objection.
   *
   * Set it, and changing it re-shows the banner to people who dismissed the
   * previous revision. That is the declarative form of the `clearDismissed`
   * escape hatch ADR-015 points authors at — you assert this is genuinely new,
   * because only you can know that.
   *
   * Deliberately NOT auto-derived from the content. A hash would make every
   * dismissal carry a version, so no stored record could express "forever" and
   * a typo fix would re-interrupt everyone.
   */
  version?: string | number
}

// ── State (output) ─────────────────────────────────────────────────────────
//
// Produced objects use `readonly x: T | undefined`, NOT `readonly x?: T`. Under
// exactOptionalPropertyTypes an optional key on a produced object forces the
// conditional-spread idiom at every construction site; a required key that may
// be undefined does not, and reads identically at the call site.

/** The banner currently on screen. A nested object so `current === null` narrows. */
export interface BannerView {
  readonly id: string
  readonly title: string
  readonly body: string | undefined
  readonly tone: BannerTone
  readonly actions: readonly BannerAction[]
  readonly dismissible: boolean
}

export interface BannerState {
  /**
   * The one visible banner, or `null`.
   *
   * Nested rather than flattened onto the state: `if (state.current)` narrows
   * every field at once, where a flat `id: string | null` alongside
   * `title: string | undefined` narrows nothing under
   * `exactOptionalPropertyTypes` and forces `?? ''` at every render site.
   */
  readonly current: BannerView | null
  /** Eligible banners waiting behind `current`. Excludes `current` itself. */
  readonly queued: number
  /** A tour is running: the surface is inert and visually hidden. */
  readonly tourActive: boolean
  /** False when there is no identity — nothing is read and nothing is written. */
  readonly persisted: boolean
  /**
   * False until the first storage read resolves.
   *
   * Nothing is painted while this is false. Without it a banner the user
   * dismissed last week flashes on screen and vanishes when storage answers.
   */
  readonly hydrated: boolean
}

// ── Diagnostics ────────────────────────────────────────────────────────────

/**
 * Why a banner is or is not showing.
 *
 * `blockedBy` reuses core's own `BlockReason` union, so "why isn't my banner
 * showing" has the same answer shape as "why didn't my tour start". This
 * surface has four silent failure modes — not hydrated, no identity, a guard
 * rejected it, a stored dismissal — and without this they are indistinguishable
 * from "nothing to show".
 */
export interface BannerEvaluation<TContext extends GuidanceContext = GuidanceContext> {
  readonly banner: BannerDefinition<TContext>
  readonly eligible: boolean
  readonly priority: number
  /** Empty when eligible. A subset of core's reasons: url, audience, schedule, dismissed. */
  readonly blockedBy: readonly BlockReason[]
}

// ── Events ─────────────────────────────────────────────────────────────────
//
// A plain callback, deliberately NOT the `TourEvents` bus — ADR-011 Decision 3.
// It is also what closes the third documented gap: a banner dismissal must not
// land in the tour funnel as `tour:dismiss` + `tour:abandon`, where analytics
// counts it alongside users giving up on a tour.

export type BannerEvent =
  | { readonly type: 'show'; readonly bannerId: string }
  | { readonly type: 'dismiss'; readonly bannerId: string }
  | { readonly type: 'action'; readonly bannerId: string; readonly label: string }

// ── Options ────────────────────────────────────────────────────────────────

export interface BannerOptions {
  /**
   * Mint and persist a first-party id when `context.userId` is unset.
   * Default `false` — this package cannot consult `@guideflow/analytics`'s
   * consent and Do-Not-Track policy. With it off banners still render; only
   * dismissal persistence is skipped, so a dismissed banner returns on reload.
   */
  anonymousId?: boolean
  /**
   * Fires after every state-affecting action. Synchronous, wrapped in
   * try/catch by the controller. This is the analytics seam: route it into
   * `collector.track('guideflow.banner.dismissed', { … })` yourself.
   */
  onEvent?: (event: BannerEvent) => void
}

// ── Controller ─────────────────────────────────────────────────────────────

export interface BannerController<TContext extends GuidanceContext = GuidanceContext> {
  /** Shaped for `useSyncExternalStore`. Pre-bound; pass directly. */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Referentially stable while nothing changed — the `current` object is reused
   * field-by-field, not just the top-level snapshot. A fresh object on every
   * call is an infinite render loop in React.
   */
  readonly getSnapshot: () => BannerState
  /** A frozen idle state with `hydrated: false`. SSR and hydration agree. */
  readonly getServerSnapshot: () => BannerState

  /** Score every registered banner. Never shows anything, never writes. */
  evaluate(): readonly BannerEvaluation<TContext>[]
  /** Record a dismissal and reveal whatever is next. */
  dismiss(bannerId: string): Promise<void>
  /** Run an action by index on the visible banner. */
  select(index: number): Promise<void>
  /** Replace the registered set. Dropping an id does NOT record a dismissal. */
  setBanners(definitions: readonly BannerDefinition<TContext>[]): void
  /** Clear this package's stored dismissals. Touches nothing else. */
  reset(): Promise<void>
  /** Re-read storage and re-derive. Call after your app changes `context.userId`. */
  refresh(): Promise<void>
  destroy(): void
}

/** Signature of {@link createBanners}, kept here so `types.ts` is the contract. */
export type CreateBanners = <TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definitions: readonly BannerDefinition<TContext>[],
  options?: BannerOptions,
) => BannerController<TContext>
