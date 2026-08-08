---
description: What GuideFlow does for screen-reader and keyboard users out of the box, what it deliberately does not do, and what you still have to do yourself.
keywords: product tour accessibility, WCAG tour library, screen reader onboarding, keyboard accessible tour, prefers-reduced-motion
---

# Accessibility

A product tour sits on top of someone else's application and takes over the screen. That makes it
one of the easiest things in a codebase to get wrong for keyboard and screen-reader users — and one
of the most damaging, because it is the *first* thing a new user meets.

This page describes what the library does, what it deliberately does not do, and what is still on
you.

::: warning Verified by tooling, not yet by a person
Everything below is covered by automated tests — axe reports no critical or serious violations on
an open popover, and the focus, keyboard and announcement behaviour is asserted in a real browser
across Chromium, Firefox and WebKit.

**No manual screen-reader pass has been run.** Automated checks catch structure, not usability. If
accessibility is a requirement you have to sign off on, test with your own users and your own
assistive technology before you rely on this.
:::

## Keyboard

| Key | Behaviour |
|---|---|
| `Tab` / `Shift+Tab` | Cycles the popover's own controls. Focus cannot leave the dialog while a step is open. |
| `→` / `↓` | Next step |
| `←` / `↑` | Previous step |
| `Escape` | Ends the tour |

Focus moves into the popover when a step opens and returns to whatever held it before the tour
started when the tour ends — the button the user clicked to start it, usually.

### Arrow keys and your inputs

The arrow-key bindings live on `document`, so they could easily steal keystrokes from your app. They
do not fire when the event targets:

- an `<input>`, `<textarea>` or `<select>`
- anything inside `[contenteditable]`
- an element with a widget `role` (`textbox`, `combobox`, `listbox`, `slider`, `menu`, `grid`, …)
- a key that is part of an IME composition
- a key held with `Ctrl`, `Alt` or `Meta`
- a key another handler has already called `preventDefault()` on

This matters most for [`clickThrough`](/guide/spotlight-popover#click-through) steps, which exist
precisely so the user can type into the highlighted element.

`Escape` is the exception: it fires from anywhere, including from inside a text field, because it is
a keyboard user's only guaranteed way out of a modal.

## Screen readers

The popover is a `role="dialog"` with `aria-modal="true"`. It takes its accessible name from the
step title, and falls back to a translatable `dialogLabel` string when a step has no title. The body
is wired up with `aria-describedby`, and both references are removed rather than left dangling when
the corresponding content is absent.

Each step is announced through a polite live region. This is necessary because the popover element
is **reused** between steps: a screen reader sees no new node, and moving focus reads only the
focused button, not the step body. The region lives outside the popover so it survives the popover
being removed.

The progress bar reports a step count, not a percentage:

```html
<div role="progressbar"
     aria-label="Tour progress"
     aria-valuenow="2" aria-valuemin="1" aria-valuemax="4"
     aria-valuetext="Step 2 of 4">
```

All four strings — `dialogLabel`, `progressLabel`, `stepOf`, and the button labels — go through the
[i18n registry](/guide/i18n), so they are announced in the user's language:

```ts
gf.i18n.register('fr', {
  dialogLabel: 'Visite guidée',
  progressLabel: 'Progression',
  stepOf: 'Étape {current} sur {total}',
})
gf.i18n.use('fr')
```

## Reduced motion

Under `prefers-reduced-motion: reduce` the library stops the popover entrance animation, the
progress-bar and button transitions, the spotlight cutout's slide between targets, the hotspot
beacon's pulse, and the smooth page scroll — the last two being the ones most likely to cause
trouble, since one animates forever and the other moves the whole viewport.

Two of those are set from JavaScript and cannot be reached by a stylesheet, so this works whether or
not you import `@guideflow/core/styles`.

## Forced colors / High Contrast

Under `forced-colors: active` the popover, buttons and progress bar declare system colour keywords
and let the OS map them. Opacity-based de-emphasis is reset, because opacity is not a colour and
survives the forced palette. The spotlight cutout gains an outline, since the dimmed overlay itself
disappears.

There is also an opt-in high-contrast theme independent of any OS setting:

```html
<html data-gf-high-contrast>
```

## Right-to-left

Set `dir="rtl"` on your document and the popover follows. There is almost nothing RTL-specific in
the stylesheet, and that is deliberate — flexbox and block layout already mirror themselves, so
hand-written `[dir="rtl"]` rules usually undo the browser's correct behaviour rather than fixing it.

Placement follows the CSS logical-property convention:

- `top-start` / `bottom-start` align to the edge text **begins** at — the right edge in RTL
- `left` and `right` stay **physical**, so `placement: 'left'` means left for everyone

## Contrast

The default palette meets WCAG 2.1 AA. If you override the tokens, two constraints carry:

| Token | Constraint |
|---|---|
| `--gf-accent-color` | ≥ 4.5:1 against `--gf-accent-fg` — it is the primary button's background |
| `--gf-muted-opacity` | Raise it if you darken `--gf-popover-bg`; it de-emphasises real text |

```css
:root {
  --gf-accent-color: #0f766e;
  --gf-accent-fg: #ffffff;
}
```

## What you still have to do

**Give every target an accessible name.** The tour points at your elements; it cannot describe them.
A step highlighting an icon-only button announces the popover's text and nothing about what is
being highlighted.

**Do not rely on the spotlight alone to convey meaning.** It is a visual affordance. The step body
has to say what the user is looking at.

**Write step text that stands on its own.** "Click here" is meaningless to someone who cannot see
where "here" is. Name the control.

**`clickThrough` steps are keyboard-reachable.** The focus trap widens to include the highlighted
element, so `Tab` reaches it and `Shift`+`Tab` returns — the same hole the `clip-path` cuts for the
mouse, cut in the tab order — and `aria-modal` is dropped, because on those steps the page provably
is not inert. The widening is exactly one element: everything else stays trapped.

Still worth testing by keyboard, for one reason the library cannot fix for you. `Enter` on a native
`<button>` or `<a href>` synthesises a click; a `<div role="button" tabindex="0">` with an
`onKeyDown` handler does not, so an `advanceOn` click rule will not notice it. Give those steps an
app-dispatched `CustomEvent` instead — see [Advancing on interaction](./advance-on).

**The overlay is not `inert`.** Background content stays focusable and in the accessibility tree.
This is a deliberate trade: making it inert would break `clickThrough` entirely. The focus trap is
what keeps `Tab` out of it — belt to that brace. If your tour never
uses `clickThrough` and you want stricter isolation, apply `inert` to your app root yourself while
a tour is running.

## The checklist widget

`@guideflow/checklist` ships a docked UI, and a shipped surface absent from this page is an
undocumented accessibility claim. What it does:

- **A disclosure, not a dialog.** No `role="dialog"`, no `aria-modal`, and **no focus trap** — a
  persistent docked surface that swallowed `Tab` would be a keyboard trap under WCAG 2.1.2, and a
  second capture-phase trap competing with the renderer's would deadlock the keyboard outright. An
  e2e spec asserts focus can leave the widget in both directions.
- **Hidden and `inert` during a tour.** `visibility: hidden` removes the subtree from the tab
  order *and* the accessibility tree; `inert` is set alongside it, because on a browser without
  `inert` focus would otherwise land on an invisible widget. Its z-index sits below
  `--gf-z-overlay`, so the overlay dims and covers it.
- **Its own polite live region**, outside the panel, announcing the aggregate only — "Invite your
  team, complete. 3 of 5 complete." — never per-item chatter. Announcements are held while a tour
  is up and flushed afterwards, so the two regions never talk over each other.
- **Blocked rows are `aria-disabled="true"`, never `disabled`**, so they stay focusable and can
  describe which item unblocks them — by title, not by internal id.
- **Progress is a count, not a percentage**: `role="progressbar"` with `aria-valuetext` reading
  "3 of 5 complete".
- **Done is a glyph plus visually-hidden text**, never colour alone.
- `prefers-reduced-motion` and `forced-colors` blocks ship inside the widget's own stylesheet, so
  they apply even to consumers who never import `@guideflow/core/styles`. Every de-emphasis is an
  opacity, which is not a colour and therefore survives a forced palette — each one is reset to
  `1` explicitly. `forced-color-adjust: none` is deliberately **not** used.
- **RTL is the browser's job.** `inset-inline-end` plus flexbox; zero `[dir="rtl"]` rules and zero
  JS mirroring.
- Touch targets: launcher ≥ 44 × 44, rows ≥ 44 px tall, every control ≥ 24 × 24.

What is **not** verified: `forced-colors: active` is not emulable in Playwright, so that block is
reviewed rather than tested — and the warning at the top of this page applies here too. No manual
screen-reader pass has been run on the checklist either.

## Custom renderers

If you implement your own [`RendererContract`](/guide/spotlight-popover#custom-renderer), none of the above comes with
it — the focus trap, live region and ARIA wiring all live in the default renderer. At minimum,
reproduce:

- a focus trap and focus restoration around your dialog
- a polite live region announcing each step, outside the element you reuse between steps
- an accessible name on the dialog, and `aria-describedby` for the body
- `setI18n(registry)`, so your strings follow `gf.i18n.use(locale)`

`@guideflow/react`'s `GuidePopover` is a working reference for all four.
