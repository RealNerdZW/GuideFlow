---
name: gf-release
description: Release GuideFlow packages via changesets — pre-flight checks CI does not perform, changeset authoring, version bump, publish, and post-publish verification of the actual npm tarballs. Use when cutting a release, publishing a package for the first time, writing a changeset, or when asked about versioning, CHANGELOGs, or a broken published package.
---

# /gf-release — releasing GuideFlow packages

Releases run through [Changesets](https://github.com/changesets/changesets), automated by
`.github/workflows/release.yml` on pushes to `master`. This skill covers the parts that are **not**
automated and have bitten before.

## Published vs private

Published: `@guideflow/core`, `react`, `vue`, `svelte`, `ai`, `analytics`, `cli`.
Never published (in the changesets `ignore` list): `docs`, `e2e`, `storybook`, `@guideflow/demo`,
`@guideflow/devtools`.

All published packages currently move in lockstep at the same version. That is convention, not
enforcement — `.changeset/config.json` has empty `fixed` and `linked` arrays. If you want true
lockstep, put them in `fixed`; if you want independent versions, stop bumping them together.

## Pre-flight — do these before the changeset

CI does **not** check any of this.

```bash
# 1. Everything green
pnpm turbo run build type-check lint test --filter=!storybook --filter=!docs --filter=!e2e

# 2. Size budget
pnpm --filter @guideflow/core size          # must be ≤ 12 kB gzip

# 3. Inspect what actually ships — per package
pnpm --filter @guideflow/core exec npm pack --dry-run
```

For each package being released:

- [ ] `npm pack --dry-run` lists every file the `exports` map references. Missing `dist/styles/**`
      from `core` is the classic failure (the build copies it with a POSIX `cp`).
- [ ] No `workspace:*` survives in `dependencies`/`peerDependencies` of the packed manifest. pnpm
      rewrites `dependencies` at publish; it does **not** reliably rewrite `peerDependencies` —
      `@guideflow/analytics` declares `@guideflow/core` as `workspace:*` in `peerDependencies` and
      must be fixed to a semver range before it is safe to publish.
- [ ] The `bin` entry of `@guideflow/cli` starts with `#!/usr/bin/env node`.
- [ ] `README.md` in the package is current and its examples still compile.
- [ ] No secret, personal email, or internal URL is in any shipped file (`files` includes `src`, so
      source headers ship too).

## Authoring the changeset

```bash
pnpm changeset
```

- **patch** — bug fix, no API change.
- **minor** — new API, or new behaviour behind existing API.
- **major** — removal, rename, or behaviour change a consumer must react to. Pre-1.0 this repo is at
  `0.1.x`; breaking changes still warrant a minor bump plus a loud CHANGELOG entry.

Write the summary for a **consumer**, not for the repo:

> Bad: `fix: resolve 9 issues in devtools`
> Good: `Fix per-instance i18n: strings set via `gf.i18n.use()` are now used by the default renderer. Previously only the exported `defaultI18n` singleton had any effect.`

Select every package whose *published behaviour* changes — including packages that only change
because a dependency did.

## Cutting the release

The automated path (preferred): merge to `master`; `changesets/action@v1` opens a
"chore: version packages" PR; merging that PR publishes.

Manual path:

```bash
pnpm version-packages     # applies bumps, writes CHANGELOGs
pnpm publish-packages     # builds, then `changeset publish`
```

`NPM_TOKEN` must be set in repository secrets. Note that `publish-packages` builds with
`--filter=!docs --filter=!e2e --filter=!storybook --filter=!@guideflow/demo` — devtools is *built*
but not published.

## Post-publish verification

Do not trust "publish succeeded". Install the published artifact into a scratch directory:

```bash
mkdir -p /tmp/gf-verify && cd /tmp/gf-verify && npm init -y
npm i @guideflow/core@latest @guideflow/react@latest
node -e "const m=require('@guideflow/core'); console.log(Object.keys(m).length,'exports')"
node --input-type=module -e "import('@guideflow/core').then(m=>console.log('esm ok',typeof m.createGuideFlow))"
ls node_modules/@guideflow/core/dist/styles/index.css
```

- [ ] CJS `require` works
- [ ] ESM `import` works
- [ ] TypeScript resolves types under `moduleResolution: "bundler"` **and** `"node16"`
- [ ] `@guideflow/core/styles` subpath resolves
- [ ] `npx @guideflow/cli --help` runs

## Gaps to be aware of

These are known and tracked in `.claude/docs/AUDIT.md`:

- No npm **provenance** (`--provenance`) — supply-chain attestation is missing.
- No `npm audit` / dependency-review step in CI.
- No changeset-presence check on PRs, so a change can merge without a release note.
- No root `CHANGELOG.md`; per-package CHANGELOGs are generated but never surfaced.
- No published deprecation or support policy.
- `docs.yml` deploys the VitePress site; the stale root `docs/*.html` is not part of any release.
