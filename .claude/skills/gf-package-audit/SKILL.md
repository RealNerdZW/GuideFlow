---
name: gf-package-audit
description: Deep audit of one GuideFlow package against this repo's conventions — packaging correctness (exports/tsup/tsconfig), cross-platform scripts, API-vs-docs truth, test coverage, SSR and CSP safety, and dependency hygiene. Use when adding a new package, before publishing a package for the first time, when a consumer reports an import or types failure, or when asked to review a specific @guideflow/* package.
---

# /gf-package-audit — single-package audit

Takes one package name (e.g. `core`, `ai`, `vue`) and produces a findings list. Read
`.claude/docs/AUDIT.md` first so you do not re-report a known issue as new.

## 1. Packaging correctness

Read `package.json`, `tsup.config.ts`, `tsconfig.json`, then build and inspect `dist/`.

```bash
pnpm --filter @guideflow/<pkg> build
ls -R packages/<pkg>/dist
```

- [ ] Every path in `exports` / `main` / `module` / `types` **exists in `dist/`** after a clean build.
      Test the subpaths too — `@guideflow/core` declares `./styles` and `./styles/*`, which only exist
      because the build script copies `src/styles`.
- [ ] `type: "module"` matches the emitted formats; `.cjs` for the `require` condition, `.js` for
      `import`.
- [ ] `.d.ts` **and** `.d.cts` are emitted when both conditions are declared.
- [ ] `files` ships what is needed and nothing more. All packages currently ship `src` as well as
      `dist` — decide deliberately (source maps reference it) rather than by inertia.
- [ ] `sideEffects: false` is accurate — the package must have no import-time side effects. Verify
      there is no module-scope `document`/`window` access and no top-level singleton construction that
      does work. (`core` exports a lazily-created singleton via a Proxy specifically to satisfy this.)
- [ ] For a `bin` package: a shebang is emitted (tsup `banner`), and the file is executable.
- [ ] `peerDependencies` use real semver ranges, **not** `workspace:*`. A workspace protocol in a peer
      range is not publishable — `@guideflow/analytics` currently has this bug.
- [ ] `peerDependenciesMeta.optional` is set for genuinely optional peers (the AI SDKs).
- [ ] `engines.node` matches what CI actually tests.
- [ ] `repository.directory`, `homepage`, `bugs`, `author`, `license`, `keywords` are present and
      consistent with `repo.config.json`.

## 2. Cross-platform scripts

- [ ] No POSIX-only commands in `build` / `clean` / `test` scripts. `cp -r` and `rm -rf` break in
      PowerShell and cmd.exe. Use `rimraf`/`cpy-cli`, or a small `node:fs` script.
- [ ] No hardcoded `/` path separators in Node code — use `node:path`.

## 3. Type-safety and lint

```bash
pnpm --filter @guideflow/<pkg> type-check
pnpm --filter @guideflow/<pkg> lint
```

- [ ] Zero `any` without an explicit disable comment **and** a written rationale.
- [ ] No `@ts-ignore`. `@ts-expect-error` only with a comment naming what it suppresses.
- [ ] Conditional-spread idiom used for optional properties (`exactOptionalPropertyTypes`).
- [ ] Index-signature reads use brackets (`noPropertyAccessFromIndexSignature`).
- [ ] Relative imports carry the `.js` extension.
- [ ] No `console.log` (only `warn`/`error`, or a `debug`-gated internal logger).

## 4. Public API vs documentation

- [ ] Every symbol in `src/index.ts` is documented in `apps/docs/`.
- [ ] Every API documented in `apps/docs/api/<pkg>/**` and in `README.md` **exists with that exact
      signature**. Missing or drifted APIs are findings, not footnotes.
- [ ] Every code example in the package `README.md` would actually compile and run.
- [ ] The package description and `keywords` do not promise things it does not have (`vue` and
      `svelte` both advertise "components" and ship none).

## 5. Tests

- [ ] A `test` script exists and is not hiding behind `--passWithNoTests`.
- [ ] Every source module has at least one test. List the ones that do not.
- [ ] The highest-risk logic is pinned: state transitions, persistence expiry, HTML escaping,
      position clamping, error/fallback branches.
- [ ] Silent-failure paths (`catch {}`, `?? fallback`, missing-global no-ops) each have a test that
      asserts the fallback behaviour is the intended one.

## 6. Runtime safety

- [ ] SSR: nothing touches `document`/`window` outside `isBrowser()`.
- [ ] CSP: all style injection goes through `injectStyles(css, id, nonce)`.
- [ ] Cleanup: every `addEventListener`, `setInterval`, `MutationObserver`, `ResizeObserver`,
      `BroadcastChannel` and injected DOM node is released by `destroy()`. Call `destroy()` twice and
      confirm it is idempotent.
- [ ] No unbounded growth: event buffers, queues and `cssText` concatenation are all capped.
- [ ] Untrusted input (stored JSON, network JSON, LLM output, DOM attributes) is validated before use.

## 7. Dependencies

- [ ] No new runtime dependency in `core` — ever.
- [ ] Every runtime dependency is justified. `@guideflow/cli` currently ships `vite` as a hard
      dependency for one subcommand.
- [ ] Versions agree with the root `pnpm-lock.yaml` (CI uses `--frozen-lockfile`).

## Output

A findings table, most severe first:

| id | severity | kind | file:line | finding | fix |
|---|---|---|---|---|---|

Then a one-paragraph verdict: is this package safe to publish as-is?
