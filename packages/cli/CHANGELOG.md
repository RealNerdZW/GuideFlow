# @guideflow/cli

## 0.2.0

### Minor Changes

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
