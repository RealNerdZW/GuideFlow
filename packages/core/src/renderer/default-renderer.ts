// ---------------------------------------------------------------------------
// Default Themed Renderer
// Implements RendererContract — creates and manages the default popover DOM
// Used when no custom renderer is provided
// ---------------------------------------------------------------------------

import { computePosition, getViewportRect } from '../engine/popover.js'
import { defaultI18n, type I18nRegistry } from '../i18n/index.js'
import type {
  RendererContract,
  Step,
  StepContent,
  RegisteredHotspot,
  HintStep,
  GuideFlowConfig,
  PopoverPlacement,
} from '../types/index.js'
import { sanitizeHTML } from '../utils/sanitize.js'
import { isBrowser } from '../utils/ssr.js'
import { injectStyles, gfId } from '../utils/styles.js'

const POPOVER_CSS_ID = 'gf-popover-renderer'

// Inline the popover CSS for the renderer (subset — full CSS imported via styles/index.css)
const POPOVER_CSS = `
.gf-popover {
  position: fixed;
  z-index: 999999;
  background: var(--gf-popover-bg, #fff);
  color: var(--gf-popover-text, #111);
  border-radius: var(--gf-border-radius, 10px);
  box-shadow: var(--gf-shadow, 0 8px 32px rgba(0,0,0,.16));
  border: 1px solid var(--gf-popover-border, rgba(0,0,0,.08));
  width: var(--gf-popover-width, 320px);
  max-width: calc(100vw - 32px);
  font-family: var(--gf-font-family, system-ui, sans-serif);
  font-size: var(--gf-font-size, 14px);
  line-height: var(--gf-line-height, 1.6);
  padding: var(--gf-spacing, 16px);
  box-sizing: border-box;
  animation: gf-fade-in 180ms cubic-bezier(.16,1,.3,1) both;
}
@keyframes gf-fade-in {
  from { opacity: 0; transform: scale(.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.gf-popover-header { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px; }
.gf-popover-title { font-weight:600; font-size:15px; margin:0; flex:1; }
.gf-popover-close { appearance:none; background:none; border:none; color:inherit; opacity:.4; cursor:pointer; padding:2px 6px; border-radius:4px; font-size:18px; line-height:1; transition:opacity 100ms; }
.gf-popover-close:hover { opacity:.9; }
.gf-popover-close:focus-visible { outline:2px solid var(--gf-accent-color,#6366f1); outline-offset:2px; opacity:.9; }
.gf-popover-body { margin:0 0 10px; opacity:.85; }
.gf-progress-bar { height:3px; background:var(--gf-progress-bg,rgba(0,0,0,.1)); border-radius:99px; margin-bottom:12px; overflow:hidden; }
.gf-progress-bar-fill { height:100%; background:var(--gf-accent-color,#6366f1); border-radius:99px; transition:width 300ms ease; }
.gf-popover-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; }
.gf-popover-step-info { font-size:12px; opacity:.5; }
.gf-popover-actions { display:flex; gap:6px; }
.gf-btn { appearance:none; display:inline-flex; align-items:center; border:none; border-radius:var(--gf-btn-radius,6px); padding:8px 18px; font-size:13px; font-family:inherit; font-weight:500; cursor:pointer; transition:opacity 120ms; line-height:1; }
.gf-btn:focus-visible { outline:2px solid var(--gf-accent-color,#6366f1); outline-offset:2px; }
.gf-btn-primary { background:var(--gf-accent-color,#6366f1); color:var(--gf-accent-fg,#fff); }
.gf-btn-primary:hover { opacity:.9; }
.gf-btn-secondary { background:transparent; color:inherit; opacity:.6; }
.gf-btn-secondary:hover { opacity:1; }
.gf-btn-ghost { background:transparent; color:inherit; opacity:.45; font-size:12px; padding:6px 10px; }
.gf-btn-ghost:hover { opacity:.8; }
`

type OnAction = (action: string) => void

export class DefaultRenderer implements RendererContract {
  private _popoverEl: HTMLElement | null = null
  private _onAction: OnAction | null = null
  private _config: GuideFlowConfig | null = null
  private _popoverId = gfId('gf-popover')
  /** Target + placement of the step currently on screen, for re-positioning. */
  private _currentTarget: Element | null = null
  private _currentPlacement: PopoverPlacement = 'bottom'
  private _repositionHandler: (() => void) | null = null
  /**
   * The instance-scoped translation registry. Falls back to the module-level
   * `defaultI18n` singleton when nothing is wired, which is what every render
   * used to do unconditionally — so `gf.i18n.use('fr')` had no effect at all.
   * See AUDIT `per-instance-i18n-dead`.
   */
  private _i18n: I18nRegistry | null = null

  setActionHandler(fn: OnAction): void {
    this._onAction = fn
  }

  /** Point this renderer at an instance's translation registry. */
  setI18n(i18n: I18nRegistry): void {
    this._i18n = i18n
  }

  onInit(config: GuideFlowConfig): void {
    this._config = config
    if (config.injectStyles !== false) {
      injectStyles(POPOVER_CSS, POPOVER_CSS_ID, config.nonce)
    }
  }

  renderStep(step: Step, content: StepContent, index: number, total: number): void {
    if (!isBrowser()) return

    this._ensurePopover()
    const el = this._popoverEl!

    // Build inner HTML
    el.innerHTML = this._buildHTML(step, content, index, total)
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')
    el.setAttribute('aria-labelledby', `${this._popoverId}-title`)
    el.setAttribute('aria-describedby', `${this._popoverId}-body`)
    el.removeAttribute('data-enter')
    // Force reflow for animation restart
    void el.offsetWidth
    el.setAttribute('data-enter', '')

    // Wire up action buttons
    el.querySelectorAll('[data-gf-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-gf-action') ?? ''
        this._onAction?.(action)
      })
    })

    // Position if target exists
    const target = step.target
    const targetEl = typeof target === 'string'
      ? document.querySelector(target)
      : target instanceof Element
        ? target
        : null

    this._currentTarget = targetEl
    this._currentPlacement = step.placement ?? 'bottom'
    this._position(el, targetEl, this._currentPlacement)
    this._attachReposition()

    // Focus management — move focus into popover
    const firstFocusable = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()
  }

  hideStep(): void {
    this._detachReposition()
    this._currentTarget = null
    if (this._popoverEl) {
      this._popoverEl.parentNode?.removeChild(this._popoverEl)
      this._popoverEl = null
    }
  }

  renderHotspot(_hotspot: RegisteredHotspot): void {
    // Handled by HotspotManager directly — renderer may override
  }

  destroyHotspot(_id: string): void { /* noop in default renderer */ }

  renderHint(_hint: HintStep): void { /* Handled by HintSystem */ }

  destroyHints(): void { /* noop in default renderer */ }

  // ── Private ───────────────────────────────────────────────────────────────

  private _ensurePopover(): void {
    if (!this._popoverEl) {
      this._popoverEl = document.createElement('div')
      this._popoverEl.className = 'gf-popover'
      this._popoverEl.setAttribute('id', this._popoverId)
      document.body.appendChild(this._popoverEl)
    }
  }

  private _buildHTML(step: Step, content: StepContent, index: number, total: number): string {
    const i18n = this._i18n ?? defaultI18n
    const progressPct = total > 1 ? Math.round(((index + 1) / total) * 100) : 100
    const isFirst = index === 0
    const isLast = index === total - 1

    const actions = step.actions ?? [
      ...(isFirst ? [] : [{ label: i18n.t('prev'), variant: 'secondary' as const, action: 'prev' as const }]),
      { label: isLast ? i18n.t('done') : i18n.t('next'), variant: 'primary' as const, action: isLast ? 'end' as const : 'next' as const },
    ]

    return `
      ${total > 1 ? `
        <div class="gf-progress-bar" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="gf-progress-bar-fill" style="width:${progressPct}%"></div>
        </div>
      ` : ''}
      <div class="gf-popover-header">
        ${content.title ? `<h2 class="gf-popover-title" id="${this._popoverId}-title">${this._esc(content.title)}</h2>` : '<span></span>'}
        <button class="gf-popover-close" data-gf-action="end" aria-label="${this._esc(i18n.t('close'))}" type="button">×</button>
      </div>
      ${content.body
        ? `<p class="gf-popover-body" id="${this._popoverId}-body">${this._esc(content.body)}</p>`
        : content.html
          ? `<div class="gf-popover-body" id="${this._popoverId}-body">${sanitizeHTML(content.html)}</div>`
          : ''}
      <div class="gf-popover-footer">
        ${total > 1 ? `<span class="gf-popover-step-info">${this._esc(i18n.t('stepOf', { current: index + 1, total }))}</span>` : '<span></span>'}
        <div class="gf-popover-actions">
          <button class="gf-btn gf-btn-ghost" data-gf-action="skip" type="button">${this._esc(i18n.t('skip'))}</button>
          ${actions.map((a) => `
            <button class="gf-btn gf-btn-${this._esc(a.variant ?? 'primary')}" data-gf-action="${this._esc(a.action)}" type="button">
              ${this._esc(a.label)}
            </button>
          `).join('')}
        </div>
      </div>
    `
  }

  /**
   * Keep the popover glued to its target through scroll and resize. Without
   * this the popover is positioned once and drifts away from the spotlight as
   * soon as the page moves — AUDIT `popover-drifts-on-scroll`.
   */
  private _attachReposition(): void {
    if (!isBrowser() || this._repositionHandler) return
    this._repositionHandler = (): void => {
      if (!this._popoverEl) return
      this._position(this._popoverEl, this._currentTarget, this._currentPlacement, false)
    }
    window.addEventListener('scroll', this._repositionHandler, { passive: true, capture: true })
    window.addEventListener('resize', this._repositionHandler, { passive: true })
  }

  private _detachReposition(): void {
    if (!this._repositionHandler || !isBrowser()) {
      this._repositionHandler = null
      return
    }
    window.removeEventListener('scroll', this._repositionHandler, { capture: true })
    window.removeEventListener('resize', this._repositionHandler)
    this._repositionHandler = null
  }

  /**
   * Position the popover.
   *
   * `measure: true` (the default, used on first render) hides the element and
   * resets it to the origin so its natural size can be read. Re-positions
   * driven by scroll/resize skip that: the element is already laid out, and
   * hiding it every frame would make it flicker.
   *
   * All maths here is in **client coordinates** — the popover is
   * `position: fixed`, `getBoundingClientRect()` is client-relative, and
   * `getViewportRect()` now agrees.
   */
  private _position(
    el: HTMLElement,
    target: Element | null,
    placement: PopoverPlacement,
    measure = true,
  ): void {
    if (measure) {
      el.style.visibility = 'hidden'
      el.style.left = '0'
      el.style.top = '0'
    }

    const popoverRect = { x: 0, y: 0, width: el.offsetWidth, height: el.offsetHeight }

    if (!target) {
      // Centred modal
      el.style.left = `${window.innerWidth / 2 - el.offsetWidth / 2}px`
      el.style.top = `${window.innerHeight / 2 - el.offsetHeight / 2}px`
      el.style.visibility = ''
      return
    }

    const targetRect = target.getBoundingClientRect()
    const viewport = getViewportRect()

    const pos = computePosition(
      { x: targetRect.left, y: targetRect.top, width: targetRect.width, height: targetRect.height },
      popoverRect,
      placement,
      viewport,
    )

    el.style.left = `${pos.x}px`
    el.style.top = `${pos.y}px`
    el.style.visibility = ''
    el.setAttribute('data-placement', pos.placement)
  }

  /** Simple HTML entity escaping */
  private _esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * Sanitize HTML content to prevent XSS.
   * Strips <script>, <style>, <iframe>, <object>, <embed>, <form>, <base>,
   * on* event handlers, and javascript:/data: URLs in href/src/action.
   */

}
