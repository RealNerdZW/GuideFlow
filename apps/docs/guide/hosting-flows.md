---
description: Change a tour without a code deploy by serving .flow.json as a static asset — with the caching, validation and versioning rules that make it safe.
keywords: product tour hosting, remote flow, flow CMS, self-hosted onboarding, tour without deploy
---

# Hosting flows

A tour you can only change by redeploying is a tour nobody changes. This page is
how to serve flows as static files so a copy edit ships in seconds.

::: warning There is nothing to sign up for
There is no hosted service, no account, and no publish command. This page is the
whole distribution story, and it deliberately needs no software from us running
anywhere — a `.flow.json` is a static asset, and S3, R2, GitHub Pages, Netlify,
nginx and every CDN already serve those better than we would.
:::

## The recipe

```ts
import { createGuideFlow } from '@guideflow/core'
import { parseFlowFile } from '@guideflow/core/authoring'

const gf = createGuideFlow({ context: { userId: currentUser.id } })

const res = await fetch('https://cdn.example.com/tours/welcome.flow.json')
const parsed = parseFlowFile(await res.text())

if (parsed.valid && parsed.flow) {
  gf.createFlow(parsed.flow)
  await gf.start(parsed.flow.id)
} else {
  // Never render an invalid flow. Log it and carry on without the tour.
  console.warn('[tours] refused a flow', parsed.errors)
}
```

That is the entire API. There is no `loadFlows()` and there will not be one:
your app already owns `fetch` — with its auth headers, retries, tracing and
`AbortSignal` — and wrapping it would only reimplement the HTTP cache while
dragging the validator into your production bundle.

`createFlow` replaces a flow with the same `id`, so calling it again with a
freshly fetched document swaps the tour for the next `start()`.

## Always validate what you fetched

`parseFlowFile` is the trust boundary. A flow fetched over the network is
[untrusted input](/guide/privacy): it decides what your users are told, which
elements are highlighted, and — with `content.html` and a sanitiser — what is
rendered.

It never throws and never repairs. It returns `{ valid, errors, warnings, flow }`
and refuses anything the engine would mishandle, including the shape that
truncates a tour *and records it as completed*.

## Caching

Serve it like any other document that changes occasionally:

```
Cache-Control: no-cache
ETag: "…"
```

`no-cache` does **not** mean "do not store" — it means "revalidate every time".
The browser keeps the copy, sends `If-None-Match`, and gets a 304 with no body
when nothing has changed. You get an edit live immediately and pay almost
nothing for it.

Use `max-age` only if you are willing for an edit to take that long to appear.

## Versioning: what happens to people mid-tour

This is the part that decides whether remote editing is safe, and GuideFlow
handles it for you — provided **your server never rewrites `flow.version`**.

`stringifyFlowFile` stamps a structural fingerprint. It hashes the flow's shape —
`initial`, state names, `final` flags, step ids in order, and the transition
table — and deliberately ignores content, targets, placement and media.

| You change | `version` | A user who left mid-tour | A user who already finished |
|---|---|---|---|
| A title, a body, a target | unchanged | **Resumes where they were** | Does not see it again |
| A step added, removed or reordered | changes | Restarts, with `progress:discard` (`reason: 'version'`) | **Sees the new tour** |

Both rows are what you want. Fixing a typo must not interrupt anyone; inserting
a step must not resume someone into a position that no longer means what it did.

::: danger Do not restamp `version` on the server
A CMS's instinct is to add a monotonic revision on every publish. Doing that
here discards **every** user's resume point on **every** edit, including a
one-character copy fix. Store and serve the bytes `stringifyFlowFile` produced.
:::

### Republishing reaches people who already finished

Completion is recorded against the version the user actually finished, so a
structurally changed flow is shown again to people who completed the old one.
A record written before this behaviour existed — or by a flow with no `version` —
still suppresses every version, which is the conservative direction.

## Publishing

There is no bespoke command, because there is nothing bespoke to do:

```bash
guideflow validate 'tours/*.flow.json' --strict
aws s3 cp tours/ s3://my-bucket/tours/ --recursive --cache-control no-cache
```

Run `validate` in CI. It exits 1 on any error and catches — with no browser —
a dangling transition, a duplicate step id, or a selector that looks like a
framework-generated id.

## Where flows come from

| Source | How |
|---|---|
| Written in code | Export with `stringifyFlowFile`, or keep them as TypeScript and skip this page entirely |
| Recorded in a browser | The [DevTools Recorder](/packages/devtools) exports `.flow.json` directly |
| Edited by hand | It is JSON; `guideflow validate` tells you if you broke it |

## What this does not give you

Be clear-eyed about the trade. Serving static files means you do **not** get:

- **Audience targeting decided server-side.** Do it client-side with
  [targeting rules](/guide/targeting), or serve different files to different
  cohorts.
- **An editing UI with review and rollback.** Your git host is the review and
  rollback.
- **Analytics joined to flow versions.** [Analytics](/guide/analytics) is
  host-wired; the flow's `version` is available to attach yourself.
- **Per-user flows.** Every user of a URL gets the same document. Vary the URL
  if you need to vary the flow.

If you need those, you are describing a CMS, and you should build or buy one.
This page is what the library owes you: the document format, the validator, and
the versioning semantics that make swapping the document safe.
