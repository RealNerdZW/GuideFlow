---
"@guideflow/core": minor
"@guideflow/cli": major
---

Republishing a tour now reaches the people who already finished the old one — and `guideflow push` is gone

## The bug that made "edit and republish" pointless

A user who completed v1 of a flow **never saw v2**, however much v2 changed.

`start()` checks `isCompleted` *before* the version gate, and completion was
recorded against the flow id alone. So `start()` returned silently: no render, no
event, nothing in the console. Republishing an edited tour reached only the users
who had never finished it — which is the opposite of who you are usually editing
it for.

Completion is now recorded against the version the user actually finished:

| You change | A user who left mid-tour | A user who already finished |
|---|---|---|
| A title, a body, a target | **Resumes where they were** | Does not see it again |
| A step added, removed or reordered | Restarts, with `progress:discard` | **Sees the new tour** |

Both rows are what you want, and you get them for free — `flowFingerprint`
hashes structure and deliberately ignores copy, so fixing a typo interrupts
nobody.

`ProgressStore.markCompleted` and `isCompleted` take an optional `version`.
`getCompletedFlows` is unchanged: it still returns bare flow ids.

⚠️ **A completion record written before this release suppresses every version of
that flow**, because there is no way to know which one it meant. Nothing migrates
and nothing is lost; the first *new* completion is version-scoped.

## Hosting flows without a code deploy

New guide: **[Hosting flows](https://realnerdzw.github.io/GuideFlow/guide/hosting-flows)**.

```ts
import { parseFlowFile } from '@guideflow/core/authoring'

const parsed = parseFlowFile(await (await fetch('/tours/welcome.flow.json')).text())
if (parsed.valid && parsed.flow) {
  gf.createFlow(parsed.flow)
  await gf.start(parsed.flow.id)
}
```

That is the whole API, and it already shipped. **There is deliberately no
`loadFlows()`** — a `.flow.json` is a static asset, your app already owns `fetch`
with its auth and retries, and wrapping it would reimplement the HTTP cache while
pulling the validator into your production bundle. Serve the file with
`Cache-Control: no-cache` and an `ETag`; edits go live on the next revalidation.

The one rule for whatever serves it: **do not rewrite `flow.version`.** A CMS's
instinct to stamp a revision on every publish would discard every user's resume
point on every copy edit.

## Breaking: `guideflow push` is deleted

Not deprecated — deleted, along with the `ora` dependency.

Its default endpoint was a service that has never existed, and it carried four
measured defects: it printed `unknown` for every real `.flow.json` (it read `.id`
off the envelope, which has none); a `204` or an empty `201` from your own server
was reported as a **network error** and exited 1; it validated nothing, so it
would happily upload a flow the engine truncates; and its tests pinned a format
`guideflow export` no longer writes.

Publishing a static file needs no bespoke command:

```bash
guideflow validate 'tours/*.flow.json' --strict
aws s3 cp tours/ s3://my-bucket/tours/ --recursive --cache-control no-cache
```

## Also

Cross-tab progress sync now compares flow versions. Its previous reasoning —
"both tabs are the same build, so a mismatch is impossible" — held only while
flows shipped inside the bundle; a flow fetched at runtime falsifies it.

## Size

`@guideflow/core` measures **15.13 kB against a raised 15.5 kB limit**. The
version-scoped completion costs ~200 B. That is a sixth budget raise and it has
an ADR (ADR-014) rather than being absorbed quietly.
