---
description: How to author GuideFlow flows — write them in TypeScript or record them, save them as .flow.json, validate them in CI with guideflow validate, and build selectors that survive the next deploy.
keywords: GuideFlow authoring, flow file, guideflow validate, flow validation, FlowDefinition JSON, tour selector, data-testid tour, data-gf-id
---

# Authoring flows

A flow is a plain object. Nothing on this page is required to ship a tour — you can write a
`FlowDefinition` by hand and pass it to `gf.start()` and never read further.

This page is about the gap between *a tour that works on your machine* and *a tour that still
points at the right button after the next deploy*. Both halves of that gap have the same shape:
**a flow can be wrong in ways nothing tells you about**. Runtime validation inside the engine is
one check — `flow.initial in flow.states` — so every other mistake surfaces at a user rather than
at you, and the worst of them surfaces as success.

## The two ways to author a flow today

### Write it in TypeScript

This is the main path, and it is the one every other page in this guide shows. The flow lives in
your repo, types catch the shape, and it is reviewed in diffs like any other code.

```ts
import type { FlowDefinition } from '@guideflow/core'

export const welcome: FlowDefinition = {
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [{ id: 'projects', content: { title: 'Your projects live here' }, target: '#nav-projects' }],
      on: { NEXT: 'create' },
    },
    create: {
      steps: [{ id: 'new', content: { title: 'Start a new one' }, target: '[data-testid="new-project"]' }],
      final: true,
    },
  },
}
```

What TypeScript cannot check is the half that breaks: every `target` is a string, and no compiler
knows whether `#nav-projects` exists, matches once, or matches the wrong thing. That is what
[validation](#validating-a-flow) and [`buildSelector`](#selectors) are for.

### Record it with the DevTools extension

The extension is real, and it is rough. It is `private: true`, it is on no store, and there is no
packaged download — you clone the repo, build it, and load it unpacked. See
[`@guideflow/devtools`](/packages/devtools).

Its element inspector calls the same `@guideflow/core/selector` documented below, so the selectors
it records are the ones described here rather than a third implementation with its own bugs. Its
Builder tab still writes the older flat step-list shape:

```json
{ "id": "my-tour", "name": "My Tour", "steps": [ { "id": "s1", "title": "…", "target": "…" } ] }
```

That is **not** a flow — the engine rejects it, and `guideflow validate` names it with a
`flat-steps-shape` error. Convert it once, in a script:

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { draftToFlow, stringifyFlowFile, type FlowDraft } from '@guideflow/core/authoring'

// The Builder's ⬇ Export download. An assertion, because this is untrusted input —
// `guideflow validate` on the output is what actually checks it.
const saved = JSON.parse(readFileSync('./guideflow-tour.json', 'utf-8'))

const flow = draftToFlow({ kind: 'guideflow-draft', draftVersion: 1, ...saved } as FlowDraft)
writeFileSync('welcome.flow.json', stringifyFlowFile(flow))
```

`draftToFlow` gives you one state per step chained on `NEXT`, which is a linear tour and nothing
more. Recording is faster than typing selectors for a first pass at a page you already have open;
for anything you intend to keep, treat the result as a draft you finish in code.

::: warning There is no visual editor and no hosted service
The DevTools recorder and the code you write yourself are the whole authoring surface.
`guideflow push` targets an endpoint with no server behind it. Flows live in your repo; that is the
whole distribution story.
:::

## The flow file

`.flow.json` is one envelope around one flow:

```ts
interface FlowFile {
  gfFlowFile: 1
  flow: FlowDefinition
  meta?: { generator?: string; createdAt?: string; sourceUrl?: string }
}
```

Write one with `stringifyFlowFile` — the only writer:

```ts
import { writeFileSync } from 'node:fs'
import { stringifyFlowFile } from '@guideflow/core/authoring'
import { welcome } from './flows/welcome.js'

writeFileSync('flows/welcome.flow.json', stringifyFlowFile(welcome, { generator: 'my-script' }))
```

which produces exactly this — always pretty-printed, because a flow file lives in a repo and is
read in diffs:

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
            "id": "projects",
            "content": { "title": "Your projects live here" },
            "target": "[data-gf-id=\"nav-projects\"]"
          }
        ],
        "on": { "NEXT": "create" }
      },
      "create": {
        "steps": [
          {
            "id": "new",
            "content": { "title": "Start a new one" },
            "target": "[data-testid=\"new-project\"]"
          }
        ],
        "final": true
      }
    },
    "version": "1cgtnr1"
  },
  "meta": { "generator": "my-script" }
}
```

Two things it did on the way through.

**It stamped `version`.** Unless the flow already carries one, `stringifyFlowFile` runs it through
`withFingerprint`, which hashes only the parts of a flow that change what a saved resume coordinate
*means* — state names, step ids in order, the transition table. Fixing a typo does not restart
anybody's tour; renaming a state does. See [Versioning a flow](/guide/persistence#versioning-a-flow).

**It refused to drop anything.** If the flow contains a function, a `RegExp` or a `Date` —
a `showIf` predicate, an `onEntry` hook, a function `target` — `stringifyFlowFile` **throws**
instead of writing the file. A file that silently lost a `showIf` would describe a different tour
from the one it came from, and would look correct doing it. Flows with logic in them stay in code.

### Reading one back needs no loader

A `FlowDefinition` is a plain object and `gf.start()` accepts one directly, so there is nothing to
install and nothing to register:

```ts
import doc from './welcome.flow.json'

await gf.start(doc.flow)
```

Any bundler that handles JSON imports will do; in plain Node, use an import attribute
(`with { type: 'json' }`) or `createRequire`. There is no GuideFlow runtime involved in reading a
flow file at all.

::: tip There is deliberately no `$schema` key
The obvious thing to add would be a `$schema` URL so editors could autocomplete the file. We host
no schema, and a URL that 404s in every editor that follows it would be a lie sitting inside the
artifact this format exists to make honest. `validateFlow` is the schema — and unlike a JSON
schema, it can tell you that a transition points at a state that does not exist.
:::

## Validating a flow

`guideflow validate` is meant for CI. It takes any number of files, prints each problem with the
fix on its own `→` line, and exits non-zero when something is actually wrong.

Given a checkout tour with four ordinary mistakes in it — a step id reused across two states, a
recorded React `useId` selector, a transition pointing at a state nobody ever created, and a branch
hanging off a non-`NEXT` event:

```bash
npx @guideflow/cli validate flows/*.flow.json
```

```
  ✗ flows/checkout.flow.json — 2 error(s), 2 warning(s)
    error states.payment.steps[0].id
      Step id "review" is already used in state "cart".
      → Make every step id unique: goTo(), resume and the skip loop all resolve the first match.
    warn  states.payment.steps[0].target
      "#:r7:" looks like a framework-generated id, which changes on the next render.
      → Add a `data-testid` to the element and target that instead.
    error states.support.on.NEXT
      Transition "NEXT" points at "confirmation", which is not a state. The tour stops there AND is recorded as completed, so it never shows again.
      → Point it at one of: cart, payment, support.
    warn  states.support
      State "support" is reachable only by a non-NEXT event, so its steps are left out of the step count.
      → Expect the progress indicator to under-report while this branch is showing.

  2 error(s), 2 warning(s) across 1 file(s)
```

Not one of those four throws at runtime. That is the entire reason this command exists.

A clean file reports what it found, so a passing run is not silence:

```
  ✓ flows/welcome.flow.json — welcome, 2 state(s)

  1 file(s) valid, 0 warning(s)
```

### Exit codes are the contract

| | exit 0 | exit 1 |
|---|---|---|
| default | no errors, warnings allowed | any error, or a file that could not be read |
| `--strict` | no errors **and** no warnings | any error, any warning, or a file that could not be read |

`--strict` is the setting for a repo that wants to keep the warning count at zero:

```bash
npx @guideflow/cli validate flows/*.flow.json --strict
```

```
  ⚠ flows/settings.flow.json — 0 error(s), 2 warning(s)
    warn  states
      No state is marked `final: true`.
      → The tour still completes when it runs out of steps, but marking the last state final says so explicitly and fixes the step counter.
    warn  states.done.on.NEXT_STEP
      State "done" moves forward on "NEXT_STEP", not "NEXT", so the step counter stops here and the button reads "Done" early.
      → Rename the event to NEXT, or accept the counter — send() still works.

  0 error(s), 2 warning(s) across 1 file(s)
```

Zero errors, and it still exits **1**. Without `--strict` that same file exits **0** and prints the
same two warnings. Add it as a script and put it in CI next to your linter:

```json
{ "scripts": { "lint:flows": "guideflow validate flows/*.flow.json --strict" } }
```

`guideflow export` runs the same validator. It reads `.json` only, refuses to write a flow that
does not validate, and always pretty-prints.

## The rules that matter

There are around thirty rules. Four of them are worth understanding, because the severity of each
one is a measurement of what the engine actually does — not a guess about what it might.

### Dangling transition → **error**

`on: { NEXT: 'confirmation' }` where `confirmation` is not a key of `states`. This is the worst
shape in the set, and it is worth being specific about why.

The engine emits one `console.warn` and then fires **`tour:complete`**. So the tour truncates at
that state *and is recorded as completed*. `gf.start()` gates on completion and returns silently
for a flow this user has finished — no error, no return value to inspect — so on every future
visit, nothing happens. And `isCompleted` is keyed on the flow id alone with no version, so
**shipping the fix does not give those users the tour back.**

In user terms: some fraction of your users saw the first half of a tour, and there is no
redeploy that will show them the rest. One line in a console nobody was watching is the only
notice you got. A typo in a state name deserves to fail a build.

### No `final: true` state → **warning**

Measured against the real engine: a flow with no final state **completes normally**. It runs out of
steps, `tour:complete` fires, the snapshot is cleared. Nothing hangs.

::: warning These docs used to say the opposite
Earlier versions of this documentation — and the repo's own contributor guide — stated that a flow
with no `final: true` state "never completes". That claim stood for a long time and was never
measured. It is wrong. A tour ends when there is nothing left to render, never because a state is
final; `final` is metadata that the engine does not consult to end anything.
:::

Mark your last state final anyway. It stops the walk that computes the step counter, it is how
`machine.isFinal` and every tool reading it know where the end is, and it states an intention that
a reader of the flow otherwise has to infer. That is a warning's worth of value, not an error's.

### Forward event that is not `NEXT` → **warning**

`on: { CONTINUE: 'done' }` instead of `on: { NEXT: 'done' }`. The tour runs, and `send('CONTINUE')`
works exactly as written.

What breaks is counting. `totalSteps` walks the `NEXT` chain from `initial`, so it stops at the
state your custom event leaves from — a two-step tour reports a total of 1. The renderer derives
its buttons from index versus total, so the user gets a **Done** button on step one, presses it,
and the tour ends early because they were told it had ended. Nothing errors; the tour is just
shorter than you wrote it.

Rename the event to `NEXT`, or keep the event and accept an under-reporting progress indicator.
Both are defensible, which is why this is a warning.

### Duplicate step id → **error**

Two steps sharing an id, anywhere in the flow — not just within a state.

`goTo()`, the resume path and the `showIf` skip loop all resolve a step id by taking the **first
match**. With a duplicate, a returning user whose saved position names that id resumes into the
wrong state, `goTo('review')` jumps somewhere you did not mean, and any analytics keyed on step id
merges two different steps into one row. None of that errors at runtime, which is exactly why it is
an error here.

Other rules cover unreachable states, `route` on a step instead of a state, a step with no content,
a `targeting` block with no `createTargeting()` behind it, `content.html` with no sanitiser,
selectors that match nothing or match several things, and more. Each carries a `code` you can
assert on and a `hint` naming the fix.

## Selectors

`@guideflow/core/selector` builds a CSS selector for an element, and **verifies every candidate by
re-querying the document before accepting it**. That check is the whole point: a selector that
resolves to the wrong element ships a tour that highlights the wrong thing, and nobody finds out
until a user does.

```ts
import { buildSelector } from '@guideflow/core/selector'

const { selector, strategy, confidence, unique, warnings } = buildSelector(el)
```

### The ranked strategies

Tried in this order; the first one that resolves to exactly this element and nothing else wins.

| # | `strategy` | Shape | `confidence` |
|---|---|---|---|
| 1 | `gf-id` | `[data-gf-id="save"]` | `stable` |
| 2 | `testid` | `[data-testid="save"]` | `stable` |
| 3 | `id` | `#save-button` | `stable` |
| 4 | `name` | `input[name="email"]` | `stable` |
| 5 | `aria-label` | `button[aria-label="Close"]` | `semantic` |
| 6 | `href` | `a[href="/settings"]` | `semantic` |
| 7 | `structural` | `#banner > button:nth-of-type(1)` | `fragile` |

Test ids sit **above** `aria-label` deliberately. `aria-label` is user-visible text: it collides
across a page and it changes when you translate the page.

An `id` only qualifies at rank 3 if it survives a stability check. Framework-generated ids —
React's `:r7:` and `«r1»`, Radix/Headless UI/MUI/Mantine/Chakra prefixes, uuids, content hashes,
nanoids, any run of four or more digits — are rejected, and the result carries a `generated-id`
warning. The asymmetry is intentional: a false reject costs one rank position, a false accept ships
a selector that matches nothing after the next render.

The structural fallback anchors on the nearest stable ancestor it can find, and counts
`:nth-of-type` rather than `:nth-child` so that a portal or tooltip appended as a sibling does not
shift every index on the page.

### What `confidence` means

- **`stable`** — the attribute is there because a person put it there. Survives a redesign.
- **`semantic`** — derived from meaning, not markup. Survives a redesign; does **not** survive a
  translation (`aria-label`) or a URL change (`href`).
- **`fragile`** — it is a position. Survives nothing but a re-render of the same markup.

Show `confidence` in any authoring UI you build. It is the difference between a tour that needs
maintenance once a year and one that needs it every sprint.

### Warnings

| warning | meaning |
|---|---|
| `generated-id` | an `id` was present and rejected as framework-generated |
| `i18n-fragile` | the selector embeds user-visible text; translating the page breaks it |
| `positional` | the path contains `:nth-of-type`; re-ordering the markup breaks it |
| `not-unique` | **nothing resolved.** `unique` is false and the string is a best effort |
| `redacted` | inside `[data-gf-private]`; only structural segments were used |
| `retargeted` | the selector points at an interactive ancestor, not the element passed in |
| `shadow-dom` | inside a shadow root; no document-level selector can reach it |

`retargeted` is usually what you want. Clicking the `<path>` inside
`<button><svg><path/></svg></button>` records the **button** — anchoring a spotlight to a
zero-area SVG child is a bug, not a preference.

::: warning `unique: false` means refuse the step
It does not mean "close enough". Nothing resolved to exactly this element, and the `selector`
string is a best effort kept only so a UI has something to show. An authoring tool must decline to
save the step and ask the author to add an attribute — saving it ships a tour that highlights
something else.
:::

### The practical advice

**Add `data-testid` to anything a tour points at.** You probably have them already for tests, they
cost nothing at runtime, and they are the single highest-leverage change you can make to tour
durability. Six attributes are recognised by default: `data-testid`, `data-test-id`, `data-test`,
`data-cy`, `data-qa`, `data-pw`.

**Use `data-gf-id` for tour-specific anchors.** It is a documented opt-in hook that wins outright,
above everything else:

```html
<button data-gf-id="nav-projects">Projects</button>
```

Reach for it when the element has no test id, or when you would rather not couple your tour anchors
to your test suite — a renamed test id fails a test loudly and a tour silently, and only one of
those gets noticed.

**Use `data-gf-private` to keep a subtree out of selectors.** Put it on anything whose attributes
encode real data — a customer record, an invoice row, a document title:

```html
<section data-gf-private>
  <button data-testid="row-jane-doe-payroll">Open</button>
</section>
```

Inside that subtree, `buildSelector` reads no ids, test ids, `aria-label`s or `href`s. It emits
structural segments only and flags the result `redacted`. This is an **authoring-time** marker: it
stops a recorder from copying identifying strings out of your UI into a flow file that gets
committed and shared. It does not redact anything at runtime, and it does not stop you writing such
a selector by hand.

### Shadow DOM cannot be targeted

Plainly: a step cannot point at an element inside a shadow root. `TourEngine` resolves targets with
`document.querySelector`, and no document-level CSS selector crosses a shadow boundary — there is
no selector syntax that would work, so this is not a missing feature that could be added by trying
harder.

`buildSelector` returns `unique: false` with a `shadow-dom` warning rather than a plausible string
that would never resolve. If you own the component, expose an anchor in light DOM — a slot wrapper,
or the host element itself — and target that.

## Programmatic use

Both subpaths are opt-in entry points that **nothing in `@guideflow/core` imports**, so neither
adds a byte to `dist/index.js`.

`@guideflow/core/selector` is 1.76 kB gzip and safe to ship — a recorder or an in-app authoring
mode needs it in the browser. `@guideflow/core/authoring` is 5.3 kB gzip and is **authoring-time
only**: it belongs in a script, a test or the CLI, never in an app bundle. Most of that weight is
the `message` and `hint` strings, which are the deliverable — they are what turns "this flow is
invalid" into something a non-engineer can act on.

### Validation

```ts
import { validateFlow, parseFlowFile, type FlowValidation } from '@guideflow/core/authoring'

validateFlow(input: unknown, options?: { root?: ParentNode }): FlowValidation
parseFlowFile(input: unknown): FlowValidation & { meta: FlowFileMeta | null }
```

```ts
interface FlowValidation {
  valid: boolean                 // true when `errors` is empty; warnings never touch it
  issues: FlowIssue[]            // everything, in document order
  errors: FlowIssue[]
  warnings: FlowIssue[]
  flow: FlowDefinition | null    // the flow, narrowed, when valid — never partially repaired
}

interface FlowIssue {
  code: FlowIssueCode            // stable and machine-readable; assert on this
  severity: 'error' | 'warning'
  path: string                   // e.g. `states.welcome.steps[1].target`
  message: string
  hint: string                   // one imperative sentence naming the fix
  stateId?: string
  stepId?: string
}
```

`validateFlow` takes `unknown` on purpose — it is the boundary between untrusted JSON and the
engine. It **never throws** and it **never repairs**: silently fixing a flow is how you ship a tour
that is not the one the author drew.

Pass `root` to enable the three rules that need a live document — invalid selector, no match,
matches more than one. Without it they are **skipped, not failed**, so the same function runs in
Node for CI and in a browser for a recorder:

```ts
const result = validateFlow(JSON.parse(text), { root: document })
```

`parseFlowFile` is the only reader. It is tolerant about input — the `gfFlowFile` envelope, a bare
`FlowDefinition`, or a saved draft, which it converts on the way through — and strict about output.
It never throws either; unparseable JSON comes back as a single error.

### Selectors

```ts
import { buildSelector, verifySelector, isStableId, retargetToInteractive } from '@guideflow/core/selector'

buildSelector(el: Element, options?: SelectorOptions): SelectorResult
verifySelector(selector: string, el: Element, root?: ParentNode): 'unique' | 'ambiguous' | 'no-match' | 'invalid'
isStableId(id: string): boolean
retargetToInteractive(el: Element, maxClimb?: number): Element
```

```ts
interface SelectorResult {
  selector: string               // never empty
  strategy: SelectorStrategy
  confidence: SelectorConfidence
  unique: boolean                // verified by re-query, not asserted
  matchCount: number
  element: Element               // what the selector resolves to — differs from the input after retargeting
  warnings: SelectorWarning[]
}

interface SelectorOptions {
  testIdAttributes?: readonly string[]   // default: the six listed above
  privateSelector?: string               // default '[data-gf-private]'
  root?: ParentNode                      // where uniqueness is verified; default el.ownerDocument
  maxDepth?: number                      // ancestor segments before the walk gives up; default 12
  retargetDepth?: number                 // levels climbed for an interactive ancestor; default 4, 0 disables
}
```

`verifySelector` never throws — a malformed candidate demotes to the next strategy rather than
propagating out of your recorder. Note that it checks **identity**, not just cardinality: after
retargeting, a selector can be unique and still resolve to a different element than the one you
asked about.

Nothing here reads layout or geometry, so it works in jsdom and happy-dom.

### Draft ⇄ flow

```ts
import { draftToFlow, flowToDraft, explainNotLinear } from '@guideflow/core/authoring'

draftToFlow(draft: FlowDraft): FlowDefinition
flowToDraft(flow: FlowDefinition): { draft: FlowDraft | null; lossy: FlowIssue[] }
explainNotLinear(flow: FlowDefinition): string | null
```

```ts
interface FlowDraft {
  kind: 'guideflow-draft'
  draftVersion: 1
  id: string
  name: string
  steps: LinearStep[]
  sourceUrl?: string
}

interface LinearStep {
  id: string
  title: string
  body?: string
  target?: string | null   // null means a centred modal, which is a supported shape
  placement?: PopoverPlacement
  padding?: number
  clickThrough?: boolean
}
```

`draftToFlow` produces one state per step, chained on `NEXT`, with `final: true` on the last. It
**throws** on an empty draft or a duplicate step id rather than emitting a flow whose `goTo()` and
resume would resolve to the wrong step.

`flowToDraft` is the inverse, and it is partial **by design**. A step list cannot represent a
branch, a cycle, a `route`, an `onEntry`/`onExit` hook or a function `content`/`target`/`showIf`,
so rather than dropping any of those it returns `draft: null` and explains itself in `lossy`.
`explainNotLinear` gives you the one sentence a UI should show:

```ts
const reason = explainNotLinear(flow)
if (reason) {
  // `State "choose" branches on DEV, DESIGN.` → open the code editor, not the step list
}
```

## See also

- [Flows & Steps](/guide/flows-and-steps) — the shape you are authoring
- [State Machine](/guide/state-machine) — transitions, branching and what `final` does
- [Versioning a flow](/guide/persistence#versioning-a-flow) — what `version` invalidates
- [Targeting & frequency](/guide/targeting) — deciding when a validated flow actually runs
- [`@guideflow/cli`](/packages/cli) — every command and flag
