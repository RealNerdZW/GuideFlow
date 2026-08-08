# @guideflow/cli

## 0.2.0

### Minor Changes

- 301ed81: Republishing a tour now reaches the people who already finished the old one — and `guideflow push` is gone

  ## The bug that made "edit and republish" pointless

  A user who completed v1 of a flow **never saw v2**, however much v2 changed.

  `start()` checks `isCompleted` _before_ the version gate, and completion was
  recorded against the flow id alone. So `start()` returned silently: no render, no
  event, nothing in the console. Republishing an edited tour reached only the users
  who had never finished it — which is the opposite of who you are usually editing
  it for.

  Completion is now recorded against the version the user actually finished:

  | You change                         | A user who left mid-tour          | A user who already finished |
  | ---------------------------------- | --------------------------------- | --------------------------- |
  | A title, a body, a target          | **Resumes where they were**       | Does not see it again       |
  | A step added, removed or reordered | Restarts, with `progress:discard` | **Sees the new tour**       |

  Both rows are what you want, and you get them for free — `flowFingerprint`
  hashes structure and deliberately ignores copy, so fixing a typo interrupts
  nobody.

  `ProgressStore.markCompleted` and `isCompleted` take an optional `version`.
  `getCompletedFlows` is unchanged: it still returns bare flow ids.

  ⚠️ **A completion record written before this release suppresses every version of
  that flow**, because there is no way to know which one it meant. Nothing migrates
  and nothing is lost; the first _new_ completion is version-scoped.

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

  ## BREAKING: `guideflow push` is deleted

  _(Released as a **minor** bump, not a major: this repository is pre-1.0 and its convention is that
  a breaking change at 0.x takes a minor plus a loud entry — which this is. The packages move as one
  fixed group, so a major here would have taken all twelve to 1.0.0, and
  `PRODUCT-ROADMAP.md`'s own definition of 1.0 is not met.)_

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

- 945a437: `vite` is no longer a runtime dependency.

  It was imported at module scope by the `studio` command, so every `guideflow
init` user installed the whole of Vite for a command most never run — and
  Vite's transitive advisories (postcss, esbuild) became part of this package's
  production dependency tree. Every one of the 8 production audit findings
  against this repo, including all 3 highs, came from that single import.

  Vite is now an **optional peer dependency**, imported lazily inside the
  `studio` action. Projects that would run Studio almost always have Vite
  already, so for them nothing changes; everyone else gets a clear install
  instruction instead of a silent 20 MB.

  Also: `studio` now binds to `127.0.0.1` by default rather than Vite's default
  host. It serves your entire project directory, so it should not be reachable
  from the network unless you ask for that — pass `--host 0.0.0.0` if you need it.

- dc687bb: One selector engine, one flow file, one validator — and `guideflow studio` is gone

  ## `@guideflow/core/selector`

  There were **three** selector builders in this repo. All three trusted framework-generated ids, and
  **none of them ever re-queried to check the selector they had just built**. Measured in real
  Chromium, the recorder's copy pointed at the _wrong element_ for two entirely ordinary page shapes:

  | page shape                                       | before                                                                          | after                                           |
  | ------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------- |
  | two buttons sharing `aria-label="Close"`         | `[aria-label="Close"]` — 2 matches, **highlights the wrong one**                | `#banner > button:nth-of-type(1)`               |
  | a sidebar and a main panel with matching nesting | 4-segment unanchored `:nth-child` chain — 2 matches, **highlights the sidebar** | anchored at `main`                              |
  | an icon inside a button                          | anchors the inner `<path>`                                                      | retargets to the button, `[data-testid="save"]` |
  | React `useId` (`#:r1:`)                          | emits it — valid today, dead next render                                        | rejects it, warns `generated-id`                |

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
  — so every other way of getting a flow wrong failed at your users. The worst of them failed _as
  success_.

  ```ts
  import { validateFlow } from '@guideflow/core/authoring'

  const { valid, errors, warnings } = validateFlow(JSON.parse(text))
  ```

  Around thirty rules, each grounded in behaviour **measured against the real engine**, with a `hint`
  naming the fix. Every severity is pinned by a test that asserts the engine behaviour _and_ the
  verdict about it, so the rule table cannot drift from the engine.

  ⚠️ **A correction.** The docs have said since 0.1.x that a flow with no `final: true` state "never
  completes". **It completes normally** — `tour:complete` fires and `isActive` goes false. So that is
  a _warning_, not an error. What is an error is a transition naming a state that does not exist: the
  tour truncates **and is recorded as completed**, so it never shows that user again.

  ## One flow file

  `{ gfFlowFile: 1, flow, meta? }`, with one writer and one reader. Four mutually incompatible things
  called "export" collapse to one.

  ```ts
  import doc from './tours/welcome.flow.json'
  await gf.start(doc.flow) // no loader needed — a flow is a plain object
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

- 4981071: CLI safety fixes and packaging corrections.

  **`guideflow export` no longer destroys your input file.** The implicit output
  path was `src.replace(/\.(ts|js)$/, '.flow.json')`, which does not match a
  `.json` input — so `guideflow export flow.json` resolved the output to the
  input and overwrote it, minified unless `--pretty` was passed. The extension is
  now stripped whatever it is, writing to the input path is refused outright, and
  an existing output requires `--force`.

  **`guideflow init` no longer clobbers your work.** Every file was written
  unconditionally, so running `init` twice destroyed whatever you had put in
  those files. It now skips files that exist, reports what it skipped, and takes
  `--force`.

  **`guideflow init` can run unattended.** The output-directory question had no
  `when:` guard, so it always prompted and could never run in CI even with every
  flag supplied. It now skips prompts whose answer is already known, and `--yes`
  suppresses prompting entirely (as does a non-TTY stdout).

  **`guideflow init --framework vue|svelte` now scaffolds something.** Only
  `react` had a template; the other two wrote no framework file at all and still
  printed success. Vue gets a plugin-install file, Svelte a store file.

  **`guideflow push` honours `GUIDEFLOW_API_KEY`.** `--api-key` was a
  `requiredOption`, so commander rejected the invocation before the action body
  ran — making the documented env-var fallback unreachable. The env var is now
  the preferred route; a key on the command line lands in shell history and
  process listings.

  **`@guideflow/cli` ships type declarations.** `package.json` advertised a
  programmatic `exports` entry while tsup ran with `dts: false`.

  **Packaging, all published packages.** `sideEffects: false` told bundlers
  nothing in the package has side effects, so webpack was free to tree-shake
  `import '@guideflow/core/styles'` away entirely — it is now
  `sideEffects: ["**/*.css"]`. The `exports` map also declared a single top-level
  `types` pointing at ESM declarations while the `require` condition resolved to
  `.cjs`; types are now declared per condition, so a `node16`/`nodenext` CommonJS
  consumer resolves `index.d.cts`.

### Patch Changes

- 8dc6621: Documentation only: the README now describes what the CLI actually does.

  Every flag documented for `export` and `push` was wrong — the reference listed
  `--flow`, `--out`, `--config`, `--api` and `--token`, none of which exist, so
  every documented invocation failed. The real surface is documented instead:
  `export [file] [-o <out>] [--pretty]` and
  `push [file] --api-key <key> [--endpoint <url>] [--env <env>]`.

  Four overstated claims are retracted:
  - **`studio` is not a visual tour editor.** It starts a Vite dev server over your
    project and injects `window.__GUIDEFLOW_DEVTOOLS__`, which no `@guideflow/*`
    package reads. The editor has not been built. Vite is an optional peer
    dependency and the server binds `127.0.0.1` by default — both now documented.
  - **`export` on a `.ts`/`.js` file does not emit a flow.** It writes
    `{ _note, rawSnippet }` — a 500-character slice of your source — not a
    `FlowDefinition`. The `.json` path works, but without `-o` it overwrites the
    input file in place.
  - **`push` has no cloud to push to.** The default endpoint
    `https://api.guideflow.dev/v1/flows` is a placeholder for a service that has
    never been deployed; the command is marked experimental and documented as
    requiring `--endpoint` against your own API. `--api-key` is required, and the
    advertised `GUIDEFLOW_API_KEY` fallback is not honoured.
  - **`guideflow.config.ts` does not exist.** Nothing writes or reads it. `init`
    writes `guideflow.ts`, `my-tour.ts` and, for React, `GuideFlowProvider.tsx`.

  No behaviour changed.

- 8dc6621: Documentation and metadata corrections.

  `@guideflow/core` exposes the IIFE build as a supported `./global` export, with
  `unpkg`/`jsdelivr` fields, so script-tag and CDN usage is a documented entry
  point rather than a file that happened to be inside `dist`.

  `@guideflow/vue` and `@guideflow/svelte` no longer advertise "components" in
  their package description and keywords — neither ships any.

  `@guideflow/cli`: `studio` and `push` no longer describe themselves in `--help`
  as "a local visual tour editor" and "GuideFlow Cloud". No editor exists, and
  the default push endpoint is a placeholder; both are marked experimental.

  Source-file headers across the packages carried a GitHub URL and email that
  disagreed with every manifest. They now match `repo.config.json`, and
  `scripts/sync-repo-meta.mjs` rewrites them so they cannot drift again. These
  headers ship to npm, because the `files` field includes `src`.

- 8dc6621: Correct the author identity shipped inside every package.

  The header block at the top of each package entry point named
  `github.com/johnmugabe` and a `@263tickets.co.zw` address, neither of which owns
  the repository or reads mail for it. Because `"files"` ships `src`, both strings
  went out inside the published tarballs. The headers now carry the owner from
  `repo.config.json` (`github.com/RealNerdZW`), and the `@email` line is gone —
  vulnerabilities are reported through GitHub Security Advisories, as `SECURITY.md`
  says.

  No runtime code changed.

- Updated dependencies [ef40833]
- Updated dependencies [bbd09a8]
- Updated dependencies [463b07d]
- Updated dependencies [93214ff]
- Updated dependencies [4bfc44a]
- Updated dependencies [7c72cb2]
- Updated dependencies [9cde7b4]
- Updated dependencies [301ed81]
- Updated dependencies [cb7169d]
- Updated dependencies [a49e235]
- Updated dependencies [d01266d]
- Updated dependencies [c994a5b]
- Updated dependencies [8dc6621]
- Updated dependencies [b81409f]
- Updated dependencies [8dc6621]
- Updated dependencies [b5dd516]
- Updated dependencies [07b094b]
- Updated dependencies [42412fb]
- Updated dependencies [c8bcaa7]
- Updated dependencies [dc687bb]
- Updated dependencies [4981071]
- Updated dependencies [4981071]
- Updated dependencies [84670f2]
- Updated dependencies [edfa115]
- Updated dependencies [37e9cb7]
- Updated dependencies [e98d6fd]
- Updated dependencies [26164ec]
  - @guideflow/core@0.2.0
