// ---------------------------------------------------------------------------
// GuideFlow Core — Type System
// All shared types used across packages
// ---------------------------------------------------------------------------

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
  action: 'next' | 'prev' | 'skip' | 'end' | (string & object)
}

export interface Step<TContext = GuidanceContext> {
  id: string
  /** CSS selector, HTMLElement, or null for floating/modal steps */
  target?: string | HTMLElement | null
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
}

export interface FlowDefinition<TContext = GuidanceContext> {
  id: string
  initial: string
  states: Record<string, StateNode<TContext>>
  context?: TContext
}

export interface FlowSnapshot {
  flowId: string
  currentState: string
  stepIndex: number
  completed: boolean
  timestamp: number
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
  'tour:pause': { flowId: string; stepId: string }
  'tour:resume': { flowId: string; stepId: string }
  'step:enter': { stepId: string; stepIndex: number; target: Element | null }
  'step:exit': { stepId: string; stepIndex: number }
  'step:skip': { stepId: string }
  'hotspot:open': { id: string }
  'hotspot:close': { id: string }
  'hint:click': { id: string }
  'progress:sync': { snapshot: FlowSnapshot }
}

// ── Renderer Contract (headless interface) ────────────────────────────────────

/** What core calls on the renderer — adapters implement this */
export interface RendererContract {
  renderStep(step: Step, resolvedContent: StepContent, index: number, total: number): void
  hideStep(): void
  renderHotspot(hotspot: RegisteredHotspot): void
  destroyHotspot(id: string): void
  renderHint(hint: HintStep): void
  destroyHints(): void
  /** Called once config is ready */
  onInit?(config: GuideFlowConfig): void
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
