// ---------------------------------------------------------------------------
// The widget stylesheet.
//
// Injected once, by id, through core's injectStyles so the CSP nonce is
// honoured. Everything reads core's tokens, so a host that sets data-gf-theme
// on the document element themes the banner for free.
//
// Logical properties throughout: inset-block-start / inset-inline and flexbox
// mirror correctly under dir=rtl with no [dir="rtl"] rules and no JS. Most
// "RTL fixes" are bugs — core's rtl.css is deliberately almost empty because
// three rules there used to undo the browser's own correct mirroring.
//
// A backtick inside this template literal terminates the string and produces a
// wall of TS1005s pointing at the wrong line. Comments here carry none.
// ---------------------------------------------------------------------------

export const BANNER_STYLE_ID = 'gf-banner'

export const BANNER_CSS = `
.gf-banner {
  /* Below the hint/hotspot band (99996-99998) and below --gf-z-checklist
     (99999), because a banner must never cover a control the user needs: the
     checklist launcher, or an open hotspot. Far below --gf-z-overlay, so a
     running tour dims and covers it like everything else. */
  z-index: var(--gf-z-banner, 99995);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  box-sizing: border-box;
  font-family: var(--gf-font-family, system-ui, sans-serif);
  font-size: var(--gf-font-size, 14px);
  line-height: var(--gf-line-height, 1.6);
  background: var(--gf-popover-bg, #ffffff);
  color: var(--gf-popover-text, #111827);
  border-block-end: 1px solid var(--gf-border-color, #e5e7eb);
  box-shadow: var(--gf-popover-shadow, 0 4px 16px rgba(0, 0, 0, 0.12));
}

/* STICKY, not fixed, and this is the whole of the layout-reservation answer.
   A sticky element participates in flow, so it reserves its own height and
   pushes the page down instead of covering the first 60-odd pixels of it — and
   it then sticks to the top as the user scrolls, which is what an announcement
   bar is for. A fixed bar covered whatever was underneath, including a fixed
   app header and its back button. MEASURED: an e2e spec could not click a
   button the bar was sitting on top of.

   The alternative was publishing the measured height as a custom property for
   the host to consume, which means writing to an element this library does not
   own and which a host that assigns cssText wholesale silently clobbers.
   Sticky needs nothing from anyone.

   Mounting into a container with overflow or a transform changes what sticky
   sticks to; that is on the docs page. */
.gf-banner[data-gf-dock="top"] {
  position: sticky;
  inset-block-start: 0;
}

/* Bottom stays FIXED. A bottom-docked bar is the cookie-notice shape: it is
   docked to the viewport rather than to the end of the document, and reserving
   space at the bottom of a short page would leave a gap rather than pin the
   bar where the user expects it. It also covers nothing that is normally a
   primary control. */
.gf-banner[data-gf-dock="bottom"] {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  border-block-end: 0;
  border-block-start: 1px solid var(--gf-border-color, #e5e7eb);
}

/* A running tour wins, expressed so eye, pointer and keyboard cannot disagree.
   visibility:hidden removes the subtree from the tab order AND the
   accessibility tree in every browser; the inert attribute set alongside it in
   a11y.ts covers pointer events. Not inert alone: on a browser without it,
   focus would land on an invisible bar. */
.gf-banner[data-gf-tour-active] {
  visibility: hidden;
  pointer-events: none;
}

.gf-banner-content {
  flex: 1;
  min-inline-size: 0;
}

.gf-banner-title {
  margin: 0;
  font-weight: 600;
}

.gf-banner-body {
  margin: 2px 0 0;
  /* The token, never a literal: #111827 at opacity 0.5 over white is 3.4:1 and
     fails WCAG AA. --gf-muted-opacity is 0.72 (6.6:1), and the high-contrast
     theme resets it to 1. */
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-banner-body[hidden],
.gf-banner-actions[hidden],
.gf-banner-dismiss[hidden] { display: none; }

.gf-banner-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.gf-banner-action {
  /* 44px is the WCAG 2.5.8 target-size floor, and it is a minimum rather than
     a fixed height so a wrapped label still grows the button. */
  min-block-size: 44px;
  padding: 8px 16px;
  border: 1px solid var(--gf-border-color, #e5e7eb);
  border-radius: var(--gf-border-radius, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gf-banner-action[data-gf-variant="primary"] {
  background: var(--gf-accent-color, #4f46e5);
  color: var(--gf-accent-fg, #ffffff);
  border-color: transparent;
}

.gf-banner-dismiss {
  flex-shrink: 0;
  min-block-size: 44px;
  min-inline-size: 44px;
  border: 0;
  border-radius: var(--gf-border-radius, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-banner-action:focus-visible,
.gf-banner-dismiss:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 2px;
}

/* Narrow viewports: stack, so a long title never squeezes the actions to
   nothing. The dismiss button stays on the first row. */
@media (max-width: 640px) {
  .gf-banner { flex-wrap: wrap; }
  .gf-banner-content { flex-basis: calc(100% - 56px); }
  .gf-banner-actions { flex-basis: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .gf-banner, .gf-banner-action, .gf-banner-dismiss { transition: none !important; }
}

/* forced-color-adjust: none inside a forced-colors block is backwards — it opts
   the element OUT of the palette the user asked the OS for. Declare system
   colour keywords instead. */
@media (forced-colors: active) {
  .gf-banner {
    background: Canvas;
    color: CanvasText;
    border-block-end: 1px solid CanvasText;
  }
  .gf-banner-action { border-color: ButtonBorder; color: ButtonText; }
  .gf-banner-action[data-gf-variant="primary"] {
    background: Highlight;
    color: HighlightText;
  }
}
`
