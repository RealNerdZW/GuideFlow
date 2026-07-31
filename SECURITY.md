# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately via GitHub's [Security Advisories](https://github.com/RealNerdZW/GuideFlow/security/advisories/new)
on this repository. That opens a private channel with the maintainer.

Please include:

- affected package(s) and version(s)
- the vulnerability class (XSS, injection, data exposure, privilege escalation, …)
- a minimal reproduction — a flow definition, a payload, or a page snippet
- what an attacker gains
- any suggested fix

**Response targets** (best-effort; this is a small open-source project):

| Stage | Target |
|---|---|
| Acknowledgement | 3 business days |
| Initial assessment | 10 business days |
| Fix for a critical issue | 30 days, or a documented mitigation |

Please give us a reasonable window before public disclosure. Reporters are credited in the advisory
unless they ask not to be.

---

## Supported versions

GuideFlow is pre-1.0. Only the **latest published minor** receives security fixes.

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

---

## Security model — what GuideFlow assumes

GuideFlow renders UI *inside your application*, on top of your DOM, using content you supply. That
puts a few responsibilities on the integrator.

### Treat these inputs as untrusted

| Input | Why |
|---|---|
| Flow definitions fetched from a server or CMS | they reach `content.html` and `step.actions` |
| Flows produced by the devtools recorder or `guideflow push` | same path, plus selectors |
| LLM responses via `@guideflow/ai` | model output becomes selectors and displayed text |
| Values already in `localStorage` / IndexedDB | another script, or the user, can edit them |
| `data-gf-*` attributes in the page (`autoInit`) | if any part of your page is user-generated |

### `content.html`

`StepContent.html` is rendered as HTML. It is parsed into an inert `<template>` and reduced to an
explicit **allowlist** of elements, attributes and URL schemes — anything unrecognised is dropped
rather than patched, so a vector nobody anticipated fails closed.

**Permitted:** common text and structural elements, plus `<a>`, `<img>` and tables.

**Removed:** `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<base>`, `<svg>`,
`<math>`, every `on*` handler, every namespaced attribute (`xlink:href`, `xml:*`), the `style`
attribute, and any `href`/`src` whose scheme is not `https`, `http`, `mailto`, `tel` or relative.
Anchors with `target="_blank"` gain `rel="noopener noreferrer"`.

This replaced a regex denylist that a direct test defeated with 6 of 8 trivial payloads.

It is still defence in depth, not a licence: prefer `content.body`, which is entity-escaped, for
anything a user, a CMS or a model can influence.

### Content Security Policy

GuideFlow injects `<style>` elements. Pass your CSP nonce so it does not require `unsafe-inline`:

```ts
createGuideFlow({ nonce: window.__CSP_NONCE__ })
```

If you would rather manage styles yourself, set `injectStyles: false` and import
`@guideflow/core/styles`.

### API keys and `@guideflow/ai`

**Do not ship an LLM API key to the browser.** A key in client code is compiled into your bundle and
readable by every visitor. No configuration changes that.

Use `ProxyProvider`, which holds no credential and POSTs to an endpoint you run:

```ts
createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), gf)
```

Your endpoint holds the key and can enforce authentication, rate limits and spend caps. Constructing
`OpenAIProvider` or `AnthropicProvider` with a key in a browser logs a one-time warning. See
[the guide](apps/docs/guide/ai-proxy.md).

`serializeDOM()` sends a snapshot of the current page — structure and text, though **not** input
values — to your chosen provider. Exclude anything sensitive with `data-gf-private`; password inputs
are always excluded. On any page containing personal or regulated data this is a data-processing
decision you must make deliberately, with the appropriate legal basis and disclosure.

### `@guideflow/analytics`

Events include `url` and `referrer`, which routinely carry identifiers and tokens in query strings.
Defaults are now conservative: **query strings and fragments are stripped** (`urlMode: 'path'`), Do
Not Track is honoured, and sensitive property keys are redacted. Gate collection behind your consent
mechanism with `privacy: { consent: false }` plus `collector.setConsent(true)`.

`WebhookTransport`'s `apiKey` is sent from the browser and is therefore public by construction —
treat it as a low-privilege ingest token, never a real API key.

See [the privacy guide](apps/docs/guide/privacy.md) for the full field-by-field breakdown.

### The devtools extension

`@guideflow/devtools` is a **development tool**. It requires broad host permissions and relays tour
events over `window.postMessage`, which any script on the page can observe. Do not run it while
browsing sensitive applications, and do not treat it as safe for end users.

---

## Out of scope

- Vulnerabilities in the host application's own markup or CSP configuration
- Issues that require an attacker to already control the application's source
- Rendering unsanitised third-party HTML that the integrator passed in deliberately
- Denial of service by supplying a deliberately pathological flow definition
- Security of an LLM provider's own service
