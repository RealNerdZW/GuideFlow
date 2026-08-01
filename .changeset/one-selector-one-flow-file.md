---
"@guideflow/core": minor
"@guideflow/cli": minor
"@guideflow/ai": patch
---

One selector engine, one flow file, one validator — and `guideflow studio` is gone

## `@guideflow/core/selector`

There were **three** selector builders in this repo. All three trusted framework-generated ids, and
**none of them ever re-queried to check the selector they had just built**. Measured in real
Chromium, the recorder's copy pointed at the *wrong element* for two entirely ordinary page shapes:

| page shape | before | after |
|---|---|---|
| two buttons sharing `aria-label="Close"` | `[aria-label="Close"]` — 2 matches, **highlights the wrong one** | `#banner > button:nth-of-type(1)` |
| a sidebar and a main panel with matching nesting | 4-segment unanchored `:nth-child` chain — 2 matches, **highlights the sidebar** | anchored at `main` |
| an icon inside a button | anchors the inner `<path>` | retargets to the button, `[data-testid="save"]` |
| React `useId` (`#:r1:`) | emits it — valid today, dead next render | rejects it, warns `generated-id` |

```ts
import { buildSelector } from '@guideflow/core/selector'

const { selector, confidence, unique, warnings } = buildSelector(el)
```

Strategies are ranked `data-gf-id` → test ids → a stable `id` → form `name` → `aria-label` → `href`
→ an anchored structural path, and **every candidate is verified by re-query before it is
accepted**. `unique: false` means nothing resolved — an authoring UI must refuse the step rather
than ship a selector that points somewhere else.

Also new: `[data-gf-id]` as a documented opt-in anchor that wins outright, `data-gf-private` now
redacts ids and test ids (it used to leak both), and shadow-DOM elements return `unique: false` with
a `shadow-dom` warning instead of a selector `document.querySelector` can never resolve.

## `@guideflow/core/authoring`

Runtime validation of a flow was **one check in the entire library** — `flow.initial in flow.states`
— so every other way of getting a flow wrong failed at your users. The worst of them failed *as
success*.

```ts
import { validateFlow } from '@guideflow/core/authoring'

const { valid, errors, warnings } = validateFlow(JSON.parse(text))
```

Around thirty rules, each grounded in behaviour **measured against the real engine**, with a `hint`
naming the fix. Every severity is pinned by a test that asserts the engine behaviour *and* the
verdict about it, so the rule table cannot drift from the engine.

⚠️ **A correction.** The docs have said since 0.1.x that a flow with no `final: true` state "never
completes". **It completes normally** — `tour:complete` fires and `isActive` goes false. So that is
a *warning*, not an error. What is an error is a transition naming a state that does not exist: the
tour truncates **and is recorded as completed**, so it never shows that user again.

## One flow file

`{ gfFlowFile: 1, flow, meta? }`, with one writer and one reader. Four mutually incompatible things
called "export" collapse to one.

```ts
import doc from './tours/welcome.flow.json'
await gf.start(doc.flow)              // no loader needed — a flow is a plain object
```

`stringifyFlowFile` stamps a structural `version` unless you set one, and **throws** if the flow
carries a function, a `RegExp` or a `Date` — a file that silently dropped a `showIf` would mean
something different from the flow it came from.

## `guideflow validate`

```bash
guideflow validate 'src/tours/*.flow.json'
```

Exit 0 on warnings, 1 on errors, `--strict` to fail on warnings too. It catches a recorded React
`useId` selector with no browser at all, which is the point of running it in CI.

## `guideflow export`, rewritten

JSON only. It validates on the way through and **refuses to write an invalid flow**. Output is
always pretty-printed (`--pretty` is now an accepted no-op) because a minified flow file in a pull
request is unreviewable.

**Breaking:** the `.ts` / `.js` path is deleted. It regex-matched your source, wrote
`{ _note, rawSnippet }` — a truncated 500-character slice of your own file, not a flow — printed a
green success and exited **0**. `guideflow push` would then upload it. It now errors, exits 1, and
prints the three lines to use instead.

## `guideflow studio` is deleted

**Breaking.** It served your project with Vite and injected `window.__GUIDEFLOW_DEVTOOLS__`, a global
nothing has ever read. The `vite` optional peer dependency goes with it. `@guideflow/cli` now
depends on `@guideflow/core`.

## Sizes

`@guideflow/core`'s entry bundle is **unchanged at 14.96 kB / 15 kB** — neither subpath is imported
by it. Seven bundles are now gated independently: core 14.96/15 kB, `./targeting` 2.18/2.5,
`./selector` 1.76/2.5, `./navigation` 1.55/2, `./authoring` 5.3/5.5, `./html` 767 B/1 kB,
`./versioning` 336 B/500 B.

`./authoring` is the largest subpath and is authoring-time only — it never reaches an app bundle.
Its gate is set from a measurement: stripping every `message` and `hint` in the file saves 880 B, so
the weight is rules, not prose, and the hints are the deliverable.
