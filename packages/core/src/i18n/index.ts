// ---------------------------------------------------------------------------
// i18n Registry
// Minimal locale management — register locales, switch active locale
// ---------------------------------------------------------------------------

export interface Locale {
  next: string
  prev: string
  close: string
  skip: string
  stepOf: string           // e.g. "Step {current} of {total}"
  done: string
  openHint: string
  closeHint: string
  /** Accessible name for the popover when a step supplies no title. */
  dialogLabel: string
  /** Accessible name for the progress indicator. */
  progressLabel: string
  /**
   * Announced when a tour finishes.
   *
   * Without it the end of a tour is silent. With a Done press the assistive
   * technology at least voices the button activation, which correlates the
   * disappearance — but when `advanceOn` ends a tour the user pressed a control
   * in their own application and the tour simply ceases to exist: no utterance,
   * and no focused element that changed.
   */
  tourComplete: string
}

const EN: Locale = {
  next: 'Next',
  prev: 'Back',
  close: 'Close',
  skip: 'Skip tour',
  stepOf: 'Step {current} of {total}',
  done: 'Done',
  openHint: 'Open hint',
  closeHint: 'Close hint',
  dialogLabel: 'Product tour',
  progressLabel: 'Tour progress',
  tourComplete: 'Tour complete',
}

/**
 * Per-locale overrides for a flow's own copy.
 *
 * Kept **beside** the flow rather than inside `StepContent`, which is the whole
 * design. Three reasons:
 *
 * 1. Changing `StepContent` would touch the validator, the exporter, the
 *    devtools panel, the MCP tools and every `.flow.json` in existence — a
 *    migration for no gain.
 * 2. **Translators want a file of strings, not your state machine.** This shape
 *    is flat, diffable, reviewable in a pull request, and generatable.
 * 3. Untranslated keys fall through to the flow's own content, so a partial
 *    translation degrades one string at a time instead of failing.
 *
 * `steps` and `states` are separate maps because step ids and state ids are
 * **separate namespaces** — step ids are unique within a flow, but nothing
 * stops a state being called `welcome` while a step is too. One flat map would
 * silently collide.
 */
export interface ContentCatalogue {
  /** Step id → the fields to override. Omit a field to keep the original. */
  steps?: Record<string, { title?: string; body?: string; html?: string }>
  /** State id → its chapter label. */
  states?: Record<string, string>
}

export class I18nRegistry {
  private _locales = new Map<string, Locale>([['en', EN]])
  private _content = new Map<string, ContentCatalogue>()
  private _active = 'en'

  register(locale: string, strings: Partial<Locale>): void {
    const base = this._locales.get(locale) ?? { ...EN }
    this._locales.set(locale, { ...base, ...strings })
  }

  use(locale: string): void {
    if (!this._locales.has(locale)) {
      console.warn(`[GuideFlow] Locale "${locale}" not registered. Falling back to "en".`)
    }
    this._active = locale
  }

  t(key: keyof Locale, vars?: Record<string, string | number>): string {
    const locale = this._locales.get(this._active) ?? EN
    let str = locale[key] ?? EN[key]
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        // Replace every occurrence — `String.replace` with a string pattern
        // only replaces the first, so "{n} of {n}" used to render half-filled.
        str = str.split(`{${k}}`).join(String(v))
      }
    }
    return str
  }

  get activeLocale(): string {
    return this._active
  }

  getLocale(locale?: string): Locale {
    return this._locales.get(locale ?? this._active) ?? EN
  }

  /**
   * Register per-locale copy for a flow's steps and chapter labels.
   *
   * Merges, like `register()`, so a catalogue can arrive in pieces — one fetch
   * per flow is a normal shape when flows are static assets.
   *
   * ```ts
   * gf.i18n.registerContent('es', {
   *   steps: { welcome: { title: 'Bienvenido de nuevo, {{firstName}}' } },
   *   states: { setup: 'Configuración' },
   * })
   * ```
   *
   * Tokens survive translation: the catalogue is applied first and interpolated
   * second, so a translated string containing `{{firstName}}` still resolves.
   */
  registerContent(locale: string, catalogue: ContentCatalogue): void {
    const prev = this._content.get(locale)
    this._content.set(locale, {
      steps: { ...prev?.steps, ...catalogue.steps },
      states: { ...prev?.states, ...catalogue.states },
    })
  }

  /**
   * Overrides for one step in the active locale, or `undefined`.
   *
   * No fall-through to English: the flow's own content **is** the fallback, and
   * it is what the engine merges over. Read by the engine, not by renderers —
   * content is resolved before `renderStep` so a custom renderer needs to know
   * nothing about any of this.
   */
  stepContent(stepId: string): { title?: string; body?: string; html?: string } | undefined {
    return this._content.get(this._active)?.steps?.[stepId]
  }

  /** Chapter label for a state in the active locale, or `undefined`. */
  stateLabel(stateId: string): string | undefined {
    return this._content.get(this._active)?.states?.[stateId]
  }
}

export const defaultI18n = new I18nRegistry()
