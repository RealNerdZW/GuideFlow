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
import { isBrowser } from '../utils/ssr.js'
import { injectStyles, gfId } from '../utils/styles.js'

const POPOVER_CSS_ID = 'gf-popover-renderer'

// Inline popover CSS for the renderer — a subset of styles/index.css, so a
// consumer who never imports the stylesheet still gets a usable popover.
// Keep the two in step: the opacity tokens, the reduced-motion block and the
// forced-colors block below all mirror rules in styles/, and a user who *has*
// imported the stylesheet gets those from there instead.
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
.gf-popover-close { appearance:none; background:none; border:none; color:inherit; opacity:var(--gf-muted-opacity,.72); cursor:pointer; padding:2px 6px; border-radius:4px; font-size:18px; line-height:1; transition:opacity 100ms; }
.gf-popover-close:hover { opacity:.9; }
.gf-popover-close:focus-visible { outline:2px solid var(--gf-accent-color,#4f46e5); outline-offset:2px; opacity:.9; }
.gf-popover-body { margin:0 0 10px; opacity:var(--gf-body-opacity,.88); }
.gf-progress-bar { height:3px; background:var(--gf-progress-bg,rgba(0,0,0,.1)); border-radius:99px; margin-bottom:12px; overflow:hidden; }
.gf-progress-bar-fill { height:100%; background:var(--gf-accent-color,#4f46e5); border-radius:99px; transition:width 300ms ease; }
.gf-popover-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; }
.gf-popover-step-info { font-size:12px; opacity:var(--gf-muted-opacity,.72); }
.gf-popover-actions { display:flex; gap:6px; }
.gf-btn { appearance:none; display:inline-flex; align-items:center; border:none; border-radius:var(--gf-btn-radius,6px); padding:8px 18px; font-size:13px; font-family:inherit; font-weight:500; cursor:pointer; transition:opacity 120ms; line-height:1; }
.gf-btn:focus-visible { outline:2px solid var(--gf-accent-color,#4f46e5); outline-offset:2px; }
.gf-btn-primary { background:var(--gf-accent-color,#4f46e5); color:var(--gf-accent-fg,#fff); }
.gf-btn-primary:hover { opacity:.9; }
.gf-btn-secondary { background:transparent; color:inherit; opacity:var(--gf-muted-opacity,.72); }
.gf-btn-secondary:hover { opacity:1; }
.gf-btn-ghost { background:transparent; color:inherit; opacity:var(--gf-muted-opacity,.72); font-size:12px; padding:6px 10px; }
.gf-btn-ghost:hover { opacity:.9; }
@media (prefers-reduced-motion:reduce){.gf-popover{animation:none}.gf-progress-bar-fill,.gf-btn,.gf-popover-close{transition:none}}
@media (forced-colors:active){.gf-popover{border:2px solid ButtonText;background:Canvas;color:CanvasText}.gf-btn,.gf-popover-close,.gf-popover-body,.gf-popover-step-info{opacity:1}.gf-btn{border:1px solid ButtonText}.gf-progress-bar{border:1px solid CanvasText}}
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
  /** Keeps Tab inside the dialog while a step is on screen. */
  private _focusTrapHandler: ((e: KeyboardEvent) => void) | null = null
  /** Polite live region for step announcements; outlives the popover. */
  private _liveRegionEl: HTMLElement | null = null
  /** Whatever had focus before the tour opened, so it can be handed back. */
  private _previouslyFocused: HTMLElement | null = null
  /** Once per page, not once per step — the advice is the same every time. */
  private static _warnedNoSanitizer = false
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
    // `configure()` re-invokes onInit, so this covers both the initial config
    // and every later patch with no second call site.
    if (config.theme !== undefined && isBrowser()) {
      const root = document.documentElement
      // On <html>: the overlay, beacons and hint badges are portalled to body
      // and read the same custom properties. Only the root themes all of them.
      if (config.theme) root.setAttribute('data-gf-theme', config.theme)
      else root.removeAttribute('data-gf-theme')
    }
  }

  /**
   * Render `content.html`.
   *
   * With no `sanitizeHTML` in config the markup is **escaped and shown as
   * text**. That is deliberate: passing it through would be an XSS hole, and
   * dropping it would leave a blank popover with no clue why. The sanitiser
   * lives in the opt-in `@guideflow/core/html` subpath because it is ~640 B
   * that consumers using `content.body` were paying for and never using.
   */
  private _renderHtml(html: string): string {
    const sanitize = this._config?.sanitizeHTML
    if (sanitize) return sanitize(html)

    if (!DefaultRenderer._warnedNoSanitizer) {
      DefaultRenderer._warnedNoSanitizer = true
      console.warn(
        '[GuideFlow] A step set `content.html` but no `sanitizeHTML` is configured, ' +
          'so it has been escaped and rendered as text. Pass one:\n' +
          "  import { sanitizeHTML } from '@guideflow/core/html'\n" +
          '  createGuideFlow({ sanitizeHTML })',
      )
    }
    return this._esc(html)
  }

  renderStep(step: Step, content: StepContent, index: number, total: number): void {
    if (!isBrowser()) return

    this._ensurePopover()
    const el = this._popoverEl!

    // Remember who had focus so it can be handed back when the tour ends.
    // Only on the first step: later steps are focused by us, and capturing
    // those would restore focus into a popover that no longer exists.
    if (!this._previouslyFocused && document.activeElement instanceof HTMLElement) {
      this._previouslyFocused = document.activeElement
    }

    // Build inner HTML
    el.innerHTML = this._buildHTML(step, content, index, total)
    el.setAttribute('role', 'dialog')
    el.setAttribute('aria-modal', 'true')

    // Only reference ids that exist. `-title` is emitted when content.title is
    // set and `-body` when content.body/html is; pointing at a missing element
    // leaves the dialog with no accessible name at all, which is worse than
    // having no aria-labelledby (AUDIT `dangling-aria-labelledby`).
    if (content.title) {
      el.setAttribute('aria-labelledby', `${this._popoverId}-title`)
      el.removeAttribute('aria-label')
    } else {
      // No visible title — fall back to a generic name so the dialog is still
      // announced as something rather than as an unlabelled group.
      el.removeAttribute('aria-labelledby')
      el.setAttribute('aria-label', (this._i18n ?? defaultI18n).t('dialogLabel'))
    }

    if (content.body || content.html) {
      el.setAttribute('aria-describedby', `${this._popoverId}-body`)
    } else {
      el.removeAttribute('aria-describedby')
    }

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

    // Announce the step to assistive technology. The popover's own content is
    // not announced on re-render — the element is reused, so a screen reader
    // sees no new node — and moving focus only reads the focused control, not
    // the step body (AUDIT `no-live-region`).
    this._announce(content, index, total)

    // Focus the first control, and trap Tab inside the dialog while it is open.
    const firstFocusable = this._focusables(el)[0]
    firstFocusable?.focus()
    this._attachFocusTrap()
  }

  /**
   * Every tabbable element inside the popover, in document order.
   * `:not([disabled])` matters — a disabled Back button on step 1 would
   * otherwise become the trap's first stop and swallow focus.
   */
  private _focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
        ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.offsetParent !== null || node === document.activeElement)
  }

  /**
   * Keep Tab inside the dialog.
   *
   * `role="dialog" aria-modal="true"` is a promise to assistive technology that
   * the rest of the page is inert. Without a trap, Tab walked straight out into
   * the dimmed page behind the overlay — where the user cannot see what is
   * focused (AUDIT `no-focus-trap-or-restore`).
   */
  private _attachFocusTrap(): void {
    if (this._focusTrapHandler) return
    this._focusTrapHandler = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !this._popoverEl) return
      const focusables = this._focusables(this._popoverEl)
      if (focusables.length === 0) return

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement

      // Focus outside the dialog entirely (the page stole it, or the dialog
      // just opened) — pull it back to the appropriate end.
      if (!this._popoverEl.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', this._focusTrapHandler, true)
  }

  private _detachFocusTrap(): void {
    if (this._focusTrapHandler) {
      document.removeEventListener('keydown', this._focusTrapHandler, true)
      this._focusTrapHandler = null
    }
  }

  /**
   * Push the step into a polite live region.
   *
   * The region is created once, lives outside the popover so it survives the
   * popover being removed, and is cleared before each write — assistive
   * technology ignores an identical value written twice.
   */
  private _announce(content: StepContent, index: number, total: number): void {
    if (!this._liveRegionEl) {
      const region = document.createElement('div')
      region.setAttribute('aria-live', 'polite')
      region.setAttribute('aria-atomic', 'true')
      region.setAttribute('role', 'status')
      // Visually hidden, but not display:none or visibility:hidden — both
      // remove it from the accessibility tree.
      region.style.cssText =
        'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)'
      document.body.appendChild(region)
      this._liveRegionEl = region
    }

    const i18n = this._i18n ?? defaultI18n
    const position = total > 1 ? i18n.t('stepOf', { current: index + 1, total }) : ''
    // Trailing sentence punctuation is stripped before the '. ' join, or a body
    // that already ends in a full stop produces "This is step one.. Step 1 of
    // 3". MEASURED in a real live region; some screen readers voice the stray
    // mark, and all of them pause oddly on it.
    const parts = [content.title, content.body, position]
      .filter(Boolean)
      .map((part) => String(part).replace(/[.!?]+\s*$/, ''))
      .filter(Boolean)

    this._liveRegionEl.textContent = ''
    // Next frame, so the cleared value is observed as a change.
    requestAnimationFrame(() => {
      if (this._liveRegionEl) this._liveRegionEl.textContent = parts.join('. ')
    })
  }

  /**
   * Mark the popover busy while the engine waits for a route or a target.
   *
   * Deliberately does NOT touch `_previouslyFocused` or `_liveRegionEl`, and
   * deliberately does not delegate to `hideStep()` — that restores focus to the
   * pre-tour element and then nulls it, and removes the live region, undoing
   * the focus and announcement work a tour depends on.
   *
   * Deliberately does not disable the buttons either: pressing Next during a
   * wait is legitimate and safely cancels the waiter through its abort signal.
   *
   * Visual treatment lives in `styles/`, which is copied to `dist/styles` and is
   * not part of the size-gated JS bundle — so a spinner costs no budget. Gate
   * any animation behind `prefers-reduced-motion`.
   *
   * A tour whose *first* step is cross-route has no popover yet, so this
   * no-ops and the user sees nothing but the `step:waiting` event. Hosts can
   * render their own affordance from it.
   */
  setWaiting(waiting: boolean): void {
    const el = this._popoverEl
    if (!el) return
    el.toggleAttribute('data-gf-waiting', waiting)
    el.setAttribute('aria-busy', String(waiting))
    // Otherwise the reposition listener keeps positioning against a target that
    // has just been removed, i.e. against a zeroed rect.
    if (waiting) this._detachReposition()
  }

  hideStep(): void {
    this._detachReposition()
    this._detachFocusTrap()
    this._currentTarget = null
    if (this._popoverEl) {
      this._popoverEl.parentNode?.removeChild(this._popoverEl)
      this._popoverEl = null
    }

    // Hand focus back to whatever had it before the tour opened. Without this
    // focus lands on <body> when the dialog is removed, so a keyboard user
    // restarts from the top of the document and a screen-reader user loses
    // their place entirely (AUDIT `no-focus-trap-or-restore`).
    const restoreTo = this._previouslyFocused
    this._previouslyFocused = null
    if (restoreTo?.isConnected) restoreTo.focus()

    if (this._liveRegionEl) {
      this._liveRegionEl.remove()
      this._liveRegionEl = null
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

    // "Done" dispatches `next`, not `end`. `end` maps to `stop()`, which reports
    // the tour as *abandoned* — so clicking Done never emitted `tour:complete`,
    // the snapshot was never cleared, and the tour re-opened on the next visit
    // (AUDIT `done-button-abandons-tour`). `next()` on the last step ends it
    // through the completed path. @guideflow/react's popover already did this;
    // the two had silently diverged.
    const actions = step.actions ?? [
      ...(isFirst ? [] : [{ label: i18n.t('prev'), variant: 'secondary' as const, action: 'prev' as const }]),
      { label: isLast ? i18n.t('done') : i18n.t('next'), variant: 'primary' as const, action: 'next' as const },
    ]

    return `
      ${total > 1 ? `
        <div class="gf-progress-bar" role="progressbar"
             aria-label="${this._esc(i18n.t('progressLabel'))}"
             aria-valuenow="${index + 1}" aria-valuemin="1" aria-valuemax="${total}"
             aria-valuetext="${this._esc(i18n.t('stepOf', { current: index + 1, total }))}">
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
          ? `<div class="gf-popover-body" id="${this._popoverId}-body">${this._renderHtml(content.html)}</div>`
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
      // Read from the popover, which inherits <html dir>. `-start`/`-end`
      // alignment is logical and has to mirror in RTL.
      getComputedStyle(el).direction === 'rtl' ? 'rtl' : 'ltr',
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
