# Security model (internal)

The engineering-facing companion to the public [`SECURITY.md`](../../SECURITY.md). This document
states the trust boundaries and the rules that follow from them. Read it before touching the
renderer, the extension, `@guideflow/ai`, or the CLI.

Findings referenced here live in [`AUDIT.md`](AUDIT.md) §Security.

---

## 1. Trust boundaries

GuideFlow runs *inside* someone else's application, with their DOM, their users, and their data.
There are five boundaries, and only the first is trusted.

| # | Boundary | Trust | Enters the system at |
|---|---|---|---|
| 1 | Flow definitions written in the host app's own source | **trusted** | `createFlow()`, `start()` |
| 2 | Flow definitions fetched over the network — CMS, `guideflow push`, devtools recorder | **untrusted** | `content.html`, `step.actions[].action`, `step.target` |
| 3 | The host page's DOM | **untrusted** | `serializeDOM()`, `autoInit()`'s `data-gf-*` attributes |
| 4 | LLM provider responses | **untrusted** | `validateSteps()`, `validateGuidedAnswer()` → selectors and rendered text |
| 5 | Page-world ↔ extension message channel | **untrusted** | `window.postMessage` in `bridge.ts` / `inspector.ts` |

Data that has crossed 2–5 must be treated as attacker-controlled at every subsequent sink, no matter
how many functions it has passed through.

---

## 2. Rendering — the primary sink

`DefaultRenderer.renderStep()` does `el.innerHTML = this._buildHTML(...)`. That single line is the
highest-value target in the codebase.

### Rules

1. **Text goes through `_esc()`.** Every interpolated value that is not deliberately HTML must be
   entity-escaped. Audit finding: `step.actions[].action` and `a.variant` are interpolated into
   attributes **unescaped** — a flow from boundary 2 can break out of the attribute.
2. **`content.html` is the only HTML path,** and it is the one that must be genuinely sanitised.
3. **The current sanitiser is not a security boundary.** `_sanitizeHTML()` is a regex denylist. It
   was empirically defeated by 6 of 8 trivial payloads:

   | Payload class | Why it survives |
   |---|---|
   | `<iframe src=javascript:alert(1)>` | the scheme regex requires a **quote** after `=` |
   | `<a href=javascript:alert(1)>` | same |
   | `<a href="jav&#x61;script:...">` | the literal text is not `javascript:`; the browser decodes the entity at parse time |
   | `<script src=//evil/x.js>` (unclosed) | the tag-stripping regexes require a matching closing tag |
   | `<svg><a xlink:href=javascript:...>` | `xlink:href` is not in the attribute list |
   | `style="background:url(javascript:...)"` | `style` is not filtered at all |

   Regex denylists cannot be fixed by adding more regexes. Every added pattern is one more thing an
   attacker enumerates around.

### The correct fix, within the zero-dependency constraint

`core` cannot take a DOMPurify dependency (ADR-002 — it is ~20 kB against a 12 kB budget). Ranked
options:

1. **Build the DOM, don't build a string.** Replace `_buildHTML` + `innerHTML` with
   `createElement`/`textContent`/`setAttribute`. This eliminates the escaping problem for everything
   *except* `content.html`, and is the change that should happen regardless.
2. **Parse-and-allowlist for `content.html`.** `new DOMParser().parseFromString(html, 'text/html')`,
   walk the tree, drop any element not on a small allowlist (`p b i em strong ul ol li a code br span
   img h1-h6`), drop any attribute not on a per-element allowlist, and validate `href`/`src` against
   `^(https?:|mailto:|\/|#)` **after** resolving with `new URL()`. This is ~60 lines and costs well
   under 1 kB.
3. **Or move `content.html` behind an opt-in subpath** (`@guideflow/core/html`) that ships a real
   sanitiser, and make `content.html` a no-op in the default build. Honest, and cheapest to secure.

Until one of these lands, `SECURITY.md` must keep telling integrators that `content.html` is not a
security boundary.

---

## 3. Selector sinks

`step.target` and `GuidedAnswer.highlights` reach `document.querySelector()`. This is not XSS — CSS
selectors do not execute script — but:

- An invalid selector makes `querySelector` **throw**. From boundary 4 (model output) that is an
  unhandled exception on a code path with no `try`.
- A selector is an oracle: `:has()` and attribute selectors let attacker-supplied strings probe page
  structure. Low severity, worth knowing.

Rule: wrap every `querySelector` fed by boundary 2–4 data in a try/catch and treat a throw as
"no target".

---

## 4. Attribute-tour compatibility

`intro-compat.ts` reads `data-gf-show-if` and walks it as a property path, gated by
`/^[a-zA-Z_$][a-zA-Z0-9_$.]*$/`. The regex correctly blocks call syntax, so this is **not** an eval.

Residual risks to keep in mind: the path can name `constructor` or `__proto__` and walk the prototype
chain, and it can invoke a getter with side effects. Both require the attacker to already control
page markup (boundary 3), and the result is only coerced to a boolean. Acceptable today; add a
segment denylist (`__proto__`, `constructor`, `prototype`) when convenient.

---

## 5. The devtools extension

This is the sharpest boundary in the project, because the extension holds privileges the page does
not.

### The bridge is a public channel

`bridge.ts` runs in the **page world** and communicates with `window.postMessage(msg, '*')`. Its
listener accepts anything whose `data.source` equals the string `'__gf_content__'`.

Both directions are therefore open to any script on the page:

```js
// any third-party script, ad, or injected payload on the host page:
window.addEventListener('message', e => {
  if (e.data?.source === '__gf_bridge__') exfiltrate(e.data);   // read every tour event
});
window.postMessage({ source: '__gf_content__', type: 'GF_START_TOUR',
                     payload: attackerFlow }, '*');             // forge commands
```

A string constant is not authentication.

### Rules

1. **Assume everything from the bridge is hostile.** Validate shape and type on arrival; never pass a
   payload straight into a privileged API.
2. **Never render page-derived strings into the panel or popup via `innerHTML` /
   `dangerouslySetInnerHTML` / an `href` or `src` sink.** The panel is extension-privileged; XSS
   there is privilege escalation.
3. **Validate `sender` in every `chrome.runtime.onMessage` handler** — check `sender.tab` and
   `sender.id`.
4. **Never `chrome.scripting.executeScript` a page-derived string.**
5. Narrow `host_permissions`. `<all_urls>` plus a content script on `<all_urls>` plus `tabs` is the
   maximum-blast-radius configuration; scope it to `activeTab` + explicit user action where possible.
6. Declare a `content_security_policy` in the manifest.

### Hardening the channel

Ordered by effort:

- Use a concrete `targetOrigin` instead of `'*'` on every post.
- Have the injector generate a per-page-load random nonce, pass it to the bridge via the script tag's
  `data-` attribute, and require it on every message. This stops forgery from scripts that load
  later, though not from a script that can read the DOM.
- Ultimately, treat the page as untrusted regardless — the nonce raises the bar, it does not make the
  channel private. Never send anything through it that the page should not see.

---

## 6. `@guideflow/ai`

### API keys

Provider options accept `apiKey`, defaulting to `process.env`. The README example passes
`import.meta.env.VITE_OPENAI_KEY` — a **client-bundle** variable, i.e. published to every visitor.

Rules:

1. The **documented default** must be a server-side proxy. Browser-direct usage is the advanced,
   caveated path.
2. Ship a `ProxyProvider` that posts to the host app's own endpoint, so the correct thing is also the
   easy thing.
3. If a provider is constructed in a browser with a key present, warn loudly at runtime.
4. `MockProvider` should be the default in examples and the demo.

### Data egress

`serializeDOM()` sends up to 80 elements to a third party: `window.location.href` (query strings
routinely carry session tokens and ids), `document.title`, and per element a selector, role, geometry,
and a **label derived from `textContent`** (any text up to 80 characters) or `placeholder`.

It does *not* read input `value`s — that is the one thing it gets right.

It nonetheless means arbitrary page text — names, balances, order numbers, email addresses rendered
in a heading or table cell — leaves the user's browser for an LLM vendor, with **no redaction, no
allowlist, no consent gate, and no opt-out**. That is a data-processing decision the integrator must
make knowingly.

Required work: a redaction hook, a `[data-gf-private]` skip attribute, an opt-in element allowlist,
a documented DPA position, and `url` reduced to origin + path by default.

### Prompt injection

Page content (boundary 3) is serialized into the prompt; model output (boundary 4) becomes selectors
and displayed text. A hostile page can attempt to steer generation. `validateSteps()` limits the blast
radius usefully — it keeps only `id`, `title`, `body`, `target` and a whitelisted `placement`, and
notably **drops `actions`, `html`, `meta` and `showIf`** — so model output cannot currently reach the
HTML sink. Preserve that property: if you extend `validateSteps` to pass more fields through, you are
connecting boundary 4 to the renderer, and the sanitiser has to be fixed first.

### Cost as availability

`GuideBrain.watch()` issues one LLM call per user pause, with no cap, cooldown, or budget. A page with
a busy interaction pattern bills the integrator continuously. Rate limiting is a security control here,
not just a feature.

---

## 7. `@guideflow/analytics`

Every event carries `url` and `referrer`. Those are the most reliable PII carriers on the web
(`?email=`, `?token=`, `/orders/12345`).

Required: a consent gate before any transport fires, a Do-Not-Track check, a URL-scrubbing hook with
a sane default (strip query and fragment), sampling, and documentation of exactly what each transport
sends where.

`WebhookTransport`'s `apiKey` becomes an `Authorization: Bearer` header **from the browser** — it is
public by construction. Document it as a low-privilege ingest token, never a real API key.

---

## 8. CLI

- `init` and `export` write files at user-supplied paths. Resolve, confine to the project root, and
  never overwrite without a prompt or `--force`.
- `push --api-key <key>` puts a credential in shell history and process listings. Prefer
  `GUIDEFLOW_API_KEY`, and make that path actually reachable (today `--api-key` is a
  `requiredOption`, so the env-var fallback can never run).
- `push --endpoint` accepts any URL. At minimum warn on non-HTTPS.
- `studio` starts a Vite dev server over the user's project root. Bind to `127.0.0.1`, never
  `0.0.0.0`, and say so in the docs.

---

## 9. Supply chain

Current gaps, all in `.github/workflows/`:

- No npm **provenance** (`--provenance` + `id-token: write`).
- No dependency review, no `npm audit`, no Dependabot, no CodeQL.
- `files` includes `src`, so source headers — including a personal email address — are published to
  npm. Decide whether that is intended.
- No lockfile-integrity or `npm pack --dry-run` verification before publish.

---

## 10. Review checklist

Before merging anything that touches a boundary:

- [ ] Every value interpolated into HTML is escaped or allowlist-sanitised
- [ ] Every `querySelector` fed by untrusted data is inside a try/catch
- [ ] No new message type crosses the extension bridge without shape validation
- [ ] Nothing page-derived reaches an extension-privileged DOM sink
- [ ] No API key path leads to a client bundle
- [ ] No new field is added to `validateSteps` output without checking where it lands
- [ ] Any new data leaving the browser is enumerated in `SECURITY.md`
- [ ] New network calls are bounded — timeout, abort signal, retry cap
