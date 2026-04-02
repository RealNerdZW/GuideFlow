// ---------------------------------------------------------------------------
// Spotlight Engine
// SVG mask overlay with animated cutout over any DOM element
// Handles scroll/resize updates via ResizeObserver + scroll listener
// ---------------------------------------------------------------------------

import type { SpotlightOptions } from '../types/index.js'
import { isBrowser } from '../utils/ssr.js'
import { injectStyles, removeStyles, gfId } from '../utils/styles.js'

const SPOTLIGHT_CSS_ID = 'gf-spotlight'
const SPOTLIGHT_CSS = `
[data-gf-overlay] {
  position: fixed;
  inset: 0;
  z-index: 999998;
  pointer-events: all;
  transition: opacity 200ms ease;
}
[data-gf-overlay].gf-clickthrough {
  pointer-events: none;
}
[data-gf-overlay] svg {
  width: 100%;
  height: 100%;
}
[data-gf-spotlight-cutout] {
  position: fixed;
  z-index: 999999;
  pointer-events: none;
  border-radius: var(--gf-spotlight-radius, 4px);
  box-shadow: 0 0 0 100vmax rgba(0, 0, 0, var(--gf-overlay-opacity, 0.5));
  transition: 
    top 200ms ease,
    left 200ms ease,
    width 200ms ease,
    height 200ms ease,
    border-radius 200ms ease;
}
`

export class SpotlightOverlay {
  private _overlayEl: HTMLElement | null = null
  private _cutoutEl: HTMLElement | null = null
  private _currentTarget: Element | null = null
  private _resizeObserver: ResizeObserver | null = null
  private _options: Required<SpotlightOptions>
  private _scrollHandler: (() => void) | null = null
  private _id: string

  constructor(options: SpotlightOptions = {}) {
    this._options = {
      padding: options.padding ?? 8,
      borderRadius: options.borderRadius ?? 4,
      animated: options.animated ?? true,
      overlayColor: options.overlayColor ?? 'rgba(0,0,0,0)',
      overlayOpacity: options.overlayOpacity ?? 0.5,
      nonce: options.nonce ?? '',
    }
    this._id = gfId('spotlight')
  }

  // ── Public API ────────────────────────────────────────────────────────────

  show(target: Element | null, options?: Partial<SpotlightOptions>): void {
    if (!isBrowser()) return

    if (options) {
      this._options = { ...this._options, ...options }
    }

    injectStyles(SPOTLIGHT_CSS, SPOTLIGHT_CSS_ID, this._options.nonce)
    this._ensureElements()
    this._currentTarget = target
    this._update()
    this._attachObservers()
  }

  hide(): void {
    if (this._overlayEl) {
      this._overlayEl.style.opacity = '0'
    }
    this._detachObservers()
    this._currentTarget = null
  }

  destroy(): void {
    this._detachObservers()
    this._overlayEl?.parentNode?.removeChild(this._overlayEl)
    this._cutoutEl?.parentNode?.removeChild(this._cutoutEl)
    this._overlayEl = null
    this._cutoutEl = null
    this._currentTarget = null
    removeStyles(SPOTLIGHT_CSS_ID)
  }

  setClickThrough(enabled: boolean): void {
    if (!this._overlayEl) return
    if (enabled) {
      this._overlayEl.classList.add('gf-clickthrough')
    } else {
      this._overlayEl.classList.remove('gf-clickthrough')
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _ensureElements(): void {
    if (!this._overlayEl) {
      // Transparent clickable overlay for backdrop clicks
      this._overlayEl = document.createElement('div')
      this._overlayEl.setAttribute('data-gf-overlay', this._id)
      this._overlayEl.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 999998;
        pointer-events: all;
        transition: opacity 200ms ease;
      `
      document.body.appendChild(this._overlayEl)
    }

    if (!this._cutoutEl) {
      // The spotlight hole — uses box-shadow to create overlay effect
      this._cutoutEl = document.createElement('div')
      this._cutoutEl.setAttribute('data-gf-spotlight-cutout', this._id)
      this._cutoutEl.style.cssText = `
        position: fixed;
        z-index: 999999;
        pointer-events: none;
        transition: top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease, border-radius 200ms ease;
      `
      document.body.appendChild(this._cutoutEl)
    }

    this._overlayEl.style.opacity = '1'
  }

  private _update(): void {
    if (!this._cutoutEl) return

    const pad = this._options.padding
    const br = this._options.borderRadius
    const opacity = this._options.overlayOpacity

    if (!this._currentTarget) {
      // Floating/modal mode — full overlay, no cutout
      this._cutoutEl.style.cssText += `
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        box-shadow: none;
      `
      if (this._overlayEl) {
        this._overlayEl.style.background = `rgba(0,0,0,${opacity})`
      }
      return
    }

    const rect = this._currentTarget.getBoundingClientRect()

    this._cutoutEl.style.top = `${rect.top - pad}px`
    this._cutoutEl.style.left = `${rect.left - pad}px`
    this._cutoutEl.style.width = `${rect.width + pad * 2}px`
    this._cutoutEl.style.height = `${rect.height + pad * 2}px`
    this._cutoutEl.style.borderRadius = `${br}px`
    this._cutoutEl.style.boxShadow = `0 0 0 9999px rgba(0,0,0,${opacity})`

    if (this._overlayEl) {
      this._overlayEl.style.background = 'transparent'
    }
  }

  private _attachObservers(): void {
    this._detachObservers()

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._update())
      if (this._currentTarget) {
        this._resizeObserver.observe(this._currentTarget)
      }
      this._resizeObserver.observe(document.documentElement)
    }

    this._scrollHandler = () => this._update()
    window.addEventListener('scroll', this._scrollHandler, { passive: true, capture: true })
    window.addEventListener('resize', this._scrollHandler, { passive: true })
  }

  private _detachObservers(): void {
    this._resizeObserver?.disconnect()
    this._resizeObserver = null

    if (this._scrollHandler) {
      window.removeEventListener('scroll', this._scrollHandler, { capture: true })
      window.removeEventListener('resize', this._scrollHandler)
      this._scrollHandler = null
    }
  }
}
