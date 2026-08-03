---
description: NPS and CSAT as a docked, non-blocking card — targeted, cooled down, accessible, and never part of the tour funnel.
keywords: in-app NPS, product survey, CSAT widget, user feedback, guideflow survey
---

# Surveys

NPS, CSAT, or a thumbs poll, as a small card in the corner. It does not dim the
page, does not trap focus, and waits politely while a tour is running.

```bash
npm install @guideflow/survey
```

```ts
import { createGuideFlow } from '@guideflow/core'
import { createSurveys } from '@guideflow/survey'
import { mountSurvey } from '@guideflow/survey/widget'

const gf = createGuideFlow({ context: { userId: currentUser.id, plan: 'pro' } })

const surveys = createSurveys(
  gf,
  [
    {
      id: 'nps',
      question: 'How likely are you to recommend us to a colleague?',
      scale: { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' },
      followUp: { label: 'What is the main reason for your score?' },
      targeting: { cooldownMs: 90 * 24 * 3600_000 },
    },
  ],
  { onEvent: (event) => collector.track(`guideflow.survey.${event.type}`, event) },
)

mountSurvey(surveys)
```

::: danger The answers go to `onEvent` and nowhere else
There is no backend — see [Hosting flows](/guide/hosting-flows) for why. A
`response` event nothing listens to is an answer that is silently discarded.
Wire it to your collector before you ship.
:::

## One question, three shapes

`scale` is the only question type, and its bounds do the work:

| | `scale` |
|---|---|
| **NPS** | `{ min: 0, max: 10 }` *(the default)* |
| **CSAT** | `{ min: 1, max: 5 }` |
| **Thumbs** | `{ min: 1, max: 2 }` |

Multiple choice is deliberately absent: it is a different widget with different
keyboard semantics, and nothing has asked for one yet.

`normalized` on the response is the score mapped to `0..1`, so a host can
compare a 0–10 NPS with a 1–5 CSAT without knowing either scale's bounds.

## The follow-up

An NPS number with no comment is a metric nobody can act on. The follow-up
appears **after** a score is chosen, so the first thing the reader sees is one
click rather than a form:

```ts
followUp: { label: 'What is the main reason for your score?', placeholder: 'Optional' }
```

Submitting is an explicit button. Auto-submitting on selection would be one
fewer click and would also fire once per arrow key as a keyboard user moves
through the scale.

## Asking again

This is what NPS means in practice, and it is one field:

```ts
targeting: { cooldownMs: 90 * 24 * 3600_000 }   // every 90 days
```

Omit it and asking once is final.

The cooldown is measured **from the ask, not from the answer**. Someone who
closed the card without answering has also been asked, and re-asking them
tomorrow is the behaviour people uninstall over.

Bumping `version` asks everyone again immediately, overriding a cooldown that
has not elapsed — a genuinely different question should not wait out the old
one's timer. Reword a typo without bumping it; bump it when the meaning changed.
Only you can tell those apart.

::: warning No `userId`, no memory
Without `context.userId` the suppression lasts the session and the survey
returns on reload. `anonymousId: true` mints a first-party identifier instead —
off by default, because this package cannot consult your consent policy.
:::

## Who sees it, where, and when

The same `urlPattern`, `audience` and `schedule` that decide which tour starts,
evaluated by the same matchers:

```ts
targeting: {
  urlPattern: '/app/**',
  audience: { where: { plan: 'pro' } },
  schedule: { startsAt: '2026-09-01' },
  priority: 5,
}
```

One survey shows at a time — the highest-priority eligible one, ties keeping
registration order.

::: tip Why isn't my survey showing?
```ts
console.table(surveys.evaluate())
// [{ survey: {…}, eligible: false, priority: 0, blockedBy: ['answered'] }]
```
`blockedBy` uses targeting's vocabulary plus `'answered'`, which covers both
"already answered" and "still inside the cooldown".
:::

## Accessibility

- The scale is a real `radiogroup` of real radio inputs, labelled by the
  question. That buys the correct keyboard model for free: arrow keys move
  within the group, Tab treats it as one stop, and a screen reader announces
  "3 of 11". A row of buttons would look identical and lose all three.
- `role="region"` with an accessible name — a landmark, findable after it
  appears and escapable once found. **No `role="dialog"`, no focus trap**: a
  survey does not demand an answer, and a persistent docked surface that
  swallows Tab is a keyboard trap under WCAG 2.1.2.
- The question and then the thank-you are announced through the widget's own
  visually-hidden polite region, held while a tour is running and released when
  it ends.
- Every target is at least 44 px (WCAG 2.5.8). An eleven-point row wraps on a
  narrow card, which is correct — shrinking the targets to fit would fail the
  criterion to save a line.
- Choosing a score never rebuilds the radios, so focus is not dropped
  mid-interaction.

::: warning Verified by axe and by assertion, not by ear
No manual NVDA or VoiceOver pass has been run against GuideFlow. A survey adds a
**fourth** polite live region to a page that may already have the tour
renderer's, the [checklist](/guide/checklist)'s and the
[banner](/guide/banners)'s. The structure is right; how they sound together has
not been heard by anyone.
:::

## Docking

`bottom-end` by default, which is the conventional NPS position — and also
`mountChecklist`'s default dock. Neither package can detect the other, so give
them different corners if you mount both:

```ts
mountSurvey(surveys, { dock: 'bottom-start' })
```

Its z-index token sits below every other docked surface, because a survey is the
least urgent thing on the page:

```css
:root { --gf-z-survey: 99994; }
```

## What it will not do

- **No multiple choice, no free-text-only question.** One question shape.
- **No branching.** A follow-up appears after a score; that is the whole flow.
- **No auto-dismiss timer.** WCAG 2.2.1 needs pause, stop and extend, and a
  reader working at their own pace loses the card mid-sentence.
- **No aggregation.** This asks and reports. Counting is your collector's job.

## Related

- [Banners](/guide/banners) — the other docked, non-blocking surface
- [Targeting](/guide/targeting) — the rules this shares
- [Analytics](/guide/analytics) — where to send the answers
