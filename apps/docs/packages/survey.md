# @guideflow/survey

Docked NPS / CSAT card. Guide: [Surveys](/guide/surveys).

```bash
pnpm add @guideflow/core @guideflow/survey
```

Two entry points. `@guideflow/survey` is headless and touches no DOM;
`@guideflow/survey/widget` is the docked card, so a host rendering its own never bundles it.

`@guideflow/core` is a **peer dependency** at `>=0.1.9 <1.0.0`. There is no size budget or CI size
gate on this package in v1 — unlike core, whose gzip number is a headline promise, this is opt-in
weight in a package you choose to install.

## `createSurveys(gf, definitions, options?)`

Reads storage once on construction and subscribes to `tour:start`, `tour:complete` and
`tour:abandon`. It watches route changes only when some definition declares a `urlPattern`.

### `SurveyDefinition`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Storage key for the ask |
| `question` | `string` | **Plain text**, rendered with `textContent` |
| `scale` | `SurveyScale?` | `{ min, max, minLabel, maxLabel }`. Default NPS, `0..10` |
| `followUp` | `SurveyFollowUp?` | Shown only after a score is chosen |
| `thanks` | `string?` | Default `"Thank you."` |
| `dismissible` | `boolean?` | Default `true` |
| `targeting` | `SurveyTargeting?` | `urlPattern`, `audience`, `schedule`, `priority`, `cooldownMs` |
| `version` | `string \| number?` | Bump to ask everyone again, overriding an unelapsed cooldown |

A scale is clamped to 21 values. A hundred-point "scale" is a number input, and rendering it as
radios would produce a hundred tab stops. Reversed bounds are normalised rather than rejected — a
typo with an obvious intent should not take down a host's page.

## `SurveyController`

```ts
subscribe(listener)        // shaped for useSyncExternalStore
getSnapshot()              // referentially stable while nothing changed
getServerSnapshot()        // frozen idle state; SSR and hydration agree
evaluate()                 // score everything; never shows, never writes
select(score)              // choose, without submitting
submit(comment?)           // emit the response, persist, show the thanks
dismiss()                  // close. Records the ask either way, so the cooldown starts
setSurveys(definitions)    // replace the set. Dropping an id records nothing
reset()                    // clear stored asks
refresh()                  // re-read storage; call after context.userId changes
destroy()
```

`select()` ignores a value that is not on the scale: a host driving the controller directly must not
be able to submit a score the question never offered, because that lands in analytics as a real
answer.

`submit()` persists **before** showing the thanks. If the write throws, the person has still
answered and must not be asked again on the next page load.

## Events

```ts
{ type: 'show';     surveyId }
{ type: 'response'; surveyId; score; comment; normalized }
{ type: 'dismiss';  surveyId; answered }
```

A plain callback, deliberately not the `TourEvents` bus. That is also the reason a survey is not a
tour step type: submitting one would emit `tour:complete`, and `@guideflow/analytics` would count
every NPS response as a completed tour.

`normalized` is the score mapped to `0..1`, so a 0–10 NPS and a 1–5 CSAT are comparable without
knowing either scale's bounds.

## `mountSurvey(controller, options?)`

| Option | Type | Default |
|---|---|---|
| `dock` | `'bottom-end' \| 'bottom-start' \| 'top-end' \| 'top-start'` | `'bottom-end'` |
| `nonce` | `string?` | CSP nonce, taken once at mount |
| `strings` | `Partial<SurveyStrings>?` | `region`, `dismiss`, `submit` |
| `container` | `HTMLElement?` | `document.body` |

`bottom-end` is also `mountChecklist`'s default dock and neither package can detect the other — pick
different corners if you mount both.

## Storage

One record per user under the single-segment suffix `'survey'`, on the prefix
`progress.resetUser()` sweeps. `'completed'`, `'caps'`, `'checklist'` and `'banner'` are taken.

Cross-tab writes are last-write-wins, the same limitation `markCompleted` and the frequency caps
carry.

Note this does **not** use `@guideflow/core/targeting`'s cap record: that is keyed by flow id under
targeting's own suffix, so `targeting.resetCaps()` would wipe survey cooldowns, and a survey is not
a flow.

## Related

- [@guideflow/banner](/packages/banner) — the other docked surface
- [@guideflow/checklist](/packages/checklist)
