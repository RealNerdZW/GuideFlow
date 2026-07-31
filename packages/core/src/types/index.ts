// ---------------------------------------------------------------------------
// GuideFlow Core — Type System
// All shared types used across packages
// ---------------------------------------------------------------------------

import type { I18nRegistry } from '../i18n/index.js'

// ── Utility ─────────────────────────────────────────────────────────────────

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T

export type Prettify<T> = { [K in keyof T]: T[K] } & object

export type MaybePromise<T> = T | Promise<T>

// ── Step ────────────────────────────────────────────────────────────────────

export type PopoverPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'
  | 'center'

export interface StepContent {
  title?: string
  body?: string
  /** Raw HTML — sanitised by renderer. Only used in themed mode. */
  html?: string
}

export interface StepMediaOptions {
  type: 'image' | 'video'
  src: string
  alt?: string
}

export interface StepAction {
  label: string
  variant?: 'primary' | 'secondary' | 'ghost'
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- intentional: string & object preserves autocomplete for known values
  action: 'next' | 'prev' | 'skip' | 'end' | (string & object)
}

export interface Step<TContext = GuidanceContext> {
  id: string
  /**
   * CSS selector, Element, resolver function, or null for floating/modal steps.
   *
   * Widened from `HTMLElement` to `Element` — the runtime guard in
   * `engine/tour.ts` has always been `instanceof Element`, so SVG targets
   * already worked and the declared type was simply wrong.
   *
   * The function form is resolved lazily at render time and may be async. It
   * composes with `waitForElement` from `@guideflow/core/navigation`, which
   * needs no adapter at all:
   *
   * ```ts
   * { id: 'save', target: () => waitForElement('#save', { timeoutMs: 5000 }) }
   * ```
   *
   * A function does not serialise — `guideflow export` and the devtools panel
   * both drop it. Use a selector for anything that has to round-trip.
   */
  target?: string | Element | null | ((context: TContext) => MaybePromise<Element | null>)
  /**
   * Wait up to this many ms for `target` to appear before giving up and
   * rendering unanchored. Overrides the navigation adapter's default.
   *
   * Inert without a navigation adapter — the engine then resolves the target
   * exactly once, which is the behaviour that predates this option.
   */
  waitForTarget?: number
  content: StepContent | (() => MaybePromise<StepContent>)
  placement?: PopoverPlacement
  /** Skip this step when the function returns false */
  showIf?: (context: TContext) => boolean
  /** Extra padding around the spotlight cutout in px */
  padding?: number
  /** Allow user to interact with the highlighted element while step is active */
  clickThrough?: boolean
  /** Scroll the target into view before showing spotlight */
  scrollIntoView?: boolean
  media?: StepMediaOptions
  /** Override which actions are shown */
  actions?: StepAction[]
  /** Metadata for analytics/AI */
  meta?: Record<string, unknown>
}

// ── Navigation ───────────────────────────────────────────────────────────────

/**
 * A route matcher.
 *
 * Prefer the string form. RegExp and function patterns are dropped by
 * `JSON.stringify` in `guideflow export` and by the devtools panel's
 * structured-clone sanitiser, so a flow that round-trips through either
 * silently loses them.
 *
 * String patterns are anchored and support `*` (one path segment) and `**` (any
 * number). `/user` therefore does NOT match `/users/42`, which a naive
 * `startsWith` would.
 */
export type RoutePattern = string | RegExp | ((url: URL) => boolean)

/** What the engine was waiting for when a deadline expired. */
export type TimeoutReason = 'route' | 'target'

export interface ResolveTargetRequest<TContext = GuidanceContext> {
  step: Step<TContext>
  /** The state node owning `step` — this is what carries `route`. */
  state: StateNode<TContext>
  context: TContext
  direction: 'forward' | 'backward'
  /**
   * Aborted when a newer render supersedes this one, when the tour is paused,
   * and when it ends. Adapters MUST settle promptly on abort and MUST release
   * every timer, observer and rAF handle in a `finally`.
   */
  signal: AbortSignal
  /**
   * Call once when the wait becomes user-visible. The engine then drops the
   * spotlight, marks the popover busy and emits `step:waiting`.
   *
   * A callback rather than something the engine predicts, because the engine
   * cannot know whether the adapter will wait: a selector can resolve to the
   * *wrong* element on the wrong route, so the target is non-null and the
   * adapter waits anyway. Do not "optimise" this into a check inside the engine.
   */
  onWaiting(reason: TimeoutReason): void
}

export interface ResolveTargetResult {
  target: Element | null
  /** Set only when a wait expired. `target` is then always null. */
  timedOut?: TimeoutReason
}

/**
 * How the engine finds a step's target when routes are involved.
 *
 * Supply one from `@guideflow/core/navigation`, or implement your own. Without
 * an adapter the engine resolves each target exactly once and renders whatever
 * it finds — the behaviour that predates this interface.
 */
export interface NavigationAdapter<TContext = GuidanceContext> {
  /**
   * Method shorthand deliberately: TypeScript keeps method parameters
   * bivariant, so a `NavigationAdapter<GuidanceContext>` taken off
   * `GuideFlowConfig` assigns to the engine's TContext-parameterised slot
   * without a cast — and `no-explicit-any` is an error in this repo.
   */
  resolveTarget(request: ResolveTargetRequest<TContext>): Promise<ResolveTargetResult>
  /**
   * Subscribe to route changes for the lifetime of ONE tour. Return a teardown.
   * Attached in `start()` and released when the tour ends.
   */
  attach?(onChange: () => void): () => void
  /**
   * Release instance-lifetime globals — a history patch, a shared subscriber.
   * Called from `destroy()`, not when a tour ends, so an engine that never
   * started still tears down.
   */
  destroy?(): void
}

// ── Flow / State Machine ─────────────────────────────────────────────────────

export interface TransitionGuard<TContext = GuidanceContext> {
  (context: TContext): boolean
}

export interface FlowTransition<TContext = GuidanceContext> {
  target: string
  guard?: TransitionGuard<TContext>
  actions?: string[]
}

export type TransitionMap<TContext = GuidanceContext> = Record<
  string,
  string | FlowTransition<TContext>
>

export interface StateNode<TContext = GuidanceContext> {
  /** Steps rendered while in this state */
  steps?: Array<Step<TContext>>
  /** Transition table: event → state */
  on?: TransitionMap<TContext>
  /** Called when entering this state */
  onEntry?: (context: TContext) => void
  /** Called when leaving this state */
  onExit?: (context: TContext) => void
  /** If true, this state marks tour completion */
  final?: boolean
  /**
   * The route this state's steps live on. While the current location does not
   * match, the engine waits — and navigates, if the adapter was given a
   * `navigate` — rather than rendering an unanchored modal on the wrong page.
   *
   * **On the state, not the step, and not a transition.** FlowMachine's
   * default-path walk follows NEXT only, so a ROUTE transition would put the
   * target state off that path and reintroduce `total-steps-is-per-state` — the
   * counter bug ADR-008 paid 1.3 kB to fix. A state-level field leaves the walk
   * untouched, and `prevStep()` already crosses state boundaries via history,
   * so Back-across-a-route works with no extra code.
   *
   * Inert unless a navigation adapter is configured.
   */
  route?: RoutePattern
}

export interface FlowDefinition<TContext = GuidanceContext> {
  id: string
  initial: string
  states: Record<string, StateNode<TContext>>
  context?: TContext
  /**
   * When true, a user who dismisses this flow (Escape, the Skip button, or a
   * backdrop click) will never be shown it again — `progress.markDismissed()`
   * is written automatically.
   *
   * Off by default: permanently suppressing a tour because someone closed it
   * once is rarely what you want. Requires `context.userId` to be set.
   */
  persistDismissal?: boolean
  /**
   * Opaque revision marker for this flow's *structure*.
   *
   * Persisted onto every snapshot. When a returning user's snapshot carries a
   * different value the snapshot is discarded and the tour restarts, rather
   * than resuming into a coordinate that no longer means what it did — a
   * renamed state, a deleted step, a reordered sequence.
   *
   * Leave it unset and resume falls back to the structural checks in
   * `FlowMachine.restore` (the step id must still exist). Derive one with
   * `flowFingerprint()` from `@guideflow/core/versioning`.
   */
  version?: string | number
  /**
   * Who sees this flow, where, and how often.
   *
   * **Inert on its own.** `@guideflow/core` never reads this field — install
   * `@guideflow/core/targeting` and call `createTargeting(gf)` to enforce it.
   * Keeping the data here and the policy there is what lets a flow stay a
   * plain serialisable object.
   */
  targeting?: FlowTargeting<TContext>
}

export interface FlowSnapshot {
  flowId: string
  currentState: string
  stepIndex: number
  completed: boolean
  timestamp: number
  /**
   * Id of the step the user was on. Preferred over `stepIndex` on resume — an
   * index means nothing after a step is inserted above it.
   *
   * Optional because snapshots already sitting in users' storage predate it.
   */
  stepId?: string
  /** `FlowDefinition.version` at write time. */
  version?: string | number
}

/** Why a persisted resume point was thrown away. */
export type SnapshotDiscardReason = 'version' | 'structure'

// ── Targeting ────────────────────────────────────────────────────────────────
//
// Types only. Every runtime rule lives in `@guideflow/core/targeting`, so a
// flow stays a plain serialisable object and the engine stays small.

export type AudienceValue = string | number | boolean

/**
 * Declarative audience rule.
 *
 * Prefer this over the predicate form: it survives `JSON.stringify` in
 * `guideflow export` and the devtools panel's structured clone. A predicate
 * does not.
 */
export interface AudienceRule {
  /** Any-of against `context.roles`. */
  roles?: string[]
  /** All-of: every named flag must be `true` in `context.featureFlags`. */
  flags?: string[]
  /**
   * Shallow match against `context`. A primitive compares with `===`; an array
   * is any-of.
   */
  where?: Record<string, AudienceValue | AudienceValue[]>
}

export interface FlowSchedule {
  /** ISO-8601 string or epoch ms. Never a `Date` — that does not round-trip JSON. */
  startsAt?: string | number
  endsAt?: string | number
}

export interface FlowFrequency {
  /** Max shows in one session (a 30-minute idle gap). */
  maxPerSession?: number
  /** Max shows ever, for this user. */
  maxTotal?: number
  /** Minimum gap between two shows of this flow. */
  cooldownMs?: number
}

/** How a flow becomes a candidate for auto-start. */
export type StartTrigger = 'manual' | 'load' | 'selector' | 'event'

export interface FlowTargeting<TContext = GuidanceContext> {
  /**
   * Glob. `*` matches within a path segment, `**` across segments. A pattern
   * starting with `/` matches `location.pathname`; anything else matches the
   * full href. A `RegExp` is tested against the href and does not serialise.
   */
  urlPattern?: string | RegExp
  audience?: AudienceRule | ((context: TContext) => boolean)
  schedule?: FlowSchedule
  frequency?: FlowFrequency
  /** Higher wins when several flows are eligible. Default 0. */
  priority?: number
  /** Default `'manual'` — today's behaviour, and never auto-started. */
  startTrigger?: StartTrigger
  /** For `startTrigger: 'selector'`. */
  selector?: string
  /** For `startTrigger: 'event'` — the name passed to `targeting.send(name)`. */
  event?: string
}

// ── Spotlight ────────────────────────────────────────────────────────────────

export interface SpotlightOptions {
  padding?: number
  borderRadius?: number
  animated?: boolean
  /** CSS color for overlay */
  overlayColor?: string
  /** Overlay opacity 0-1 */
  overlayOpacity?: number
  /** Nonce for CSP-compliant style injection */
  nonce?: string
  /** Whether clicking the backdrop overlay dismisses the tour (default: true). */
  dismissOnBackdropClick?: boolean
}

// ── Popover ──────────────────────────────────────────────────────────────────

export interface ComputedPosition {
  x: number
  y: number
  placement: PopoverPlacement
  arrowX?: number
  arrowY?: number
}

// ── Hotspot ──────────────────────────────────────────────────────────────────

export interface HotspotOptions {
  title?: string
  body?: string
  placement?: PopoverPlacement
  /** Color of the beacon pulse */
  color?: string
  size?: number
}

export interface RegisteredHotspot {
  id: string
  target: Element
  options: HotspotOptions
  beaconEl: HTMLElement
  tooltipEl: HTMLElement | null
}

// ── Hint ─────────────────────────────────────────────────────────────────────

export interface HintStep {
  id: string
  target: string
  hint: string
  icon?: string
}

// ── Persistence ──────────────────────────────────────────────────────────────

export interface PersistenceDriver {
  get<T>(key: string): MaybePromise<T | null>
  set<T>(key: string, value: T): MaybePromise<void>
  remove(key: string): MaybePromise<void>
  /** Optional: enumerate all keys (used by resetUser). */
  keys?(): MaybePromise<string[]>
}

export interface PersistenceConfig {
  driver?: 'localStorage' | 'indexedDB' | PersistenceDriver
  /** Derive the storage key from a user identifier */
  key?: (userId: string) => string
  /** TTL in milliseconds. Default: 30 days */
  ttl?: number
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface GuidanceContext {
  userId?: string
  roles?: string[]
  featureFlags?: Record<string, boolean>
  [key: string]: unknown
}

// ── Events (typed emitter map) ────────────────────────────────────────────────

export interface TourEvents {
  'tour:start': { flowId: string }
  'tour:complete': { flowId: string }
  'tour:abandon': { flowId: string; stepId: string; stepIndex: number }
  /**
   * The user actively dismissed the tour (Escape, Skip, or backdrop click), as
   * opposed to it being stopped programmatically. Always followed by
   * `tour:abandon`.
   */
  'tour:dismiss': { flowId: string; stepId: string; stepIndex: number }
  'tour:pause': { flowId: string; stepId: string }
  'tour:resume': { flowId: string; stepId: string }
  'tour:error': { flowId: string; stepId: string; error: unknown }
  'step:enter': { stepId: string; stepIndex: number; target: Element | null }
  'step:exit': { stepId: string; stepIndex: number }
  'step:skip': { stepId: string }
  /**
   * `step.target` was set and resolved to nothing. This used to render a silent
   * full-screen modal, indistinguishable from a deliberate `target: null` step.
   */
  'step:target-missing': { stepId: string; selector: string | null }
  /** A wait for a route or a target element became user-visible. */
  'step:waiting': { stepId: string; reason: TimeoutReason }
  /**
   * A wait expired. The engine then renders the step unanchored and centred —
   * it does **not** skip and does **not** end. Compose policy in userland:
   *
   * ```ts
   * gf.on('step:timeout', () => void gf.next())
   * ```
   */
  'step:timeout': { stepId: string; reason: TimeoutReason }
  'hotspot:open': { id: string }
  'hotspot:close': { id: string }
  'hint:click': { id: string }
  'progress:sync': { snapshot: FlowSnapshot }
  /**
   * A saved resume point was rejected and deleted; the tour started from the
   * beginning instead. The tour is already running at step 0 when this fires.
   */
  'progress:discard': { flowId: string; reason: SnapshotDiscardReason }
}

// ── Renderer Contract (headless interface) ────────────────────────────────────

/** What core calls on the renderer — adapters implement this */
export interface RendererContract {
  renderStep(step: Step, resolvedContent: StepContent, index: number, total: number): void
  hideStep(): void
  /**
   * The engine is waiting for a route change or for a target element to appear.
   *
   * Show a busy state **without unmounting**. Do not delegate to `hideStep()`:
   * that restores focus to the pre-tour element and then nulls it, and removes
   * the live region — undoing the focus and announcement work a tour depends on.
   */
  setWaiting?(waiting: boolean, step?: Step): void
  renderHotspot(hotspot: RegisteredHotspot): void
  destroyHotspot(id: string): void
  renderHint(hint: HintStep): void
  destroyHints(): void
  /**
   * Called once config is ready, and again whenever `configure()` changes it.
   * Implement this to pick up `nonce`, `injectStyles` and theming.
   */
  onInit?(config: GuideFlowConfig): void
  /**
   * Receives the instance's translation registry. Implement this to make
   * `instance.i18n.use(locale)` affect your rendered strings.
   */
  setI18n?(i18n: I18nRegistry): void
  /**
   * Receives the callback to invoke when the user activates a step action
   * (`next`, `prev`, `skip`, `end`, or a custom FSM event name).
   */
  setActionHandler?(handler: (action: string) => void): void
}

// ── GuideFlow Config ──────────────────────────────────────────────────────────

export interface GuideFlowConfig {
  /** Renderer to use. Defaults to the built-in themed renderer */
  renderer?: RendererContract
  persistence?: PersistenceConfig
  /** Context injected into all showIf callbacks */
  context?: GuidanceContext
  /** Default spotlight options */
  spotlight?: SpotlightOptions
  /** Nonce for CSP-compliant style injection */
  nonce?: string
  /** Whether to inject default CSS. Set false to manage styles yourself */
  injectStyles?: boolean
  /** Debug logging */
  debug?: boolean
  /**
   * Route-aware target resolution. Supply one from `@guideflow/core/navigation`,
   * or implement {@link NavigationAdapter} yourself.
   *
   * Without it the engine resolves each target once with `querySelector` and
   * renders whatever it finds — so a step whose target lives on another route
   * renders as an unanchored modal, silently.
   */
  navigation?: NavigationAdapter
  /**
   * Sanitiser for `content.html`.
   *
   * The parse-and-allowlist implementation is ~640 B gzip and every consumer
   * was paying for it, including the majority who only ever set `content.body`
   * (plain text, escaped, no sanitiser involved). It now ships as an opt-in
   * subpath so the default bundle does not carry it — the condition ADR-008 set
   * before the size budget could move again.
   *
   * ```ts
   * import { createGuideFlow } from '@guideflow/core'
   * import { sanitizeHTML } from '@guideflow/core/html'
   *
   * const gf = createGuideFlow({ sanitizeHTML })
   * ```
   *
   * Without it, `content.html` is **escaped and rendered as text** rather than
   * as markup, and the renderer warns once. That is the safe degradation: the
   * alternative — passing it through unsanitised — would be an XSS hole, and
   * silently dropping it would be a blank popover.
   *
   * Passed explicitly rather than registered by a side-effect import so there
   * is exactly one implementation in play. A module-level registry breaks the
   * moment a bundler gives the subpath its own copy of the module.
   */
  sanitizeHTML?: (html: string) => string
}

// ── AI Types (shared shapes used in core too) ─────────────────────────────────

export interface DOMContext {
  url: string
  title: string
  elements: DOMElementInfo[]
}

export interface DOMElementInfo {
  selector: string
  tag: string
  role?: string
  label?: string
  placeholder?: string
  text?: string
  rect: { x: number; y: number; width: number; height: number }
  visible: boolean
  interactive: boolean
}

export interface UserEvent {
  type: 'mousemove' | 'click' | 'scroll' | 'keydown' | 'focus' | 'blur' | 'rage-click'
  target?: string
  x?: number
  y?: number
  timestamp: number
  meta?: Record<string, unknown>
}

export interface IntentSignal {
  type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  element?: string
  confidence: number
  duration?: number
}

export interface GuidedAnswer {
  text: string
  highlights: string[]
  confidence?: number
  suggestedSteps?: Array<Step>
}
