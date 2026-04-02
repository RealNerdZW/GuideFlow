// ---------------------------------------------------------------------------
// Design Token Importers
// Map tokens from Tailwind, Radix, and shadcn/ui to GuideFlow CSS variables
// ---------------------------------------------------------------------------

interface TokenMap {
  [cssVar: string]: string
}

/**
 * Apply a token map to a CSS scope element.
 * Defaults to :root / document.documentElement.
 */
function applyTokens(tokens: TokenMap, scope?: HTMLElement): void {
  const el = scope ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value)
  }
}

// ── Tailwind ──────────────────────────────────────────────────────────────────

interface TailwindColorScale {
  '50'?: string
  '100'?: string
  '200'?: string
  '300'?: string
  '400'?: string
  '500'?: string
  '600'?: string
  '700'?: string
  '800'?: string
  '900'?: string
  '950'?: string
}

interface TailwindTokenInput {
  /** The primary/accent color scale */
  primary?: TailwindColorScale
  /** Background color */
  background?: string
  /** Foreground / text color */
  foreground?: string
  /** Border radius: 'sm' | 'md' | 'lg' | 'xl' | string */
  borderRadius?: string
  fontFamily?: string
}

export function fromTailwind(tokens: TailwindTokenInput, scope?: HTMLElement): void {
  const map: TokenMap = {}

  if (tokens.primary?.[600]) map['--gf-accent-color'] = tokens.primary[600]
  if (tokens.primary?.[100]) map['--gf-accent-fg'] = tokens.primary[100]
  if (tokens.background) map['--gf-popover-bg'] = tokens.background
  if (tokens.foreground) map['--gf-popover-text'] = tokens.foreground

  const radiiMap: Record<string, string> = {
    sm: '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px', full: '9999px',
  }
  if (tokens.borderRadius) {
    const r = radiiMap[tokens.borderRadius] ?? tokens.borderRadius
    map['--gf-border-radius'] = r
    map['--gf-border-radius-sm'] = r
    map['--gf-btn-radius'] = r
  }
  if (tokens.fontFamily) map['--gf-font-family'] = tokens.fontFamily

  applyTokens(map, scope)
}

// ── Radix UI ──────────────────────────────────────────────────────────────────

interface RadixTokenInput {
  /** CSS variable names from Radix Colors, e.g. "--violet-9" */
  accent?: string
  background?: string
  foreground?: string
  border?: string
}

export function fromRadix(tokens: RadixTokenInput, scope?: HTMLElement): void {
  const map: TokenMap = {}
  if (tokens.accent) map['--gf-accent-color'] = `var(${tokens.accent})`
  if (tokens.background) map['--gf-popover-bg'] = `var(${tokens.background})`
  if (tokens.foreground) map['--gf-popover-text'] = `var(${tokens.foreground})`
  if (tokens.border) map['--gf-popover-border'] = `var(${tokens.border})`
  applyTokens(map, scope)
}

// ── shadcn/ui ─────────────────────────────────────────────────────────────────

interface ShadcnTokenInput {
  /** CSS variable names used by shadcn, e.g. "--primary", "--background" */
  primary?: string
  background?: string
  foreground?: string
  border?: string
  radius?: string
}

export function fromShadcn(tokens: ShadcnTokenInput, scope?: HTMLElement): void {
  const map: TokenMap = {}
  if (tokens.primary) map['--gf-accent-color'] = `hsl(var(${tokens.primary}))`
  if (tokens.background) map['--gf-popover-bg'] = `hsl(var(${tokens.background}))`
  if (tokens.foreground) map['--gf-popover-text'] = `hsl(var(${tokens.foreground}))`
  if (tokens.border) map['--gf-popover-border'] = `hsl(var(${tokens.border}))`
  if (tokens.radius) map['--gf-border-radius'] = `var(${tokens.radius})`
  applyTokens(map, scope)
}
