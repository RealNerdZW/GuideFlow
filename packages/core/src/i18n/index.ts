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
}

export class I18nRegistry {
  private _locales = new Map<string, Locale>([['en', EN]])
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
        str = str.replace(`{${k}}`, String(v))
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
}

export const defaultI18n = new I18nRegistry()
