// ---------------------------------------------------------------------------
// The announcement channel and the focus bookkeeping.
//
// The live region is the widget's OWN element with its own id, appended to
// document.body so it outlives the panel — sharing the renderer's region would
// mean the two surfaces clobbering each other's utterances.
// ---------------------------------------------------------------------------

export interface LiveRegion {
  announce(message: string): void
  destroy(): void
}

/**
 * A polite, atomic status region.
 *
 * Visually hidden by clipping, explicitly NOT display:none or
 * visibility:hidden — both remove it from the accessibility tree, which is the
 * classic way to ship a live region that never speaks. The text is cleared and
 * then written inside requestAnimationFrame so an identical string
 * re-announces rather than being deduplicated by the AT.
 */
export function createLiveRegion(id: string): LiveRegion {
  const el = document.createElement('div')
  el.id = id
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  // Clipped, never display:none or visibility:hidden — both remove the element
  // from the accessibility tree, which is the classic way to ship a live region
  // that never speaks. `clip` is kept alongside `clip-path` for older engines.
  el.style.cssText =
    'position:absolute;width:1px;height:1px;overflow:hidden;' +
    'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap'
  document.body.appendChild(el)

  let frame = 0

  return {
    announce(message: string): void {
      if (!message) return
      el.textContent = ''
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = 0
        el.textContent = message
      })
    },
    destroy(): void {
      if (frame) cancelAnimationFrame(frame)
      el.parentNode?.removeChild(el)
    },
  }
}

/**
 * Apply or lift the "a tour is running" state.
 *
 * Both halves, always together: `visibility: hidden` (via the data attribute
 * the stylesheet keys on) removes the subtree from the tab order and the
 * accessibility tree, and `inert` blocks pointer and programmatic focus in
 * browsers that implement it. Either alone leaves a gap.
 */
export function setTourActive(root: HTMLElement, active: boolean): void {
  root.toggleAttribute('data-gf-tour-active', active)
  root.toggleAttribute('inert', active)
}

/**
 * Move focus to `el` only if it is still in the document.
 *
 * The regression this exists to avoid: core restores focus to whatever was
 * focused before the tour, guarded on `isConnected`. If the user started that
 * tour from a checklist row and the row's button has since been replaced by a
 * done row, focus falls to `<body>` with no announcement. The list is patched
 * in place precisely so the `<li>` survives and can take it.
 */
export function restoreFocus(el: HTMLElement | null | undefined): boolean {
  if (!el?.isConnected) return false
  el.focus()
  return true
}

// ── Stylesheet refcount ────────────────────────────────────────────────────

let mounts = 0

/**
 * Track how many widgets share the one injected stylesheet.
 *
 * `injectStyles` de-dupes by id, so a second `mountChecklist` injects nothing —
 * and `removeStyles(id)` then removes the tag unconditionally, so the FIRST
 * teardown stripped the styles out from under every surviving mount. Silently:
 * no error, no warning, just an unstyled widget.
 *
 * Two mounts is not exotic. Two lists on one page does it, and so does a React
 * StrictMode double-mount in development.
 */
export function retainStyles(): void {
  mounts += 1
}

/** True when this was the last mount and the stylesheet should go. */
export function releaseStyles(): boolean {
  mounts = Math.max(0, mounts - 1)
  return mounts === 0
}
