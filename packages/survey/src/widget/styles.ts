// ---------------------------------------------------------------------------
// The widget stylesheet.
//
// Injected once, by id, through core's injectStyles so the CSP nonce is
// honoured. Everything reads core's tokens, so a host that sets data-gf-theme
// on the document element themes the survey for free.
//
// Logical properties throughout: inset-block / inset-inline and flexbox mirror
// correctly under dir=rtl with no [dir="rtl"] rules and no JS.
//
// A backtick inside this template literal terminates the string and produces a
// wall of parse errors pointing at the wrong line. This has now bitten twice in
// this repo. Comments here carry none.
// ---------------------------------------------------------------------------

export const SURVEY_STYLE_ID = 'gf-survey'

export const SURVEY_CSS = `
.gf-survey {
  position: fixed;
  /* Below the hint/hotspot band (99996-99998), below --gf-z-checklist (99999),
     and below --gf-z-banner (99995), because a survey is the least urgent
     docked surface in the library: it must never cover an announcement or a
     control. Far below --gf-z-overlay, so a running tour dims it too. */
  z-index: var(--gf-z-survey, 99994);
  inset-block-end: 24px;
  inset-inline-end: 24px;
  inline-size: min(360px, calc(100vw - 48px));
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  box-sizing: border-box;
  font-family: var(--gf-font-family, system-ui, sans-serif);
  font-size: var(--gf-font-size, 14px);
  line-height: var(--gf-line-height, 1.6);
  background: var(--gf-popover-bg, #ffffff);
  color: var(--gf-popover-text, #111827);
  border: 1px solid var(--gf-border-color, #e5e7eb);
  border-radius: var(--gf-border-radius, 8px);
  box-shadow: var(--gf-popover-shadow, 0 4px 16px rgba(0, 0, 0, 0.12));
}

.gf-survey[data-gf-dock="bottom-start"] { inset-inline-start: 24px; inset-inline-end: auto; }
.gf-survey[data-gf-dock="top-end"]      { inset-block-start: 24px; inset-block-end: auto; }
.gf-survey[data-gf-dock="top-start"]    { inset-block-start: 24px; inset-block-end: auto; inset-inline-start: 24px; inset-inline-end: auto; }

/* A running tour wins, expressed so eye, pointer and keyboard cannot disagree.
   visibility:hidden removes the subtree from the tab order AND the
   accessibility tree; the inert attribute set alongside it in a11y.ts covers
   pointer events. Not inert alone: on a browser without it, focus would land
   on an invisible card. */
.gf-survey[data-gf-tour-active] {
  visibility: hidden;
  pointer-events: none;
}

.gf-survey-body { flex: 1; min-inline-size: 0; }

.gf-survey-question {
  margin: 0 0 12px;
  font-weight: 600;
}

.gf-survey-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.gf-survey-value {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 44px is the WCAG 2.5.8 target-size floor. An eleven-point NPS row at 44px
     wraps on a narrow card, which is correct — shrinking the targets to fit
     would fail the criterion to save a line. */
  min-inline-size: 44px;
  min-block-size: 44px;
  border: 1px solid var(--gf-border-color, #e5e7eb);
  border-radius: var(--gf-border-radius, 8px);
  cursor: pointer;
}

/* The radio itself is the accessible control and stays in the accessibility
   tree; it is only visually replaced by its label. Never display:none, which
   would remove it from the tab order and break the arrow-key model. */
.gf-survey-value input {
  position: absolute;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.gf-survey-value:has(input:checked) {
  background: var(--gf-accent-color, #4f46e5);
  color: var(--gf-accent-fg, #ffffff);
  border-color: transparent;
}

.gf-survey-value:has(input:focus-visible) {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 2px;
}

.gf-survey-ends {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-block-start: 4px;
  font-size: 12px;
  opacity: var(--gf-muted-opacity, 0.72);
}

.gf-survey-followup { margin-block-start: 12px; }

.gf-survey-followup-label {
  display: block;
  margin-block-end: 4px;
}

.gf-survey-followup-input {
  inline-size: 100%;
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--gf-border-color, #e5e7eb);
  border-radius: var(--gf-border-radius, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  resize: vertical;
}

.gf-survey-submit {
  margin-block-start: 12px;
  min-block-size: 44px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--gf-border-radius, 8px);
  background: var(--gf-accent-color, #4f46e5);
  color: var(--gf-accent-fg, #ffffff);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.gf-survey-thanks { margin: 0; font-weight: 600; }

.gf-survey-dismiss {
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

.gf-survey-question[hidden],
.gf-survey-scale[hidden],
.gf-survey-followup[hidden],
.gf-survey-submit[hidden],
.gf-survey-thanks[hidden],
.gf-survey-dismiss[hidden] { display: none; }

.gf-survey-submit:focus-visible,
.gf-survey-dismiss:focus-visible,
.gf-survey-followup-input:focus-visible {
  outline: 2px solid var(--gf-accent-color, #4f46e5);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .gf-survey, .gf-survey-value, .gf-survey-submit { transition: none !important; }
}

/* forced-color-adjust: none inside a forced-colors block is backwards — it opts
   the element OUT of the palette the user asked the OS for. Declare system
   colour keywords instead. */
@media (forced-colors: active) {
  .gf-survey {
    background: Canvas;
    color: CanvasText;
    border: 1px solid CanvasText;
  }
  .gf-survey-value { border-color: ButtonBorder; color: ButtonText; }
  .gf-survey-value:has(input:checked) { background: Highlight; color: HighlightText; }
  .gf-survey-submit { background: Highlight; color: HighlightText; }
}
`
