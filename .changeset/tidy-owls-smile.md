---
"@guideflow/checklist": minor
---

**The checklist can now be a help centre, so there is no separate package for one.**

Four additions, which with the existing `hideWhenComplete: false` make a permanent, grouped,
link-carrying resource launcher:

- **`ChecklistItem.href`** renders a real `<a>` instead of a button. `onActivate` could always open
  a page and it still would not be a link — no middle-click, no ctrl-click, no "copy link address",
  no `link` role. Only `http:`, `https:` and `mailto:` survive; anything else renders as plain text,
  because the item list may be author-supplied content.
- **`ChecklistItem.group`** derives section headings from the values present, ungrouped rows first.
  The heading `<li>` carries `role="presentation"` so it does not inflate the list's item count.
- **`ChecklistDefinition.dismissible`** — a help launcher the user summoned has nothing to get out
  of the way.
- **`ChecklistDefinition.showProgress`** — `role="progressbar"` over a list of help articles is a
  lie an assistive technology reads out as a percentage.

```ts
createChecklist(gf, {
  id: 'help', title: 'Help & guides',
  hideWhenComplete: false, dismissible: false, showProgress: false,
  items: [
    { id: 'tour', title: 'Product tour', flowId: 'onboarding', group: 'Guided' },
    { id: 'docs', title: 'Documentation', href: 'https://example.com/docs', group: 'Reading' },
  ],
})
```

A separate `@guideflow/resource-centre` was designed and deliberately not built: ~1,500 of its
~1,900 lines would have been a near-copy of this widget, and the audit finding it was meant to close
asks for *one* adjacent primitive, not four. See ADR-023.
