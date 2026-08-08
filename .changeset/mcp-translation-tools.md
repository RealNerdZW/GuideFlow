---
"@guideflow/mcp": minor
---

**`guideflow_extract_strings` and `guideflow_translate_flow` — localisation with no translation
service, no key and no network.**

The catalogue seam shipped with 8.4: per-locale copy lives *beside* the flow, keyed by step id and
state id, and untranslated keys fall through to the flow's own content. What was missing was
everything around it — you had to read the state machine by eye to write the skeleton, and once a
translation came back nothing checked it.

```
guideflow_extract_strings → translate the values in place → guideflow_translate_flow → save
```

**Neither tool calls a model.** ADR-019's inversion, applied to translation: your MCP client
translates with its own credentials and a human reviews the diff, which is cheaper, safer and more
reviewable than an AI call in an end user's browser. Both are `readOnlyHint: true`, both write no
file, and the package still makes no network calls.

**`guideflow_extract_strings`** emits the `ContentCatalogue` skeleton from a `path`, a `flowId`, or
a flow inline. Values are the **original** copy rather than blanks, so the file diffs source against
translation. It walks every state, not just the ones on the `NEXT` path — a state reachable only by
a custom transition still has copy in it. It also returns a `tokens` map naming what each string has
to keep, and refuses a flow that does not validate: a catalogue keyed on ids the engine would reject
matches nothing at runtime, in silence.

**`guideflow_translate_flow`** checks a filled catalogue against its flow and reports the ways a
translation is wrong *without throwing, logging, or failing a test in the host application*:

- **`token-lost`** — the check that pays for the tool. The pipeline is
  content → catalogue → `{{token}}` → renderer, catalogue **first**, precisely so a translated
  string carrying `{{firstName}}` still resolves. The corollary is that a translation which dropped
  it renders a sentence with the personalisation missing, in one locale, for as long as nobody on
  the team reads that locale. Token **names** are compared, not the written form: the fallback in
  `{{plan|your plan}}` is copy, so translating it is correct and is not flagged.
- **`unknown-step` / `unknown-state`** — the entry is never read. Step ids and state ids are
  separate namespaces, so a step id used as a chapter-label key reaches nothing.
- **`field-not-in-original`** — `{ ...content, ...override }` *adds* the field, so the line exists in
  that locale and no other.
- **`empty-override`** — an empty string is a value, so it blanks the copy rather than falling
  through to the original.

Plus `unknown-field`, `token-invented`, `token-in-html` (only `title` and `body` are interpolated —
ADR-022 — so a token written into `html` reaches the user literally), `translation-unchanged` and
`state-label-not-in-original`. An incomplete translation is a **warning**, never an error: a missing
key falls through to a working page in the wrong language. `fileContents` is withheld when there are
errors.

There is deliberately no `duplicate-step-id` here, though the core validator has one. Both tools
refuse a flow `validateFlow` rejected — a catalogue keyed on ids the engine would reject matches
nothing, silently — and `duplicate-step-id` is an **error** there, so a warning in the catalogue
engine could never fire. `coverage.translated` counts only supplied values that resolve to a string
the flow actually has, so it can never exceed `coverage.total`; and every lookup by a catalogue key
is an own-property check, so a `states` entry called `toString` is an `unknown-state` rather than a
hit on `Object.prototype`.

The `{{token}}` pattern is a deliberate copy of core's `interpolate.ts`, since neither it nor
`interpolate` is exported from any subpath and a byte budget says they should not be.
`catalogue-drift.test.ts` compares the two literals — a copy that drifts fails in the quiet
direction, reporting no loss for a token the engine would have substituted.

The mcp coverage ratchet goes 90/90/85/90 → 97/97/87/95. Separately: `banner`, `survey` and `mcp`
carried threshold ratchets that CI's coverage job never ran, so three of them were decorative. All
three are in the loop now, and all three pass as measured.
