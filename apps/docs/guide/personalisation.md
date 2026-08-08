---
description: Address a product tour to the account it is running in — token variables resolved from the guidance context, with the rule that decides which fields untrusted values may reach and why content.html is not one of them.
keywords: ABM personalization, account based onboarding, personalized product tour, tour variables, guideflow context tokens
---

# Recipe: account-based personalisation

The same six-step tour, addressed to the account it is running in: their
company's name in the first sentence, their plan's limits in the third, the
integration they actually bought named in the fifth.

The mechanism is small — [token variables](/guide/content-variables) written as
<code v-pre>{{token}}</code> and resolved from the guidance context — and the
interesting half of this page is
the boundary around it, because the values routinely come from somewhere you do
not control.

## The tour

```jsonc
{
  "id": "enterprise-onboarding",
  "initial": "welcome",
  "states": {
    "welcome": {
      "label": "Getting started",
      "steps": [
        {
          "id": "hello",
          "target": "#workspace-switcher",
          "content": {
            "title": "Welcome to {{company|your workspace}}",
            "body": "You are on the {{plan}} plan, with {{seats}} seats."
          }
        },
        {
          "id": "integration",
          "target": "#integrations",
          "content": { "title": "Connect {{crm|your CRM}} first" }
        }
      ],
      "on": { "NEXT": "done" }
    },
    "done": { "final": true }
  }
}
```

Nothing in that file is JavaScript, so it survives `guideflow export`, the
[devtools recorder](/packages/devtools), a CMS, and a `fetch`. That is the whole
reason tokens exist: `Step.content` has always accepted a function, and a
function does not serialise.

## The values

```ts
const gf = createGuideFlow({
  context: {
    userId: user.id,
    company: account.name,
    plan: account.plan,
    seats: account.seats,
    crm: account.integrations.crm,      // undefined for most accounts
  },
})
```

The context is the same object [targeting](/guide/targeting#audience) audience
rules read, so "who sees this tour" and "what it says" are answered from one
place.

When it changes — the account is loaded after first paint, the user switches
workspace:

```ts
gf.configure({ context: { ...next } })
await gf.repaint()
```

`repaint()` and not `rerender()`. The latter re-emits `step:enter`, which
[`@guideflow/analytics`](/guide/analytics) counts as a step view, so a workspace
switch would inflate that step's `reached` in `computeFunnel`.

### Missing values

::: v-pre
| Written | With no value in context |
|---|---|
| `{{crm}}` | renders **as written**, visibly |
| `{{crm\|your CRM}}` | renders `your CRM` |
:::

An unresolved token stays visible on purpose. A blank gap in a sentence is the
worse failure, because nobody notices it and it ships. Write the fallback
whenever the value is genuinely optional — which, for account data, is most of
them.

`0` and `false` are values, not misses. They render.

## Security: a URL parameter is attacker-controlled

Campaign links and support links carry values, and a context is routinely
populated from them:

```ts
const params = new URLSearchParams(location.search)
gf.configure({ context: { ...base, company: params.get('company') ?? '' } })
```

That is **safe for `title` and `body`, and only for them** — with one condition
worth stating plainly, because it is the renderer's and not the engine's:

- **Interpolation happens in the engine, before the renderer.** An interpolated
  value is an ordinary string by the time the renderer sees it, and it is
  indistinguishable from the string the flow author typed. `DefaultRenderer`
  escapes `title` and `body` on the way into `innerHTML`, so a value of
  `<img src=x onerror=alert(1)>` becomes those visible characters and nothing
  else.
- **Tokens in `content.html` are never substituted.** They render literally, as
  the characters you typed. That one *is* the engine's guarantee, so it holds
  whatever renders the step.

::: warning The escaping is the renderer's job, not the engine's
Core never assumes the default renderer — a `RendererContract` is a public
extension point, and `@guideflow/react`'s `GuidePopover` is a second
implementation. The engine hands a renderer the resolved strings; nothing in
core can make a custom one escape them.

So if you have written your own renderer, or adopted someone else's, the
sentence above is a claim about **your** code. Render `title` and `body` as text
— `textContent`, or JSX interpolation, both of which escape by default — and
never build markup by concatenating them into a string. If you do interpolate a
token value into markup yourself, you have re-opened exactly the hole the next
section explains.
:::

That second rule is deliberate, and it is worth understanding rather than
working around:

| Source of the string | Trust | May reach `content.html` |
|---|---|---|
| The flow's own content | ships with your app | yes |
| The locale catalogue | a file in your repo, reviewed in a PR | yes |
| A token **value** | runtime, routinely a URL parameter | **no** |

::: danger Why "interpolate, then sanitise" is not good enough
**Attribute context.** Written as an anchor with a token in its `href`, a value
containing a quote closes the attribute *before* the sanitiser parses anything —
so untrusted data shapes the parse tree, and every gap in the sanitiser's
allowlist becomes reachable from a query string.

**And [`sanitizeHTML` is opt-in](/guide/flows-and-steps).** Without it, markup is
escaped and rendered as text. So a pipeline that interpolated into `html` would
expose the configuration a developer chose *believing it was the hardened one* —
the worst possible shape for a security default.
:::

Practical consequences, in order of how often they bite:

1. **Put personalised text in `title` or `body`.** If you find yourself wanting a
   token inside `html`, the sentence wants to be `body`.
2. **Prefer your own session or API over the URL.** A link that can address the
   user by any name it likes is a phishing surface even when it cannot execute
   anything: "Welcome, Accounts Payable — confirm your bank details" is a
   plausible screenshot. Read the account from your session and use the URL only
   for values you would show a stranger.
3. **Never treat a token value as an identifier.** It personalises copy. It does
   not choose a flow, a target, or an endpoint.

## Checking a flow before it ships

`guideflow_extract_strings` on the [MCP server](/guide/mcp) lists every string in
a flow with the tokens found in each field, and reports a token sitting in
`content.html` as a warning — because that one is inert rather than wrong, and
inert is exactly the failure nobody notices.

It returns JSON, not prose: a `tokens` map keyed `steps.<stepId>.<field>`
alongside the catalogue skeleton, plus an `issues` array.

```jsonc
{
  "flowId": "enterprise-onboarding",
  "stringCount": 4,
  "catalogue": { "steps": { /* the strings themselves, to translate in place */ } },
  "tokens": {
    "steps.hello.title": ["company"],
    "steps.hello.body": ["plan", "seats"],
    "steps.legal.html": ["company"]
  },
  "issues": [
    {
      "code": "token-in-html",
      "severity": "warning",
      "path": "steps.legal.html",
      "message": "`content.html` on step \"legal\" contains {{company}}, which the engine never substitutes — only `title` and `body` are interpolated.",
      "hint": "Move the personalised sentence into `body`, or drop the token: it renders to the user literally as written."
    }
  ]
}
```

A field with no tokens has no entry in `tokens`, so the map is the answer to
"which strings are personalised", not a list of every string.

`guideflow_translate_flow` applies the same check to a translation, where the
failure is sharper: a translated sentence that dropped the token renders with
the personalisation quietly missing, in the one language nobody on the team
reads. That is reported as an error, not a warning.

## Translation and personalisation together

The pipeline is `content → locale catalogue → token → renderer`, in that order.
Catalogue first, so a *translated* string containing a token still resolves:

```ts
gf.i18n.registerContent('de', {
  steps: { hello: { title: 'Willkommen bei {{company|Ihrem Workspace}}' } },
})
gf.i18n.use('de')
await gf.repaint()
```

The catalogue may set `html`; a token value may not. The rule is about where the
string came from, not which field it lands in.

## Related

- [Variables & chapters](/guide/content-variables) — the reference for token syntax
- [i18n](/guide/i18n) — the catalogue format
- [Targeting & frequency](/guide/targeting) — deciding who gets this tour at all
- [MCP server](/guide/mcp) — extracting and checking the strings
