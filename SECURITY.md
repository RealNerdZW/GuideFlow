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

`StepContent.html` is rendered as HTML. The default renderer applies a **best-effort** sanitizer, but
it is a regex denylist and is known to be bypassable — do not rely on it as a security boundary.

**Only pass HTML you fully control.** If step content can be influenced by end users, a CMS, or a
model, use `content.body` (which is entity-escaped) or sanitise with a real sanitizer such as
DOMPurify before handing it to GuideFlow.

Hardening the sanitizer to an allowlist parser is tracked work.

### Content Security Policy

GuideFlow injects `<style>` elements. Pass your CSP nonce so it does not require `unsafe-inline`:

```ts
createGuideFlow({ nonce: window.__CSP_NONCE__ })
```

If you would rather manage styles yourself, set `injectStyles: false` and import
`@guideflow/core/styles`.

### API keys and `@guideflow/ai`

**Do not ship an LLM API key to the browser.** Provider options accept an `apiKey`, and some
documentation examples read it from a client-side bundle variable — that pattern exposes the key to
every visitor.

Run the provider on your server, or point it at a proxy you control that holds the key and enforces
rate limits and spend caps.

Also be aware that `serializeDOM()` sends a snapshot of the current page — structure and text — to
your chosen LLM provider. On any page containing personal or regulated data, that is a data-processing
decision you must make deliberately, with the appropriate legal basis and disclosure.

### `@guideflow/analytics`

Events include the current `url` and `referrer`, which routinely carry identifiers and tokens in query
strings. There is currently no built-in consent gate or PII scrubbing — gate collection behind your
own consent mechanism and strip sensitive parameters before they reach a transport.

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
