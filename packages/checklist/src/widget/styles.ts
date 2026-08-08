// ---------------------------------------------------------------------------
// The widget stylesheet.
//
// Injected once, by id, through core's injectStyles so the CSP nonce is
// honoured. Everything reads core's tokens, so a host that sets
// data-gf-theme on the document element themes the checklist for free.
//
// Written with logical properties throughout: inset-inline-end plus flexbox
// mirrors correctly under dir=rtl with no [dir="rtl"] rules and no JS. The
// three rules that used to live in core's rtl.css were removed precisely
// because they undid the browser's own correct mirroring.
// ---------------------------------------------------------------------------

export const CHECKLIST_STYLE_ID = 'gf-checklist'

export const CHECKLIST_CSS = `
.gf-checklist {
  position: fixed;
  z-index: var(--gf-z-checklist, 99999);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: var(--gf-font-family, system-ui, sans-serif);
  font-size: var(--gf-font-size, 14px);
  line-height: var(--gf-line-height, 1.6);
  color: var(--gf-popover-text, #111827);
}

/* The launcher comes first in DOM order everywhere, because it owns
   aria-expanded and aria-controls for the panel. When docked at the bottom the
   panel opens upward, so the visual order is reversed there. */
.gf-checklist[data-gf-dock="bottom-end"]   { inset-block-end: 24px; inset-inline-end: 24px; flex-direction: column-reverse; }
.gf-checklist[data-gf-dock="bottom-start"] { inset-block-end: 24px; inset-inline-start: 24px; flex-direction: column-reverse; align-items: flex-start; }
.gf-checklist[data-gf-dock="top-end"]      { inset-block-start: 24px; inset-inline-end: 24px; }
.gf-checklist[data-gf-dock="top-start"]    { inset-block-start: 24px; inset-inline-start: 24px; align-items: flex-start; }

/* A running tour wins. visibility:hidden removes the subtree from the tab
   order AND the accessibility tree in every browser; the inert attribute set
   alongside it is belt-and-braces for pointer events. Not inert alone: on a
   browser without it, focus would land on an invisible widget. */
.gf-checklist[data-gf-tour-active] {
  visibility: hidden;
  pointer-events: none;
}

.gf-checklist-launcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-block-size: 44px;
  min-inline-size: 44px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--gf-accent-color, #4f46e5);
  color: var(--gf-accent-fg, #ffffff);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--gf-shadow, 0 8px 32px rgba(0, 0, 0, 0.16));
}

.gf-checklist-launcher:hover { filter: brightness(1.08); }

.gf-checklist-count {
  font-variant-numeric: tabular-nums;
  opacity: var(--gf-body-opacity, 0.88);
}

.gf-checklist-panel {
  inline-size: min(320px, calc(100vw - 48px));
  max-block-size: min(70vh, 560px);
  overflow-y: auto;
  padding: var(--gf-spacing, 16px);
  border: 1px solid var(--gf-popover-border, rgba(0, 0, 0, 0.08));
  border-radius: var(--gf-border-radius, 10px);
  background: var(--gf-popover-bg, #ffffff);
  box-shadow: var(--gf-shadow, 0 8px 32px rgba(0, 0, 0, 0.16));
  transition: opacity 160ms ease, transform 160ms ease;
}

.gf-checklist-panel[hidden] { display: none; }

.gf-checklist-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.gf-checklist-title:focus { outline: none; }
.gf-checklist-title:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 3px;
}

.gf-checklist-progress {
  block-size: 6px;
  margin-block: 10px 14px;
  border-radius: 999px;
  background: var(--gf-progress-bg, rgba(0, 0, 0, 0.1));
  overflow: hidden;
}

.gf-checklist-progress-fill {
  block-size: 100%;
  inline-size: 0%;
  border-radius: inherit;
  background: var(--gf-progress-fill, var(--gf-accent-color, #4f46e5));
  transition: inline-size 200ms ease;
}

.gf-checklist-items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gf-checklist-item { margin: 0; }

/* Section headings. list-style:none because the li carries role=presentation:
   it is a heading, not an item, and must not be counted as one. */
.gf-checklist-group { list-style: none; padding: 10px 4px 2px; }
.gf-checklist-group:first-child { padding-top: 0; }
.gf-checklist-group-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: var(--gf-muted-opacity, 0.72);
}
.gf-checklist-item:focus { outline: none; }
.gf-checklist-item:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 2px;
  border-radius: var(--gf-border-radius-sm, 6px);
}

.gf-checklist-row {
  display: flex;
  align-items: center;
  gap: 10px;
  inline-size: 100%;
  min-block-size: 44px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--gf-border-radius-sm, 6px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

button.gf-checklist-row:hover { background: var(--gf-progress-bg, rgba(0, 0, 0, 0.06)); }

button.gf-checklist-row:focus { outline: none; }
button.gf-checklist-row:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: -2px;
}

/* aria-disabled, never the disabled attribute: a blocked row stays focusable
   so it can announce which item unblocks it. */
.gf-checklist-row[aria-disabled="true"] {
  cursor: default;
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-checklist-item[data-gf-done] .gf-checklist-row {
  cursor: default;
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-checklist-mark {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 24px;
  block-size: 24px;
  border: 2px solid currentColor;
  border-radius: 999px;
  font-size: 13px;
  line-height: 1;
  opacity: var(--gf-body-opacity, 0.88);
}

.gf-checklist-item[data-gf-done] .gf-checklist-mark {
  border-color: var(--gf-accent-color, #4f46e5);
  background: var(--gf-accent-color, #4f46e5);
  color: var(--gf-accent-fg, #ffffff);
  opacity: 1;
}

.gf-checklist-text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
.gf-checklist-item-title { font-weight: 500; }
.gf-checklist-item-desc {
  font-size: var(--gf-font-size-sm, 12px);
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-checklist-dismiss {
  margin-block-start: 12px;
  min-block-size: 32px;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--gf-btn-radius, 6px);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--gf-font-size-sm, 12px);
  opacity: var(--gf-muted-opacity, 0.72);
  cursor: pointer;
}

.gf-checklist-dismiss:focus { outline: none; }
.gf-checklist-dismiss:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 2px;
}

.gf-checklist-sr {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .gf-checklist-panel,
  .gf-checklist-progress-fill {
    transition: none;
  }
}

/* Opacity is not a colour, so every de-emphasis survives the forced palette
   and has to be reset by hand. forced-color-adjust is deliberately NOT used:
   it opts out of the user's own choice. */
@media (forced-colors: active) {
  .gf-checklist-panel {
    border-color: CanvasText;
    background: Canvas;
    color: CanvasText;
  }
  .gf-checklist-launcher {
    border: 1px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
  .gf-checklist-row[aria-disabled="true"],
  .gf-checklist-item[data-gf-done] .gf-checklist-row,
  .gf-checklist-item-desc,
  .gf-checklist-dismiss,
  .gf-checklist-mark,
  .gf-checklist-count {
    opacity: 1;
  }
  .gf-checklist-item[data-gf-done] .gf-checklist-mark {
    background: Highlight;
    color: HighlightText;
    border-color: Highlight;
  }
  button.gf-checklist-row:focus-visible,
  .gf-checklist-launcher:focus-visible,
  .gf-checklist-dismiss:focus-visible {
    outline: 2px solid CanvasText;
  }
}
`
