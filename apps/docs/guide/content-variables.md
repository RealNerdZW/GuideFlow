---
description: Personalise GuideFlow step copy with {{token}} variables resolved from the guidance context, and name each section of a tour with chapter labels. Both work in a static .flow.json.
keywords: product tour personalization, GuideFlow variables, tour chapters, dynamic tour content, flow file
---

# Variables and chapters

## Why these exist

`Step.content` has always accepted a function, so a tour written **in code** could
already personalise itself:

```ts
{ id: 'welcome', content: () => ({ title: `Welcome back, ${user.firstName}` }) }
```

A function does not serialise. So the moment a tour lives in a `.flow.json` — what
the [devtools recorder](/packages/devtools), the [MCP server](./mcp) and
`guideflow export` all produce, and what [hosting flows](./hosting-flows) is built
on — its copy is frozen in one language with no personalisation, and changing a
word needs a deploy.

`{{tokens}}` are the serialisable half.

## Tokens

```jsonc
{
  "id": "welcome",
  "content": {
    "title": "Welcome back, {{firstName}}",
    "body": "You are on the {{plan|free}} plan."
  }
}
```

Values come from the **guidance context** — the same object your targeting
audience rules read:

```ts
const gf = createGuideFlow({
  context: { userId: 'u_123', firstName: 'Ada', plan: 'pro' },
})
```

| Form | Meaning |
|---|---|
| `{{plan}}` | the value at `context.plan` |
| `{{user.name}}` | a dotted path, for a nested context |
| `{{plan\|free}}` | a fallback, used when the value is `null` or `undefined` |
| `{{nope}}` with no value | **left as written** |

An unresolved token stays visible on purpose. A blank gap in a sentence is the
worse failure, because nobody notices it and it ships.

`0` and `false` are values, not misses — they render.

Change the context at runtime with `gf.configure({ context })`; the next render
picks it up, and `await gf.repaint()` moves the step already on screen.

Use `repaint()` rather than `rerender()` — the latter re-emits `step:enter`, so
your analytics would record a second view of a step the user never left.

### Safety

Interpolation happens in the engine, **before** the renderer, so every value
leaves through the same escaping every other string does. A context value of
`<img src=x onerror=alert(1)>` renders as those visible characters.

::: warning `content.html` is not interpolated
Deliberately. "Interpolate then sanitise" is safe for element content but not for
attribute context — in `<a href="/r?next={{to}}">` a value carrying a quote closes
the attribute *before* the sanitiser parses anything, so untrusted data would
shape the parse tree. And [`sanitizeHTML` is opt-in](./security), which would make
the exposed configuration the one you chose believing it was the hardened one.

Tokens in `content.html` are left as written. Put personalised text in `title` or
`body`.
:::

A context is routinely populated from URL parameters. That is fine for `title` and
`body`, and it is the reason for the rule above.

## Chapters

A long tour crossing several states renders "Step 7 of 12" and nothing saying
*which part* the user is in. Give the state a label:

```jsonc
{
  "initial": "basics",
  "states": {
    "basics":   { "label": "Getting started", "steps": [ /* … */ ], "on": { "NEXT": "billing" } },
    "billing":  { "label": "Billing",         "steps": [ /* … */ ], "final": true }
  }
}
```

The label renders above the step title, and a custom `RendererContract` receives
it as the fifth argument to `renderStep`.

**A state already is a chapter** — this is a name for one, not a second grouping
concept. Do not model chapters as steps or as transitions; the flow-wide step
counter walks the `NEXT` path, and anything that moves a state off that walk
breaks the "Step 7 of 12" numbering.

Labels are translatable through the same catalogue as step copy:

```ts
gf.i18n.registerContent('es', { states: { billing: 'Facturación' } })
```

## Putting it together

A single `.flow.json`, plus one catalogue per language, gives you a tour that is
personalised, translated and sectioned — with no JavaScript in the flow at all:

```ts
const flow = await fetch('/tours/onboarding.flow.json').then((r) => r.json())
const es = await fetch('/tours/onboarding.es.json').then((r) => r.json())

gf.i18n.registerContent('es', es)
gf.i18n.use(navigator.language.startsWith('es') ? 'es' : 'en')
gf.createFlow(parseFlowFile(flow))
```

The catalogue is applied first and tokens second, so a translated string
containing `{{firstName}}` resolves correctly. See [i18n](./i18n) for the
catalogue format.
