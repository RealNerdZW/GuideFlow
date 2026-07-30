# GuideFlow architecture

How the pieces fit, and the invariants you must not break. Written for someone about to change
`packages/core`.

---

## 1. Layering

```
                    ┌──────────────────────────────────────────┐
   consumer apps    │  React        Vue        Svelte    vanilla│
                    └───┬──────────┬───────────┬───────────┬────┘
                        │          │           │           │
                 @guideflow/react  vue      svelte         │
                        └──────────┴───────────┴───────────┤
                                                           │
                              ┌────────────────────────────▼──────────────────┐
                              │              @guideflow/core                  │
                              │  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
                              │  │FlowMachine│→│TourEngine │→│ Renderer   │  │
                              │  │  (FSM)    │  │(orchestr.)│  │(Contract) │  │
                              │  └──────────┘  └─────┬─────┘  └────────────┘  │
                              │                      │                        │
                              │   Spotlight ─ Popover ─ Hotspot ─ Hint        │
                              │   ProgressStore ─ Drivers ─ BroadcastSync     │
                              │   I18nRegistry ─ Tokens ─ intro-compat        │
                              └───▲──────────────────────▲────────────────────┘
                                  │                      │
                     @guideflow/ai            @guideflow/analytics
                     (attaches .ai)           (subscribes to events)
                                  ▲                      ▲
                     @guideflow/cli          @guideflow/devtools
                     (authors flows)         (observes via window.__guideflow)
```

**Dependency rule:** `core` depends on nothing and imports from no sibling. Everything else depends
on `core`. `ai` and `analytics` do not know about each other. Adapters do not know about `ai` or
`analytics` — except `@guideflow/react`'s `ConversationalPanel`, which reads the runtime-attached
`.ai` property duck-typed, deliberately avoiding a package dependency.

Two constraints drive most of `core`'s design: **zero runtime dependencies** and **≤ 12 kB gzip**
(enforced by `size-limit`; currently 11.09 kB). That is why the sanitizer is hand-rolled, why the
emitter is 43 lines, and why there is no schema library.

---

## 2. The FSM model

A tour is a state machine, not a list. This is the project's core architectural bet.

```
FlowDefinition
  id, initial, states{}, context?
      │
      └── StateNode
            steps?    Step[]        rendered in order while in this state
            on?       event → state (with optional guard)
            onEntry?  (ctx) => void
            onExit?   (ctx) => void
            final?    boolean       reaching this completes the tour
```

`FlowMachine` holds `(state, stepIndex)` — a **two-dimensional** position. `nextStep()` walks
`stepIndex` within the current state's `steps`; when exhausted it consults `on`. `send(event)` jumps
states directly. `restore({ state, stepIndex })` reinstates a persisted position.

Why this over a flat array: role- and flag-conditional branching, resumable multi-session onboarding,
guards on transitions, and entry/exit side effects — all of which a `Step[]` cannot express without
inventing a worse state machine on top.

**Consequences:**
- A flow with no reachable `final: true` state never completes and therefore never persists
  completion, so it replays forever.
- Step ids must be unique across *all* states — persistence and analytics key on them.
- `stepIndex` is per-state, so a saved `stepIndex` is only meaningful together with its `state`.

---

## 3. The instance: `Object.assign(engine, {...})`

This is the single most surprising thing in the codebase. Read `CLAUDE.md` §5.1 before changing it.

```ts
const engine = new TourEngine<TContext>({ renderer, spotlight, context, debug })

const _engineStart = engine.start.bind(engine)   // capture BEFORE assign
const _engineNext  = engine.next.bind(engine)
// …

const instance = Object.assign(engine as any, {
  start(flow, ctx) { /* persistence checks, then */ await _engineStart(flow, ctx) },
  next()           { await _engineNext(); await _saveProgress() },
  // …
})
```

`instance === engine`. Literal methods **shadow** prototype methods of the same name; everything not
shadowed (`pause`, `resume`, `skip`, and all the getters) remains reachable through the prototype.
Wrappers must call the captured `_engineXxx` bindings — `engine.next()` inside `next()` is infinite
recursion.

The pattern buys a single object that is both the engine and the public API, with no proxy overhead
and no duplicated event plumbing. It costs clarity. Documented here so the next person does not
"simplify" it into a stack overflow.

---

## 4. Render pipeline

`TourEngine._renderCurrentStep()` — async, and racy by nature, since `content` may be a promise and
scrolling takes time.

```
  ┌─ capture gen = ++_renderGeneration on start/end
  │
  1. evaluate showIf ─── false ─→ emit step:skip, advance, repeat
  │                              (visited-set guards against cycles)
  2. await resolveContent(step)          ← generation check after
  3. resolve target via querySelector
  4. scrollTargetIntoView + await 150ms  ← generation check after
  5. spotlight.show(target, opts); setClickThrough
  6. set _currentStep / _currentContent; _stepExitEmitted = false
  7. emit step:enter
  8. renderer.renderStep(step, content, index, total)
  │
  └─ catch → _log, emit tour:error, _doEnd(false)
```

**Invariant:** every `await` in this method is followed by
`if (gen !== this._renderGeneration) return`. `_doEnd()` and `start()` both bump the generation, so
an in-flight render for an abandoned step cancels itself. Adding an `await` without the check
reintroduces stale renders — the class of bug this counter exists to kill.

**Invariant:** `step:exit` fires exactly once per `step:enter`, enforced by `_stepExitEmitted`.
Analytics computes dwell time from that pairing.

**Error policy:** any throw inside the pipeline ends the tour rather than leaving a half-rendered
overlay on the page. That is deliberate — a stuck full-screen overlay is worse than a cancelled tour.

---

## 5. Rendering and the renderer contract

`core` never assumes its own renderer:

```ts
interface RendererContract {
  renderStep(step, resolvedContent, index, total): void
  hideStep(): void
  renderHotspot(hotspot): void
  destroyHotspot(id): void
  renderHint(hint): void
  destroyHints(): void
  onInit?(config): void
}
```

`DefaultRenderer` is the batteries-included implementation: it builds an HTML string and assigns
`innerHTML`, positions via `computePosition`, and wires `[data-gf-action]` buttons back through a
single action handler set by `createGuideFlow`.

**Security invariant:** every interpolated value in that string is either escaped (`_esc`) or
sanitised (`_sanitizeHTML`). The current sanitizer is a regex denylist with known bypasses — see
`SECURITY-MODEL.md`. When you replace it, replace it with parsing, not more regex.

Adapters that want full visual control implement `RendererContract` themselves (React's
`GuidePopover` is the reference for the headless approach).

### Overlay model

`SpotlightOverlay` uses two fixed-position elements, not an SVG mask:

- `[data-gf-overlay]` — full-viewport, `z-index: 999998`, catches backdrop clicks.
- `[data-gf-spotlight-cutout]` — positioned over the target with
  `box-shadow: 0 0 0 9999px rgba(0,0,0,opacity)`, which paints the dimming *outside* the cutout.

Position is refreshed by a `ResizeObserver` on the target plus capture-phase `scroll` and `resize`
listeners.

**Known limitation:** because the dimming is a box-shadow on a `pointer-events: none` element and the
overlay is a single full-viewport div, there is no "only the target is interactive" mode.
`clickThrough: true` makes the *entire page* interactive. Competitors solve this with a real SVG mask
or four positioned panels; noted in `AUDIT.md`.

---

## 6. Persistence

```
ProgressStore ──▶ PersistenceDriver  ─┬─ LocalStorageDriver
                                      ├─ IndexedDBDriver
                                      └─ your own { get, set, remove, keys? }
```

Keys are namespaced `gf:{userId}:{...}` (overridable via `persistence.key`):

| Key suffix | Holds |
|---|---|
| `:{flowId}:snapshot` | `{ flowId, currentState, stepIndex, completed, timestamp }` |
| `:{flowId}:dismissed` | "don't show again" flag |
| `:completed` | array of completed flow ids |

Every value is wrapped as `{ value, expiresAt }` with a default 30-day TTL, checked on read.

`BroadcastSync` mirrors snapshots across tabs over `BroadcastChannel`. **It is currently only
constructed on the resume path** in `start()`, so a fresh tour does not sync — see `AUDIT.md`.

`markDismissed()` exists and is never called by the library; nothing surfaces a "don't show again"
control. The API is there; the feature is not wired.

---

## 7. Cross-package contracts

| Consumer | Contract | Coupling |
|---|---|---|
| `@guideflow/analytics` | subscribes to `TourEvents` via `gf.on()` | event names + payload shapes are a public API. Renaming one is a breaking change. |
| `@guideflow/ai` | `createAI()` **mutates** the instance, adding `.ai` and wrapping `destroy()` | `.ai` is not on the `GuideFlowInstance` type. TypeScript users must use the return value of `createAI()`, not the original reference. |
| `@guideflow/devtools` | reads `window.__guideflow` from the page world | **the library never sets this global** — the host app must. Undocumented outside the demo. |
| `@guideflow/cli` | reads/writes `FlowDefinition` as JSON | `showIf`, function `content` and `HTMLElement` targets cannot serialise. Export is lossy by construction. |
| adapters | wrap the instance; do not re-implement engine logic | any behaviour added to an adapter that belongs in `core` is drift. |

---

## 8. Invariants checklist

Before merging a change to `core`, confirm all of these still hold:

- [ ] Zero runtime dependencies; `pnpm --filter @guideflow/core size` ≤ 12 kB gzip
- [ ] No `document`/`window` access at module scope; all DOM behind `isBrowser()`
- [ ] All style injection through `injectStyles(css, id, nonce)`
- [ ] Every `await` in `_renderCurrentStep()` followed by a generation check
- [ ] `step:exit` still fires exactly once per `step:enter`
- [ ] `destroy()` releases listeners, observers, timers, channels and DOM — and is idempotent
- [ ] Every value interpolated into `innerHTML` is escaped or sanitised
- [ ] No new wrapper in `createGuideFlow` calls `engine.<sameName>()`
- [ ] Event names and payload shapes unchanged, or a major-flagged changeset explains why
