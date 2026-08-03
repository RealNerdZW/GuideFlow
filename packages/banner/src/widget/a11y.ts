// ---------------------------------------------------------------------------
// The announcement channel, the tour-active state, and the stylesheet refcount.
//
// `createLiveRegion` / `setTourActive` are copied from
// `@guideflow/checklist/src/widget/a11y.ts`, which is 82 lines of three
// shape-free functions. Extracting them into a `@guideflow/dock` package was
// considered and rejected in ADR-017: a package whose entire reason to exist is
// three functions costs a manifest, a tsconfig, a tsup config, a README, a
// version in the fixed group and a docs page — and it would pull those
// well-covered lines out of the checklist's coverage denominator, which is a
// ratchet set just under a measured number.
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
 *
 * Separate from the visible bar on purpose. Putting `role="status"` on the
 * surface itself would re-announce the entire banner on every mutation — the
 * queue advancing to the next one after a dismissal would re-read the whole
 * thing — and interactive descendants of a live region get folded into the
 * utterance.
 */
export function createLiveRegion(id: string): LiveRegion {
  const el = document.createElement('div')
  el.id = id
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
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

// ── Stylesheet refcount ────────────────────────────────────────────────────

let mounts = 0

/**
 * Track how many widgets share the one injected stylesheet.
 *
 * `injectStyles` de-dupes by id, so a second mount injects nothing — and
 * `removeStyles(id)` then removes the tag unconditionally, so the FIRST
 * teardown strips the styles out from under every surviving mount. Silently:
 * no error, no warning, just an unstyled bar.
 *
 * That defect is live in `@guideflow/checklist` today (its `destroy()` calls
 * `removeStyles` with no count) and is fixed there in the same change that
 * added this. Two mounts is not exotic — two banners on one page, or a React
 * StrictMode double-mount in development, does it.
 */
export function retainStyles(): void {
  mounts += 1
}

/** True when this was the last mount and the stylesheet should go. */
export function releaseStyles(): boolean {
  mounts = Math.max(0, mounts - 1)
  return mounts === 0
}
