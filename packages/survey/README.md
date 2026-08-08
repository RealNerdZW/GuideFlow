# @guideflow/survey

NPS and CSAT for [GuideFlow.js](https://github.com/RealNerdZW/GuideFlow), as a docked card.

It does not dim the page, does not trap focus, and waits while a tour is running.

```bash
npm install @guideflow/survey
```

## Usage

```ts
import { createGuideFlow } from '@guideflow/core'
import { createSurveys } from '@guideflow/survey'
import { mountSurvey } from '@guideflow/survey/widget'

const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })

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

**The answers go to `onEvent` and nowhere else.** There is no backend, so a `response`
event nothing listens to is an answer that is silently discarded.

## What it is

**One question shape**, whose bounds do the work: `{ min: 0, max: 10 }` is NPS,
`{ min: 1, max: 5 }` is CSAT, `{ min: 1, max: 2 }` is a thumbs poll. The response
carries a `normalized` score in `0..1` so a host can compare them without knowing
either scale.

**A follow-up after the score, not before**, so the first thing anyone sees is one
click rather than a form.

**A cooldown, which is what NPS means in practice.** `cooldownMs: 90 * 24 * 3600_000`
asks every ninety days. It is measured from the **ask**, not the answer — someone who
closed the card has also been asked.

**Targeting is core's**: `urlPattern`, `audience` and `schedule` are evaluated by the
same matchers that decide which tour starts.

**Headless if you want it.** `subscribe` / `getSnapshot` / `getServerSnapshot`, with the
card in a separate `/widget` subpath.

## Accessibility

The scale is a real `radiogroup` of real radio inputs, labelled by the question — so
arrow keys move within the group, Tab treats it as one stop, and a screen reader
announces "3 of 11". A row of buttons would look identical and lose all three.

`role="region"` with an accessible name, no `aria-modal`, and **no focus trap**: a
survey does not demand an answer, and a persistent docked surface that swallows Tab is
a keyboard trap under WCAG 2.1.2. The question and the thank-you are announced through
the widget's own polite live region, held while a tour is running.

## Not in v1

- **Multiple choice**, and free-text-only questions. One question shape.
- **Branching.** A follow-up after a score is the whole flow.
- **Auto-dismiss timers.** WCAG 2.2.1 needs pause, stop and extend.
- **Aggregation.** This asks and reports; counting is your collector's job.

## Documentation

Full guide: <https://realnerdzw.github.io/GuideFlow/guide/surveys>

Licence MIT.
