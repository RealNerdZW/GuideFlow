// ---------------------------------------------------------------------------
// Hint System
// Persistent ambient markers (numbered badges) anchored to elements
// Like Intro.js hints but framework-agnostic and accessible
// ---------------------------------------------------------------------------

import type { HintStep, TourEvents } from '../types/index.js'
import { EventEmitter } from '../utils/emitter.js'
import { isBrowser } from '../utils/ssr.js'
import { injectStyles } from '../utils/styles.js'

const HINT_CSS_ID = 'gf-hint'
const HINT_CSS = `
.gf-hint-badge {
  position: absolute;
  z-index: 99996;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gf-accent-color, #6366f1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--gf-font-family, system-ui, sans-serif);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  transition: transform 150ms ease;
  pointer-events: all;
}
.gf-hint-badge:hover,
.gf-hint-badge:focus {
  transform: scale(1.2);
  outline: 2px solid var(--gf-accent-color, #6366f1);
  outline-offset: 2px;
}
.gf-hint-tooltip {
  position: absolute;
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 8px);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 220px;
  box-shadow: var(--gf-shadow, 0 4px 20px rgba(0,0,0,0.15));
  z-index: 99997;
  pointer-events: none;
}
`

interface MountedHint {
  step: HintStep
  badgeEl: HTMLElement
  tooltipEl: HTMLElement | null
  scrollCleanup: () => void
}

export class HintSystem extends EventEmitter<Pick<TourEvents, 'hint:click'>> {
  private _hints = new Map<string, MountedHint>()
  private _visible = false
  private _nonce: string | undefined

  constructor(nonce?: string) {
    super()
    this._nonce = nonce
  }

  // ── Public API ────────────────────────────────────────────────────────────

  register(steps: HintStep[]): void {
    if (!isBrowser()) return
    injectStyles(HINT_CSS, HINT_CSS_ID, this._nonce)

    steps.forEach((step, index) => {
      if (this._hints.has(step.id)) return
      this._mount(step, index + 1)
    })
  }

  show(): void {
    this._visible = true
    this._hints.forEach(({ badgeEl }) => {
      badgeEl.style.display = 'flex'
    })
  }

  hide(): void {
    this._visible = false
    this._hints.forEach(({ badgeEl }) => {
      badgeEl.style.display = 'none'
    })
  }

  destroy(): void {
    this._hints.forEach(({ badgeEl, scrollCleanup }) => {
      badgeEl.parentNode?.removeChild(badgeEl)
      scrollCleanup()
    })
    this._hints.clear()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _mount(step: HintStep, number: number): void {
    const target = document.querySelector(step.target)
    if (!target) {
      console.warn('[GuideFlow] Hint target not found:', step.target)
      return
    }

    const badge = document.createElement('div')
    badge.className = 'gf-hint-badge'
    badge.setAttribute('role', 'button')
    badge.setAttribute('tabindex', '0')
    badge.setAttribute('aria-label', `Hint ${number}: ${step.hint}`)
    badge.textContent = step.icon ?? String(number)

    if (!this._visible) badge.style.display = 'none'

    const positionBadge = () => {
      const rect = target.getBoundingClientRect()
      badge.style.left = `${rect.left + window.scrollX + rect.width - 12}px`
      badge.style.top = `${rect.top + window.scrollY - 12}px`
    }

    positionBadge()
    document.body.appendChild(badge)

    badge.addEventListener('click', () => this.emit('hint:click', { id: step.id }))
    badge.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.emit('hint:click', { id: step.id })
      }
    })

    const scrollHandler = () => positionBadge()
    window.addEventListener('scroll', scrollHandler, { passive: true })
    window.addEventListener('resize', scrollHandler, { passive: true })

    this._hints.set(step.id, {
      step,
      badgeEl: badge,
      tooltipEl: null,
      scrollCleanup: () => {
        window.removeEventListener('scroll', scrollHandler)
        window.removeEventListener('resize', scrollHandler)
      },
    })
  }
}
