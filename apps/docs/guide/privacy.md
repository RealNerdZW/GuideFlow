# Privacy

What GuideFlow sends, where it goes, and how to control it.

GuideFlow runs inside your application, so anything it observes is your users' data and your
responsibility. This page states exactly what leaves the browser so you can make that decision
deliberately.

## What core sends: nothing

`@guideflow/core` makes **no network requests**. Progress is stored locally (localStorage or
IndexedDB) and, with `BroadcastChannel`, shared between tabs on the same origin. Nothing leaves the
device.

Two optional packages do send data, and only if you configure them.

---

## `@guideflow/analytics`

Sends one event per tour milestone to whichever transports you register.

### What is in an event

| Field | Contents |
|---|---|
| `event` | `guideflow.tour.started`, `guideflow.step.viewed`, … |
| `timestamp` | ISO-8601 |
| `properties.flow_id` / `step_id` | your identifiers |
| `properties.user_id` | whatever you passed as `userId` |
| `properties.url` / `referrer` | **scrubbed** — see below |
| `properties.*` | your `globalProperties` |

GuideFlow never reads form values, cookies or storage to build an event.

### Defaults are conservative

Earlier versions sent the full `window.location.href` and `document.referrer` with no scrubbing,
consent gate or opt-out. URLs are the most reliable PII carrier on the web — `?email=`, `?token=`,
`/orders/12345` — so the defaults changed:

- **`urlMode: 'path'`** — query string and fragment are stripped. `https://app.example/orders?email=a@b.com`
  is recorded as `https://app.example/orders`.
- **Do Not Track is honoured.** A user who set it collects nothing.
- **Sensitive keys are redacted** from properties: `email`, `password`, `token`, `secret`, `apikey`,
  `authorization`, `ssn`, `phone`, `address`, `creditcard`, `cvv` and similar, case-insensitively,
  including inside nested objects. Values are dropped rather than masked — a mask still tells the
  vendor the field existed.

### Configuring it

```ts
const collector = new AnalyticsCollector({
  userId: 'user-123',
  privacy: {
    // Nothing is collected until setConsent(true) — the shape a cookie banner needs.
    consent: false,

    // 'full' | 'path' (default) | 'origin' | 'none' | (url) => string
    urlMode: (url) => url.replace(/\/orders\/\d+/, '/orders/:id'),

    respectDoNotTrack: true,
    redactKeys: ['email', 'token', 'internal_note'],
    sampleRate: 0.25,
  },
})

// From your consent manager:
collector.setConsent(true)
```

`redactKeys` **replaces** the default list rather than extending it, so include the defaults you
still want.

### Where it goes

Wherever you point it. `PostHogTransport`, `MixpanelTransport`, `AmplitudeTransport` and
`SegmentTransport` hand events to that vendor's script if it is already on the page.
`WebhookTransport` POSTs to a URL you choose.

Its `apiKey` option becomes an `Authorization: Bearer` header **sent from the browser**, so it is
public by construction. Treat it as a low-privilege ingest token, never a real API key.

---

## `@guideflow/ai`

This is the one to think hardest about: it sends a snapshot of the current page to a language model.

### What `serializeDOM()` captures

Up to 80 elements, and for each: a CSS selector, tag, ARIA role, geometry, a visibility flag, and a
**label derived from text content** (`aria-label`, an associated `<label>`, or up to 80 characters of
`textContent`). Plus `window.location.href` and `document.title`.

It does **not** read input values.

It does capture page text — which on a real application page routinely includes names, order numbers,
balances and email addresses.

### Holding data back

Mark any region that must never be captured:

```html
<section data-gf-private>
  <h2>Balance: $12,340.55</h2>
  <p>jane.doe@acme.com</p>
</section>
```

The element and its entire subtree are excluded. Password inputs are always excluded, with or without
the attribute.

Scope the capture instead of excluding from it, where you can:

```ts
// Only serialise the region the tour is about.
await gf.ai.generate('explain this form', document.querySelector('#checkout'))
```

### Where it goes

To your own endpoint if you use `ProxyProvider` — **the recommended setup** — and from there to
whichever model vendor you chose. Directly to OpenAI/Anthropic/Ollama for the other providers.

See [Running AI through your own server](./ai-proxy) for why the key must not be in the browser.

### Your obligations

Sending page content to a model vendor makes them a data processor for whatever that content
contains. Decide whether that is acceptable, scrub server-side if it is not, and disclose it
alongside your other subprocessors.

---

## The devtools extension

`@guideflow/devtools` is a **development tool**, not something to run while browsing sensitive
applications. It requires broad host permissions and observes tour activity on the page. It is not
published to a store and is not intended for end users.

---

## Checklist

- [ ] Decide your `urlMode` — the default drops query strings; `'full'` is opt-in
- [ ] Gate `AnalyticsCollector` behind your consent mechanism (`privacy.consent: false` + `setConsent`)
- [ ] Add your own sensitive property names to `redactKeys`
- [ ] Mark sensitive DOM regions with `data-gf-private` before enabling AI features
- [ ] Use `ProxyProvider` so no API key reaches the browser
- [ ] List your model vendor and analytics vendor in your privacy policy
