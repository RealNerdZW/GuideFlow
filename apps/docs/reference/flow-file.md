---
description: The .flow.json file format, the @guideflow/core/authoring validator with its full rule table, and the @guideflow/core/selector builder — every export, signature and severity.
keywords: flow.json format, GuideFlow flow file, validateFlow, flow validation, buildSelector, CSS selector generation, guideflow validate
---

# The `.flow.json` format

A flow is a state machine, and a `.flow.json` file is that state machine written down. This page
is the reference for the file envelope and for the two authoring-time subpaths that read and write
it: [`@guideflow/core/authoring`](#guideflow-core-authoring) and
[`@guideflow/core/selector`](#guideflow-core-selector).

Both are separate entry points. A running app never validates a flow and never builds a selector —
the author does, once, at authoring time or in CI. Neither is imported by `src/index.ts`, so
`dist/index.js` is unchanged.

## The envelope

```json
{
  "gfFlowFile": 1,
  "flow": {
    "id": "welcome",
    "initial": "intro",
    "states": {
      "intro": {
        "steps": [
          {
            "id": "greeting",
            "content": { "title": "Welcome", "body": "Let's take a quick look around." },
            "target": "[data-gf-id=\"nav-home\"]"
          }
        ],
        "on": { "NEXT": "done" }
      },
      "done": {
        "steps": [{ "id": "finish", "content": { "title": "That's it" } }],
        "final": true
      }
    },
    "version": "1k3jf9"
  },
  "meta": {
    "generator": "@guideflow/core 0.1.9",
    "createdAt": "2026-08-01T09:12:04.118Z",
    "sourceUrl": "https://app.example.com/dashboard"
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `gfFlowFile` | `1` | yes | Envelope version, **not** a library version. Any other value is the `unsupported-envelope` error and parsing stops |
| `flow` | `FlowDefinition` | yes | The state machine itself. See [FlowDefinition](/api/flow-definition) |
| `meta` | `FlowFileMeta` | no | Provenance. Nothing in the engine reads it |

### `FlowFileMeta`

| Field | Type | Notes |
|---|---|---|
| `generator` | `string` | What wrote the file |
| `createdAt` | `string` | ISO 8601 |
| `sourceUrl` | `string` | The page the flow was authored against |

### There is no `$schema` key

Deliberately. We host no schema, and a URL that 404s in every editor that follows it would be a lie
inside the artifact this format exists to make honest.

`validateFlow` **is** the schema. It carries about thirty rules, each grounded in a behaviour
measured against the real engine, and it ships in the same package as the engine — so it cannot
drift from the thing it describes the way a hosted JSON Schema would. Run it in CI with
[`guideflow validate`](#in-ci).

### Reading one back needs no loader

The envelope is plain JSON, so a bundler's JSON import is the whole story:

```ts
import doc from './welcome.flow.json'

await gf.start(doc.flow)
```

Use [`parseFlowFile`](#parseflowfile-input) instead when the input is untrusted — a file a user
uploaded, or one fetched at runtime — because it validates as it reads and hands back the issue
list rather than a flow the engine will fail on later.

## `@guideflow/core/authoring`

```bash
# already installed — it is a subpath of core, not a package
```

```ts
import { validateFlow, stringifyFlowFile, parseFlowFile } from '@guideflow/core/authoring'
```

| Export | Signature |
|---|---|
| `validateFlow` | `(input: unknown, options?: ValidateOptions) => FlowValidation` |
| `draftToFlow` | `<TContext>(draft: FlowDraft) => FlowDefinition<TContext>` |
| `flowToDraft` | `(flow: FlowDefinition) => { draft: FlowDraft \| null; lossy: FlowIssue[] }` |
| `explainNotLinear` | `(flow: FlowDefinition) => string \| null` |
| `stringifyFlowFile` | `(flow: FlowDefinition, meta?: FlowFileMeta) => string` |
| `parseFlowFile` | `(input: unknown) => FlowValidation & { meta: FlowFileMeta \| null }` |

Types: `FlowIssue`, `FlowIssueCode`, `FlowValidation`, `ValidateOptions`, `LinearStep`, `FlowDraft`,
`FlowFile`, `FlowFileMeta`, `Severity`.

### `validateFlow(input, options?)`

Takes `unknown` on purpose: this is the boundary between untrusted JSON and the engine.

**It never throws, and it never repairs.** Silently fixing a flow is how you ship a tour that is not
the one the author drew — so a flow with errors comes back with `flow: null` and an issue list, never
as a patched object.

```ts
const { valid, errors, warnings, flow } = validateFlow(JSON.parse(text))
if (!valid) {
  for (const issue of errors) console.error(issue.path, issue.message, '→', issue.hint)
  return
}
await gf.start(flow)   // narrowed to FlowDefinition
```

#### `ValidateOptions`

| Field | Type | Notes |
|---|---|---|
| `root` | `ParentNode` | Enables the three selector rules. **Omitted — the normal case in Node — they are skipped, never failed** |

That skip is what lets one function serve both callers: the same rules run in Node for
`guideflow validate` and in a browser for a recorder, and a CI run never fails a flow just because
Node has no DOM to resolve `#save-button` against.

#### `FlowValidation`

| Field | Type | Notes |
|---|---|---|
| `valid` | `boolean` | True when `errors` is empty. Warnings never set it and never clear it |
| `issues` | `FlowIssue[]` | Every issue, in document order |
| `errors` | `FlowIssue[]` | `severity === 'error'` |
| `warnings` | `FlowIssue[]` | `severity === 'warning'` |
| `flow` | `FlowDefinition \| null` | The flow, narrowed, when valid. **Never a partially repaired flow** |

#### `FlowIssue`

| Field | Type | Notes |
|---|---|---|
| `code` | `FlowIssueCode` | Stable and machine-readable. **Assert on this**; `message` may be reworded |
| `severity` | `'error' \| 'warning'` | |
| `path` | `string` | Dotted, e.g. `states.welcome.steps[1].target`. Empty for flow-level issues |
| `message` | `string` | What is wrong |
| `hint` | `string` | One imperative sentence naming the fix. Rendered verbatim by the CLI |
| `stateId` | `string` | Present when the issue belongs to a state |
| `stepId` | `string` | Present when the issue belongs to a step |

### `stringifyFlowFile(flow, meta?)`

The **only** writer. Returns the JSON text, pretty-printed, with a trailing newline.

It stamps `flow.version` via `withFingerprint` unless one is already set, so a returning user's
resume point is invalidated when the flow's *shape* changes and not when a typo is fixed. See
[flow versioning](/api/flow-definition).

**It throws a `TypeError` when the flow contains anything JSON cannot hold** — a function `showIf`,
a `RegExp`, a `Date`. Refusing is the point: a file that silently dropped a `showIf` would mean
something different from the flow it came from. Keep such flows in code.

```ts
import { writeFileSync } from 'node:fs'
import { stringifyFlowFile } from '@guideflow/core/authoring'

writeFileSync('welcome.flow.json', stringifyFlowFile(flow, { generator: 'my-recorder' }))
```

### `parseFlowFile(input)`

The **only** reader. Tolerant about what it accepts and strict about what it returns. **Never
throws** — malformed JSON comes back as a single `not-an-object` error, with `errors` populated so
an exit-code check cannot pass a file that was not JSON at all.

Accepts three shapes:

- the `{ gfFlowFile: 1, flow, meta? }` envelope — `meta` is returned alongside the validation;
- a bare `FlowDefinition`, for a file written by hand;
- a legacy `{ kind: 'guideflow-draft' }` editing session, which is run through `draftToFlow` first.

A `string` input is `JSON.parse`d; anything else is used as-is. `meta` is `null` for every shape but
the envelope.

### `draftToFlow(draft)` and `flowToDraft(flow)`

The converter between the linear step list an editor produces and a real `FlowDefinition`.

`draftToFlow` builds one state per step, chained on `NEXT`, with `final: true` on the last. Unlike
`validateFlow`, it **throws a `RangeError`** on an empty draft or a duplicate step id, rather than
emitting a flow whose `goTo()` and resume would silently resolve to the wrong step.

`flowToDraft` goes back the other way and is **partial by design**. It returns `draft: null` — never
a quietly truncated list — for anything the linear model cannot hold, with `lossy` explaining what
stopped it:

- a `NEXT` path that loops;
- a state with `onEntry` / `onExit` hooks, or a `route`;
- a state that branches on more than one event, or moves forward on an event other than `NEXT`;
- a step whose `content`, `target` or `showIf` is a function.

`explainNotLinear(flow)` is the one-sentence form for a UI: the first `lossy` message, or `null`
when the flow *is* linear.

```ts
const message = explainNotLinear(flow)
if (message) showBanner(`${message} Edit this flow in code.`)
```

#### `LinearStep`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | |
| `title` | `string` | Becomes `content.title` |
| `body` | `string` | Becomes `content.body` |
| `target` | `string \| null` | **`null` means a centred modal announcement**, which is a supported shape |
| `placement` | `PopoverPlacement` | |
| `padding` | `number` | |
| `clickThrough` | `boolean` | |

`FlowDraft` wraps them: `{ kind: 'guideflow-draft', draftVersion: 1, id, name, steps, sourceUrl? }`.

## The rule table

Thirty-two codes — seventeen errors and fifteen warnings. `FlowIssueCode` is a union, so a `switch`
over it is exhaustive at compile time.

### Errors

The engine crashes, refuses to run, or reports success it did not have.

| Code | What goes wrong |
|---|---|
| `not-an-object` | Not a plain object — an array, a string, or unparseable JSON |
| `unsupported-envelope` | `gfFlowFile` is present but is not `1`. Parsing stops |
| `missing-id` | No non-empty string `id`. Progress and completion are stored under it |
| `missing-initial` | No non-empty string `initial` naming the first state |
| `no-states` | `states` is missing or empty. A flow is a state machine, not a step array |
| `initial-not-found` | `initial` names a state that does not exist. **`FlowMachine` throws on this** |
| `flat-steps-shape` | Top-level `steps` and no `states` — a step list, not a flow. Convert it with `draftToFlow()` |
| `unknown-transition-target` | A transition points at a state that does not exist. **See below** |
| `initial-state-has-no-steps` | The tour starts active and paints nothing |
| `duplicate-step-id` | `goTo()`, resume and the skip loop all resolve the first match |
| `step-missing-id` | A step is not an object, or has no non-empty string `id` |
| `step-missing-content` | No `content.title`, `.body` or `.html` — the renderer has nothing to paint |
| `unreachable-state` | Not reachable from `initial`. Its steps ship but never run |
| `route-on-step` | `route` belongs on a state. Nothing reads it on a step |
| `invalid-target-type` | `target` is not a string or `null`. A function or an `Element` cannot survive being written to a file |
| `invalid-selector` | `target` is not valid CSS, so the step can never resolve. Needs `options.root` |

`non-serialisable` is declared in `FlowIssueCode` but is not emitted by `validateFlow` — a flow
holding a function or a `Date` is caught at write time, where `stringifyFlowFile` throws a
`TypeError` instead.

### Warnings

It runs. It is probably not what you meant.

| Code | What goes wrong |
|---|---|
| `no-final-state` | No state is marked `final: true`. **See below** |
| `forward-event-not-next` | The single forward event is not named `NEXT`. **See below** |
| `off-default-path` | A state with steps is reachable only by a non-`NEXT` event, so its steps are left out of the step count and the progress indicator under-reports |
| `next-cycle` | The `NEXT` path loops. **See below** |
| `state-has-no-steps` | Fine as a routing-only or terminal marker state; otherwise you forgot one |
| `final-state-with-outgoing` | `final: true` next to an `on` table — the two contradict each other |
| `invalid-placement` | Not one of the twelve placements plus `center`; the popover falls back silently |
| `missing-target` | No `target` and no `placement: 'center'`, so it renders as a centred modal by accident |
| `fragile-selector` | `target` looks like a framework-generated id, which changes on the next render. Pure string analysis, so **this one runs in Node** |
| `selector-not-unique` | Matches more than one element; the tour highlights the first. Needs `options.root` |
| `selector-no-match` | Matches nothing on this page. The step waits, then renders unanchored. Needs `options.root` |
| `targeting-without-subpath` | `targeting` is inert — core reads none of it. Install `createTargeting(gf)` from `@guideflow/core/targeting` |
| `route-without-navigation` | `route` is inert without `navigation: createNavigation()` from `@guideflow/core/navigation` |
| `html-content-without-sanitizer` | `content.html` is escaped and rendered as text unless `createGuideFlow({ sanitizeHTML })` is passed from `@guideflow/core/html` |
| `too-many-steps` | More than 25 steps in one tour. Consider splitting it, or a [checklist](/guide/checklist) for the long tail |

### Measured, not assumed

Four severities look surprising until you see what the engine actually does. Each was run against
the real engine, not reasoned about:

| Shape | Measured behaviour | Severity |
|---|---|---|
| A transition naming a state that does not exist | One `console.warn`, then **`tour:complete`** — the tour truncates *and* is marked completed, so it never shows the user again | **error** |
| No `final: true` state anywhere | The tour **completes normally**; `tour:complete` fires when it runs out of steps | warning |
| A forward event not named `NEXT` | `totalSteps` reports **1** when the true total is **2**, so the renderer puts "Done" on step one | warning |
| A `NEXT` cycle | `totalSteps` is arbitrary. No hang | warning |

The unknown-transition-target case is the worst shape in the set, and the reason this module exists:
it fails *as success*. Nothing surfaces to the user, and the flow is written off as completed, so the
tour is gone for good.

The no-final-state case corrects a long-standing claim in this repo's own engineering notes, which
said for eight phases that such a flow "never completes". Measurement says otherwise. Marking the
last state `final: true` is still worth doing — it says so explicitly and it fixes the step
counter — which is exactly what a warning is for.

### In CI

```bash
guideflow validate flows/*.flow.json
guideflow validate flows/*.flow.json --strict   # warnings fail too
```

Exit `0` means no errors. Exit `1` means at least one error, an unreadable file, or — with
`--strict` — any warning. Each issue prints its `message`, then its `hint` on a `→` line. See the
[CLI reference](/api/cli).

## Size

| Bundle | Size | Gate |
|---|---|---|
| `@guideflow/core/authoring` | **5.3 kB** gzip | 5.5 kB |
| `@guideflow/core/selector` | **1.76 kB** gzip | 2.5 kB |
| `@guideflow/core` (entry) | 14.96 kB gzip | 15 kB — **unchanged** |

`authoring` is large next to `./targeting`'s 2.18 kB, and the difference is rules, not prose:
stripping every `message` and `hint` in the file saves 880 B. The hints are the deliverable — they
are what turns "this flow is invalid" into something a non-engineer can act on — so the gate was set
from a measurement rather than an estimate.

**Neither subpath is imported by `src/index.ts`**, so neither can reach an application bundle unless
you import it yourself. Do not: validation is an authoring-time and CI concern. Your users never
need to know a flow was valid, because it was checked before it shipped.

## `@guideflow/core/selector`

```ts
import { buildSelector } from '@guideflow/core/selector'

const { selector, confidence, unique, warnings } = buildSelector(el)
if (!unique) return refuseToSaveTheStep(warnings)
```

Building a CSS selector for an element is the make-or-break of any recorder: a selector that
silently resolves to the wrong element ships a tour that highlights the wrong thing, and nobody
finds out until a user does.

| Export | Signature |
|---|---|
| `buildSelector` | `(el: Element, options?: SelectorOptions) => SelectorResult` |
| `verifySelector` | `(selector: string, el: Element, root?: ParentNode) => 'unique' \| 'ambiguous' \| 'no-match' \| 'invalid'` |
| `isStableId` | `(id: string) => boolean` |
| `retargetToInteractive` | `(el: Element, maxClimb?: number) => Element` |

Types: `SelectorResult`, `SelectorStrategy`, `SelectorConfidence`, `SelectorWarning`,
`SelectorOptions`.

The module is purely DOM-computational — it reads elements and attributes and re-queries the
document it was given. No layout, no geometry, no `window`.

### Every candidate is verified by re-query

`unique` is **verified, not asserted**: the selector is run back through
`root.querySelectorAll()` and checked for exactly one match that is the element in question.

`unique: false` means nothing resolved. **The caller must refuse the step** rather than ship a
selector that points somewhere else. There is always a `selector` string — it is never empty — but
an unverified one is a guess, and a recorder that saves it has produced a broken tour that looks
fine.

### `SelectorResult`

| Field | Type | Notes |
|---|---|---|
| `selector` | `string` | Never empty |
| `strategy` | `SelectorStrategy` | Which rule produced it |
| `confidence` | `SelectorConfidence` | How well it should survive a deploy |
| `unique` | `boolean` | Verified by re-query |
| `matchCount` | `number` | |
| `element` | `Element` | **What the selector actually resolves to.** Differs from the input after retargeting |
| `warnings` | `SelectorWarning[]` | |

### Strategies

Tried in this order. The first one that verifies wins.

| # | Strategy | Shape | Confidence |
|---|---|---|---|
| 1 | `gf-id` | `[data-gf-id="save"]` | `stable` |
| 2 | `testid` | `[data-testid="save"]` | `stable` |
| 3 | `id` | `#save-button` | `stable` |
| 4 | `name` | `input[name="email"]` | `stable` |
| 5 | `aria-label` | `button[aria-label="Close"]` | `semantic` |
| 6 | `href` | `a[href="/settings"]` | `semantic` |
| 7 | `structural` | `main > section:nth-of-type(2) > button:nth-of-type(1)` | `fragile` |

Notes on the non-obvious ones:

- **`data-gf-id` is a documented opt-in hook, and it wins outright.** Add it to the elements you
  want tours to point at. It is the one strategy where the author has said, in the markup, "this is
  a tour anchor" — nothing else in this list is a promise, it is an inference. If you own the app
  you are touring, this is the cheapest durability you can buy.
- **Test ids rank above `aria-label`.** An `aria-label` is user-visible text: it collides across a
  page and it changes when the page is translated, which is why that strategy always carries an
  `i18n-fragile` warning.
- **`id` is used only when [`isStableId`](#isstableid-id) accepts it.** A rejected id does not
  disqualify the element; it demotes to the next strategy and adds a `generated-id` warning.
- **`name` applies to `input`, `select` and `textarea` only**, and is tag-scoped. It is submitted to
  a server, so it is as stable as the backend contract.
- **`href` applies to `<a>` only**, and only when the value is at most 60 characters and has no
  query or fragment.
- **The structural path is anchored**, not free-floating: the walk climbs until the path either
  resolves uniquely or is rooted on an ancestor carrying a stable anchor. It emits `:nth-of-type`,
  not `:nth-child`, because a portal or tooltip `<div>` appended as a sibling shifts every
  `nth-child` index on the page. Case is preserved outside the HTML namespace, so an SVG `clipPath`
  is never lowercased into `clippath`, which matches nothing.

### Warnings

| Warning | Meaning |
|---|---|
| `generated-id` | An id was present and was rejected as framework-generated |
| `i18n-fragile` | The selector embeds user-visible text, so translating the page breaks it |
| `positional` | The path contains `:nth-of-type`, so re-ordering the markup breaks it |
| `not-unique` | Nothing resolved uniquely. `unique` is `false` and the result is a best effort |
| `redacted` | Inside `[data-gf-private]` — only structural segments were used |
| `retargeted` | The selector points at an interactive ancestor, not the element passed in |
| `shadow-dom` | Inside a shadow root: no document-level selector can reach it |

`shadow-dom` always comes with `unique: false`, because `TourEngine` resolves targets with
`document.querySelector`, which cannot cross a shadow boundary. Saying so is more useful than
returning a selector that cannot work.

`redacted` is evaluated once, at entry, before any strategy runs — so ids and test ids cannot walk
out of an opted-out subtree.

### `SelectorOptions`

| Field | Type | Default | Notes |
|---|---|---|---|
| `testIdAttributes` | `readonly string[]` | `data-testid`, `data-test-id`, `data-test`, `data-cy`, `data-qa`, `data-pw` | Tried in order; the first present wins |
| `privateSelector` | `string` | `'[data-gf-private]'` | Subtree opt-out marker |
| `root` | `ParentNode` | `el.ownerDocument` | Where uniqueness is verified |
| `maxDepth` | `number` | `12` | Ancestor segments before the walk gives up |
| `retargetDepth` | `number` | `4` | Levels climbed looking for an interactive ancestor. `0` disables |

### `isStableId(id)`

Is this id worth building a selector out of? Rejects React 18's `:r1:` and React 19's `«r1»`,
component-library prefixes (`radix`, `headlessui`, `mui`, `mantine`, `chakra`, `reach`, `downshift`,
`rc`, `ember`, `aria`), UUIDs, bare hex and content hashes, nanoid-shaped strings, anything longer
than 64 characters, and anything containing a run of four or more digits — timestamps, row counters
and database keys.

**The asymmetry is deliberate.** A false reject costs one rank position and an amber badge. A false
accept ships `#:r1:` — syntactically valid, unique today, and matching nothing after the next
render. Bias toward rejection.

### `retargetToInteractive(el, maxClimb?)`

Climbs to the interactive ancestor a user meant to click, so that clicking the `<path>` inside
`<button><svg><path/></svg></button>` records the button. An element inside an `<svg>` is never a
tour target, so the climb jumps straight out of the SVG.

Recognised as interactive: `a[href]`, `button`, `input`, `select`, `textarea`, `summary`, `label`,
the `button` / `link` / `tab` / `menuitem` / `checkbox` / `radio` / `switch` / `option` roles,
`[tabindex]` other than `-1`, and `[contenteditable="true"]`.

### `verifySelector(selector, el, root?)`

Does `selector` resolve to exactly `el`, and nothing else? **Never throws** — a malformed candidate
returns `'invalid'` so it can demote to the next strategy rather than propagate out of a recorder.

The identity check is not optional: after retargeting, a selector can match exactly one element and
still not be the one being described, which is why a single match that is not `el` returns
`'no-match'` rather than `'unique'`.

### Verified against real Chromium

The previous three implementations of this logic — one each in `@guideflow/ai`,
`@guideflow/devtools` and the recorder — were broken in the same two ways: they trusted
framework-generated ids, and **none of them ever re-queried to check the selector they had just
built**. All three now call this module. Old versus new, against the built artifact:

| Page shape | Old | New |
|---|---|---|
| Two buttons sharing `aria-label="Close"` | Matched 2, **pointed at the wrong one** | `#banner > button:nth-of-type(1)`, 1 match |
| Sidebar and main with matching nesting | Matched 2, **pointed at the sidebar** | Anchored at `main`, 1 match |
| An icon inside a button | Anchored the inner `<path>` | Retargets to the button, `[data-testid="save"]` |
| A React `useId` value, `#:r1:` | Emitted it — dead on the next render | Rejects it, warns `generated-id`, anchors elsewhere |

## See also

- [FlowDefinition](/api/flow-definition) — the type inside the envelope
- [Flows & Steps](/guide/flows-and-steps) — how a flow is put together
- [State Machine](/guide/state-machine) — transitions, `final`, and the `NEXT` path
- [CLI reference](/api/cli) — `guideflow validate` and `guideflow export`
