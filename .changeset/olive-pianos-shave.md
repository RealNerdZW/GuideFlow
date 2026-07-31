---
"@guideflow/core": minor
"@guideflow/analytics": minor
"@guideflow/ai": minor
---

Security: replace the HTML sanitiser, escape attribute interpolations, and add
privacy controls.

**`@guideflow/core` — `content.html` is now genuinely sanitised.**

The previous sanitiser was a regex denylist that a direct test defeated with 6
of 8 trivial payloads: unquoted `javascript:` schemes, unclosed `<script>`
tags, HTML-entity-encoded schemes, `xlink:href`, `style` URLs and mXSS via
nested tags all passed through. Regex denylists run before the HTML parser, so
they never see what the parser will actually produce.

`content.html` is now parsed into an inert `<template>` and reduced to an
explicit allowlist of elements, attributes and URL schemes. Anything
unrecognised is dropped rather than patched, so an unanticipated vector fails
closed. Anchors with `target="_blank"` gain `rel="noopener noreferrer"`.

**This is a behaviour change.** Markup outside the allowlist — `<svg>`,
`<iframe>`, `<style>`, `style=` attributes, custom elements — is now removed
from `content.html` rather than passed through. Allowed: common text and
structural elements plus `<a>`, `<img>` and tables. If you were relying on
richer markup, render it with a custom `RendererContract` instead.

`step.actions[].action` and `.variant` were also interpolated into HTML
attributes with no escaping, so a flow loaded as JSON from a CMS or the CLI
could break out of the attribute. Both are now escaped, along with i18n
strings.

The bundle grows to 12.62 kB gzip and the `size-limit` budget moves from
12.5 kB to **13 kB**. That is deliberate and is recorded as ADR-007: a working
XSS is not a defensible trade for 122 bytes.

**`@guideflow/analytics` — consent, scrubbing and sampling.**

Events carried the full `window.location.href` and `document.referrer` to
third-party transports with no consent gate, scrubbing or opt-out. URLs are the
most reliable PII carrier on the web.

New `privacy` option on `AnalyticsCollector`, plus `collector.setConsent()`:

- `urlMode` defaults to `'path'` — **query strings and fragments are now
  stripped**. Pass `'full'` to restore the old behaviour.
- Do Not Track is honoured by default.
- Sensitive property keys (`email`, `token`, `password`, `apikey`, …) are
  redacted, including inside nested objects.
- `consent: false` collects nothing until `setConsent(true)`.
- `sampleRate` decides once per session, so a sampled-out session emits no
  partial funnel.

**`@guideflow/ai` — keys stay on your server, and pages can hold data back.**

New `ProxyProvider` holds no credential: it POSTs to an endpoint you run, which
keeps the API key server-side and can apply auth, rate limits and spend caps.
It validates every response, so a compromised backend cannot inject arbitrary
shapes into the tour engine. It is now the documented default, and every
example that inlined a key into client code has been corrected.

Constructing `OpenAIProvider` or `AnthropicProvider` with a key in a browser
now logs a one-time warning explaining why that key is public. It does not
throw — SSR, tests and Node scripts construct these legitimately.

`serializeDOM()` now excludes any `[data-gf-private]` element and its subtree,
and never describes a password input.

See the new guides: `apps/docs/guide/ai-proxy.md` and
`apps/docs/guide/privacy.md`.
