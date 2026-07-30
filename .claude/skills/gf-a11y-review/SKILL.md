---
name: gf-a11y-review
description: WCAG 2.2 AA review of GuideFlow's tour UI — focus trap and restore, dialog semantics, live-region step announcements, the global arrow-key handler, reduced motion, contrast, RTL, and touch targets. Use when changing the default renderer, the spotlight, popover positioning, the CSS themes, or any React tour component; and when asked about accessibility, screen readers, keyboard navigation, or a11y test failures.
---

# /gf-a11y-review — accessibility review for GuideFlow

A tour library takes over the page. If it does that inaccessibly it locks people out of the product
it is supposed to be introducing. Treat every finding here as functional, not cosmetic.

## Surface to review

| File | What it owns |
|---|---|
| `packages/core/src/renderer/default-renderer.ts` | popover DOM, ARIA, focus, buttons, progressbar |
| `packages/core/src/engine/tour.ts` | the document-level keyboard handler |
| `packages/core/src/engine/spotlight.ts` | overlay, cutout, pointer-events, click-through |
| `packages/core/src/engine/popover.ts` | placement maths, viewport clamping, RTL |
| `packages/core/src/engine/hotspot.ts`, `hint.ts` | beacons and hint badges |
| `packages/core/src/styles/*.css` | tokens, dark, high-contrast, RTL, animations |
| `packages/react/src/components/*` | GuidePopover, TourStep, HotspotBeacon, ConversationalPanel |

## Checklist

Work through every item. For each, cite `file:line` and state pass / fail / not-applicable.

### Keyboard and focus

- [ ] **Focus moves into the popover** when a step renders.
- [ ] **Focus is trapped** inside the popover while a modal step is active — Tab from the last
      control returns to the first, Shift+Tab from the first goes to the last.
- [ ] **Focus is restored** to the element that had it before the tour started, on complete/skip/stop.
- [ ] The page behind the overlay is **not reachable by Tab** (use `inert`, or contain focus).
- [ ] `Escape` dismisses, and does so **once** — check for duplicate handlers between
      `TourEngine._attachKeyboard()` and React components.
- [ ] The arrow-key handler **does not hijack typing.** `_attachKeyboard()` calls `preventDefault()`
      on ArrowLeft/Right/Up/Down at the `document` level. If the event target is an
      `input`/`textarea`/`select`/`[contenteditable]`/`[role=slider]`/`[role=listbox]`, it must bail
      out. This matters most for `clickThrough` steps where the user is meant to interact.
- [ ] All controls are reachable and have visible `:focus-visible` styling.

### Semantics and announcements

- [ ] `role="dialog"` + `aria-modal="true"` are set only when the step really is modal.
- [ ] `aria-labelledby` / `aria-describedby` point at elements **that exist**. The default renderer
      only emits the `-title` id when `content.title` is set and the `-body` id when
      `content.body`/`content.html` is set — a step without a title leaves a dangling reference.
- [ ] Step changes are announced — an `aria-live="polite"` region, or focus movement that carries the
      new content.
- [ ] The progressbar has an accessible name and `aria-valuetext` (e.g. "Step 2 of 5"), not just
      `aria-valuenow`.
- [ ] The close button has a text alternative (it renders a bare `×` glyph).
- [ ] Hotspot beacons and hint badges are real buttons with labels, not decorative divs.

### Motion, colour, theming

- [ ] Every `@keyframes`/`transition` has a `@media (prefers-reduced-motion: reduce)` escape — check
      `gf-fade-in` in the renderer and the 200 ms transitions in the spotlight.
- [ ] Default token contrast meets 4.5:1 for body text and 3:1 for UI/large text, in light **and**
      dark.
- [ ] `high-contrast.css` covers every element the default theme styles.
- [ ] Dark mode responds to `prefers-color-scheme`, not only a manual class.

### Layout, pointer, RTL, mobile

- [ ] Popover is clamped inside the viewport at 320 px width on a 360 px-wide screen.
- [ ] Placement flips rather than overflowing; `center` works with no target.
- [ ] With `clickThrough: true` the **target** is interactive — verify it is not the case that the
      whole page becomes clickable (the overlay currently toggles `pointer-events: none` wholesale,
      so there is no target-only interaction mode).
- [ ] Overlay/cutout track the target on scroll, resize, and CSS-animated movement.
- [ ] Sticky/fixed headers do not cover the popover.
- [ ] Touch targets ≥ 24×24 CSS px (WCAG 2.2 SC 2.5.8).
- [ ] RTL: placement maths in `popover.ts` agrees with `rtl.css`; `left-start` etc. mirror correctly.
- [ ] `z-index: 999999` still wins inside `<dialog>`, fullscreen, and shadow DOM — or is documented
      as a known limitation with an override token.

## Verifying

Static review is not enough. Once the e2e harness is rebuilt (REMEDIATION-PLAN Phase 1):

```bash
pnpm --filter e2e test -- accessibility
```

Note the current suite imports `AxeBuilder` as a default export from `axe-playwright`, which does not
exist — the correct package for that API is `@axe-core/playwright`. Fix that before trusting results.

For manual checks, `/gf-extension-dev` explains how to drive a real browser, and Storybook's
`@storybook/addon-a11y` is already installed.

## Reporting

Group findings by severity:

- **Blocker** — locks out keyboard or screen-reader users (no focus trap, no restore, hijacked keys).
- **Serious** — degrades the experience materially (missing announcements, contrast, reduced motion).
- **Minor** — polish.

For each: `file:line`, the WCAG success criterion, what a user experiences, and the concrete fix.
