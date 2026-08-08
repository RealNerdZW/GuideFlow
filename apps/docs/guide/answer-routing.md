---
description: Where survey answers and lead-capture clicks actually go — the onEvent seam, routing a response to your own endpoint, and exactly what the library keeps on the user's device (it is not the answer).
keywords: NPS answers endpoint, survey response webhook, in-app lead capture, guideflow onEvent, survey data storage
---

# Recipe: routing answers to your own endpoint

Someone gives you a 4 out of 10 and a sentence explaining why. That sentence is
the whole value of asking, and it exists for exactly as long as your callback
takes to do something with it.

## The short version

There is no backend. `@guideflow/survey` hands you every answer through one
callback and keeps none of them.

```ts
import { createSurveys } from '@guideflow/survey'
import { mountSurvey } from '@guideflow/survey/widget'

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
  {
    onEvent: (event) => {
      if (event.type !== 'response') return
      void fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          surveyId: event.surveyId,
          score: event.score,
          normalized: event.normalized,
          comment: event.comment,
          userId: currentUser.id,
        }),
      }).catch(() => {
        // Your retry policy, not the library's.
      })
    },
  },
)

mountSurvey(surveys)
```

::: danger An answer nothing listens to is an answer that is discarded
`onEvent` is the only exit. Wire it before you ship, not after the first
promising response has already evaporated.
:::

## The event

Three types, and only one carries an answer:

| `event.type` | Fields | Fires when |
|---|---|---|
| `show` | `surveyId` | the card becomes visible |
| `response` | `surveyId`, `score`, `comment`, `normalized` | the user submits |
| `dismiss` | `surveyId`, `answered` | the card closes, either way |

- `comment` is `undefined` when there is no follow-up, or the user left it empty.
- `normalized` is the score mapped to `0..1`, so a 0–10 NPS and a 1–5 CSAT can be
  compared without your endpoint knowing either scale's bounds.
- `dismiss` fires whenever the card is closed, including when someone closes the
  thank-you after answering — `answered` is what separates the two. Count
  responses off `response`, never off `dismiss`.

`onEvent` is called **synchronously** and the controller wraps it in a
`try/catch`, so a throw cannot break the widget. That catch does **not** cover a
rejected promise — a `fetch` you kick off inside it needs its own `.catch`, or
you get an unhandled rejection and no diagnostic.

## What the library stores

The question people ask second, and the one worth answering before anyone asks
it in a security review.

**Stored, on the user's device, under this package's own storage key:**

```jsonc
{ "v": 1, "asked": { "nps": { "at": 1786694400000, "answeredAt": 1786694431000, "ver": 2 } } }
```

That is: *which survey*, *when they were shown it*, *whether they answered*, and
*which version of the question it was*. Nothing else. Fifty entries maximum,
oldest pruned.

**Not stored, anywhere, ever:** the score, the comment, or any derivative of
either. They exist in the `response` event and in whatever you do with it.

The record is what makes "ask again in 90 days" and "do not ask this person
twice" possible; it does not need the answer to do that, so it does not have it.
`surveys.reset()` clears it, and `progress.resetUser(userId)` sweeps it with
everything else.

::: warning No `userId`, no memory
Without `context.userId` nothing is read and nothing is written: the survey still
renders and still submits, but the suppression lasts the session and the card
returns on reload. `anonymousId: true` mints a first-party identifier instead —
off by default, because this package cannot consult your consent policy.
:::

## Routing through the collector instead

If the answers belong with the rest of your product data, hand them to
[`@guideflow/analytics`](/guide/analytics) rather than writing a second HTTP path:

```ts
import { AnalyticsCollector, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({ userId: currentUser.id })
  .addTransport(new WebhookTransport({ url: '/api/analytics', batchIntervalMs: 5000 }))

createSurveys(gf, definitions, {
  onEvent: (event) => collector.track(`guideflow.survey.${event.type}`, { ...event }),
})
```

You inherit the collector's batching, its `sendBeacon` flush on unload, its
consent gate and its URL scrubbing — none of which a bare `fetch` gives you.

::: warning Redaction is by key name, not by content
The collector drops properties whose **key** looks sensitive — `email`,
`token`, `phone` and similar. A free-text comment is the key `comment`, so a
reply that happens to contain someone's email address travels intact. If your
endpoint is not the right place for that, redact before you track, or do not
collect the follow-up.
:::

## Lead capture

Say the honest thing first: **GuideFlow has no form widget.** No email field, no
multiple choice, no validation, no submit endpoint. A scale with an optional
comment is the entire question surface, and
[a survey is deliberately not a tour step](/guide/surveys) — submitting one
inside the tour funnel would emit `tour:complete` and count every NPS response as
a completed tour.

What exists is the seam to *your* form:

```ts
// A banner action that opens your own modal.
createBanners(gf, [
  {
    id: 'book-a-call',
    title: 'Want a hand migrating?',
    actions: [
      { label: 'Book 20 minutes', variant: 'primary', onSelect: () => openBookingModal(), dismisses: true },
      { label: 'No thanks', dismisses: true },
    ],
    targeting: { audience: { where: { plan: 'trial' } } },
  },
], { onEvent: (e) => collector.track(`guideflow.banner.${e.type}`, { ...e }) })
```

`onSelect` runs your code and wins over `flowId` when both are set. The form,
its fields, its validation and its endpoint are yours — which is the correct
division: a library that stored leads would be holding your prospects' contact
details in a dependency, and one that held a booking-tool key would be holding
your credentials.

A tour step can do the same job in place: mark the step `clickThrough: true` so
the real control underneath stays clickable, and let the user fill in your own
form with the guidance still on screen. Use a selector string for the target on
those steps: with a function target the hole is cut for the mouse and not for
the keyboard — see
[use a selector string for the target](/guide/advance-on#use-a-selector-string-for-the-target).

## Related

- [Surveys](/guide/surveys) — the widget, targeting and accessibility
- [Banners](/guide/banners) — the other non-blocking seam to your own UI
- [Privacy](/guide/privacy) — what leaves the browser, and how to gate it
- [Analytics](/guide/analytics) — transports, batching and consent
