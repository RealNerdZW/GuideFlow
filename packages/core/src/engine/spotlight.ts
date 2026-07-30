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
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, var(--gf-overlay-opacity, 0.5));
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
  /** Instance defaults, set at construction and never mutated by show(). */
  private _defaults: Required<SpotlightOptions>
  /** Defaults merged with the current step's overrides. */
  private _options: Required<SpotlightOptions>
  private _scrollHandler: (() => void) | null = null
  private _id: string
  private _onOverlayClick: (() => void) | null = null
  private _overlayClickHandler: ((e: MouseEvent) => void) | null = null

  constructor(options: SpotlightOptions = {}) {
    this._defaults = {
      padding: options.padding ?? 8,
      borderRadius: options.borderRadius ?? 4,
      animated: options.animated ?? true,
      overlayColor: options.overlayColor ?? '#000',
      overlayOpacity: options.overlayOpacity ?? 0.5,
      nonce: options.nonce ?? '',
      dismissOnBackdropClick: options.dismissOnBackdropClick ?? true,
    }
    this._options = this._defaults
    this._id = gfId('spotlight')
  }

  /** Register a callback invoked when the user clicks the backdrop overlay. */
  setOverlayClickHandler(handler: (() => void) | null): void {
    this._onOverlayClick = handler
  }

  // ── Public API ────────────────────────────────────────────────────────────

  show(target: Element | null, options?: Partial<SpotlightOptions>): void {
    if (!isBrowser()) return

    // Merge onto the immutable defaults, never onto the previous step's
    // effective options — otherwise a `padding: 40` on one step leaked into
    // every step after it. See AUDIT `per-step-padding-leaks`.
    this._options = options ? { ...this._defaults, ...options } : this._defaults

    injectStyles(SPOTLIGHT_CSS, SPOTLIGHT_CSS_ID, this._options.nonce)
    this._ensureElements()
    this._currentTarget = target
    this._update()
    this._attachObservers()
  }

  hide(): void {
    if (this._overlayEl) {
      this._overlayEl.style.opacity = '0'
      this._overlayEl.style.pointerEvents = 'none'
    }
    if (this._cutoutEl) {
      this._cutoutEl.style.display = 'none'
    }
    this._detachObservers()
    this._currentTarget = null
  }

  destroy(): void {
    this._detachObservers()
    if (this._overlayEl && this._overlayClickHandler) {
      this._overlayEl.removeEventListener('click', this._overlayClickHandler)
      this._overlayClickHandler = null
    }
    this._overlayEl?.parentNode?.removeChild(this._overlayEl)
    this._cutoutEl?.parentNode?.removeChild(this._cutoutEl)
    this._overlayEl = null
    this._cutoutEl = null
    this._currentTarget = null
    removeStyles(SPOTLIGHT_CSS_ID)
  }

  setClickThrough(enabled: boolean): void {
    if (!this._overlayEl) return
    this._overlayEl.classList.toggle('gf-clickthrough', enabled)
    // The class alone was never enough: `_ensureElements()` writes an inline
    // `pointer-events: all` on every show(), and an inline style beats any
    // non-`!important` stylesheet rule — so clickThrough never actually let a
    // click reach the page. See AUDIT `clickthrough-overlay-still-blocks`.
    this._overlayEl.style.pointerEvents = enabled ? 'none' : 'all'
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _ensureElements(): void {
    // Layout (position, inset, z-index, pointer-events, transition) lives in
    // SPOTLIGHT_CSS above. These elements used to duplicate all of it as inline
    // styles, which is precisely why `clickThrough` never worked: an inline
    // `pointer-events: all` beats the `.gf-clickthrough` rule. Setting only
    // what varies keeps the stylesheet authoritative.
    if (!this._overlayEl) {
      this._overlayEl = document.createElement('div')
      this._overlayEl.setAttribute('data-gf-overlay', this._id)
      this._overlayClickHandler = (e: MouseEvent) => {
        // Only fire if we're not in click-through mode and dismissal is enabled
        if (
          this._options.dismissOnBackdropClick &&
          !this._overlayEl?.classList.contains('gf-clickthrough') &&
          this._onOverlayClick
        ) {
          e.stopPropagation()
          this._onOverlayClick()
        }
      }
      this._overlayEl.addEventListener('click', this._overlayClickHandler)
      document.body.appendChild(this._overlayEl)
    }

    if (!this._cutoutEl) {
      // The spotlight hole — a box-shadow spread paints everything outside it.
      this._cutoutEl = document.createElement('div')
      this._cutoutEl.setAttribute('data-gf-spotlight-cutout', this._id)
      document.body.appendChild(this._cutoutEl)
    }

    this._overlayEl.style.opacity = '1'
    this._cutoutEl.style.display = ''
  }

  /**
   * The paint used for the dimmed area, composing `overlayColor` with
   * `overlayOpacity`. Both options were documented and defaulted but never
   * read — `_update()` hardcoded black. See AUDIT `dead-spotlight-options`.
   *
   * A colour that already carries its own alpha (`rgba()`/`hsla()`) is used
   * verbatim; a hex colour is composed with `overlayOpacity`; anything else
   * (named colour, `var(--x)`) is passed through and opacity is ignored.
   */
  private _overlayPaint(): string {
    const { overlayColor: color, overlayOpacity: alpha } = this._options
    const hex = /^#([0-9a-f]{3,6})$/i.exec(color)
    if (!hex?.[1]) return color // rgba()/hsla()/named/var() — used verbatim
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1]
    const n = parseInt(h, 16)
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
  }

  private _update(): void {
    if (!this._cutoutEl) return

    const pad = this._options.padding
    const br = this._options.borderRadius
    const paint = this._overlayPaint()

    // `animated: false` is a documented option that previously did nothing.
    this._cutoutEl.style.transition = this._options.animated
      ? 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease, border-radius 200ms ease'
      : 'none'

    if (!this._currentTarget) {
      // Floating/modal mode — full overlay, no cutout.
      // Note: individual properties, not `cssText +=`, which appended to the
      // style string on every render and grew it without bound.
      this._cutoutEl.style.top = '50%'
      this._cutoutEl.style.left = '50%'
      this._cutoutEl.style.width = '0'
      this._cutoutEl.style.height = '0'
      this._cutoutEl.style.boxShadow = 'none'
      if (this._overlayEl) {
        this._overlayEl.style.background = paint
      }
      return
    }

    const rect = this._currentTarget.getBoundingClientRect()

    this._cutoutEl.style.top = `${rect.top - pad}px`
    this._cutoutEl.style.left = `${rect.left - pad}px`
    this._cutoutEl.style.width = `${rect.width + pad * 2}px`
    this._cutoutEl.style.height = `${rect.height + pad * 2}px`
    this._cutoutEl.style.borderRadius = `${br}px`
    this._cutoutEl.style.boxShadow = `0 0 0 9999px ${paint}`

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
