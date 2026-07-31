---
"@guideflow/cli": minor
"@guideflow/core": patch
"@guideflow/react": patch
"@guideflow/vue": patch
"@guideflow/svelte": patch
"@guideflow/ai": patch
"@guideflow/analytics": patch
---

CLI safety fixes and packaging corrections.

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
