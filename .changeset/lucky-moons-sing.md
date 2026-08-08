---
"@guideflow/core": minor
---

**Variables, content localisation and chapters — one content pipeline.**

`Step.content` has always accepted a function, so a tour written *in code* could
personalise and localise itself. A function does not serialise, so the moment a tour lived in a
`.flow.json` — what the recorder, the MCP server and `guideflow export` all produce, and what the
whole static-asset delivery model is built on — its copy was frozen in one language with no
variables, and changing a word needed a deploy. `I18nRegistry` translated eleven chrome strings and
nothing else.

```jsonc
{ "id": "welcome", "content": { "title": "Welcome back, {{firstName}}", "body": "On the {{plan|free}} plan." } }
```

```ts
gf.i18n.registerContent('es', {
  steps:  { welcome: { title: 'Bienvenido de nuevo, {{firstName}}' } },
  states: { billing: 'Facturación' },
})
```

```jsonc
{ "states": { "billing": { "label": "Billing", "steps": [ /* … */ ] } } }
```

One pipeline, in the engine, in this order: **content → locale catalogue → `{{token}}` →
renderer**. That order is why the three shipped together — a *translated* string containing
`{{firstName}}` only resolves if the catalogue is applied first. Resolution happens before
`renderStep`, so a custom `RendererContract` receives finished content and needs to know none of it
exists.

The catalogue sits beside the flow rather than inside `StepContent`: a `.flow.json` is unchanged, a
translator gets a file of strings instead of your state machine, and untranslated keys fall through
per field so a partial translation degrades one string at a time. `steps` and `states` are separate
maps because step ids and state ids are separate namespaces.

**`content.html` is deliberately not interpolated.** "Interpolate then sanitise" is safe for element
content and not for attribute context — in `<a href="/r?next={{to}}">` a value carrying a quote
closes the attribute before the sanitiser parses anything. The catalogue may still translate `html`,
because a translation file is the same trust level as the flow file beside it. The rule is about
where data came from, not which field it is in.

`RendererContract.renderStep` gains an optional fifth argument, the chapter label. Additive — a
renderer that ignores it still satisfies the interface.

Seventh size raise, 15.5 → 16 kB, measured **15.68 kB** (ADR-022). A 330 B "saving" was available by
moving the `fromTailwind`/`fromRadix`/`fromShadcn` re-exports off the entry, and was declined: real
consumers already tree-shake those, so it would have changed the number without changing what
anyone downloads.
