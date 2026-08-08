---
name: gf-release
description: Release GuideFlow packages via changesets — pre-flight checks CI does not perform, changeset authoring, version bump, publish, and post-publish verification of the actual npm tarballs. Use when cutting a release, publishing a package for the first time, writing a changeset, or when asked about versioning, CHANGELOGs, or a broken published package.
---

# /gf-release — releasing GuideFlow packages

Releases run through [Changesets](https://github.com/changesets/changesets), automated by
`.github/workflows/release.yml` on pushes to `master`. This skill covers the parts that are **not**
automated and have bitten before.

## Published vs private

Published — **eleven** packages: `core`, `react`, `vue`, `svelte`, `ai`, `analytics`, `checklist`,
`banner`, `survey`, `mcp`, `cli`.
Never published: `docs`, `e2e`, `storybook`, `@guideflow/demo` (all in the changesets `ignore`
list), and `@guideflow/devtools` (`private: true`, and deliberately **not** in `ignore` — it needs
its version bumped because `packages/devtools/package.json` is the single source of truth for the
extension manifest and the `__GF_VERSION__` define).

**Lockstep is enforced, not convention.** `.changeset/config.json` carries
`fixed: [["@guideflow/*", "!@guideflow/demo", "!@guideflow/storybook"]]`. Consequences that have
already nearly bitten:

- **The group takes the largest bump any single member is given.** One `major` in the queue moves
  *every* package. Pre-1.0 that means one changeset can silently declare 1.0.0 for the whole suite.
  **Grep the queue for `major` before running `version-packages`** — the 0.2.0 release had a stray
  one (from deleting `guideflow push`) that would have done exactly that:
  ```bash
  grep -rl "': major" .changeset/*.md
  ```
  Pre-1.0 convention here: a breaking change takes a **minor** plus a CHANGELOG entry that says
  BREAKING out loud.
- **The glob means a new `@guideflow/*` package joins automatically** — which is why a new package
  must be scaffolded at the group's current version, never `npm init`'s `1.0.0`.
- **Do not tighten the peer ranges to `workspace:^`.** Every package declares core at
  `>=0.1.9 <1.0.0`. A caret publishes as `^0.2.0`, the next minor falls outside it, and Changesets
  majors a dependent whose peer range goes out of range — so one caret takes all twelve to 1.0.0.

## Pre-flight — do these before the changeset

CI does **not** check any of this.

```bash
# 1. Everything green — 50 tasks
pnpm turbo run build type-check lint test --filter=!@guideflow/storybook --filter=!docs --filter=!e2e

# 2. Size budgets — SEVEN gated bundles, not one. Core is 16 kB (ADR-026), not 12.
pnpm --filter @guideflow/core size

# 3. Packaging, all eleven publishable packages at once
node scripts/verify-pack.mjs
```

`verify-pack.mjs` now automates most of the per-package list below — it fails on a `workspace:` range
in `peerDependencies`, on a tsup/`exports` drift, and on the fixed group's versions diverging. Run it
rather than eyeballing `npm pack --dry-run` eleven times. Still worth checking by hand:

- [ ] `npm pack --dry-run` lists every file the `exports` map references. Missing `dist/styles/**`
      from `core` is the classic failure (the build copies it with a POSIX `cp`).
- [ ] No `workspace:*` survives in `dependencies`/`peerDependencies` of the packed manifest. pnpm
      rewrites `dependencies` at publish; it does **not** reliably rewrite `peerDependencies`.
      `@guideflow/analytics` used to declare core as `workspace:*` there — **fixed**, and
      `verify-pack.mjs` fails CI on it now, so this is a regression guard rather than a to-do.
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
- **major** — removal, rename, or behaviour change a consumer must react to. **Pre-1.0, do not pick
  this.** A breaking change takes a **minor** plus a CHANGELOG entry that says BREAKING out loud —
  because `fixed` means one `major` majors all twelve packages. See the warning above.

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
pnpm version-packages     # applies bumps, writes CHANGELOGs, consumes .changeset/*.md
pnpm publish-packages     # builds, then `changeset publish`
```

`NPM_TOKEN` must be set in repository secrets. Note that `publish-packages` builds with
`--filter=!docs --filter=!e2e --filter=!storybook --filter=!@guideflow/demo` — devtools is *built*
but not published.

**`version-packages` is safe to run and commit; `publish-packages` is not reversible.** npm
un-publish is limited to a 72-hour window and a re-publish of the same version is refused forever.
Split them: bump, commit, review the twelve CHANGELOGs, *then* publish.

After `version-packages`, verify by measurement rather than assumption — the 0.2.0 run is the
worked example:

```bash
git status --short           # 12 package.json + 12 CHANGELOG.md + N deleted changesets
ls .changeset/               # config.json must survive; only the *.md are consumed
grep -c "" packages/core/CHANGELOG.md
```

Then **rebuild before committing**: `packages/devtools/dist/manifest.json` and the
`__GF_VERSION__` define are baked from `package.json` at build time, so a version bump that is not
followed by a build leaves a manifest quoting the previous release.

### Publishing an agent cannot do

`changeset publish` needs npm credentials. Check with `npm whoami` — an `ENEEDAUTH` means stop and
hand over; publishing under someone's identity is theirs to authorise, and the CI path exists
precisely so nobody has to paste a token locally.

### First publish of a package

New `@guideflow/*` packages join the fixed group automatically and debut at the group's current
version, not `0.0.1` — `checklist`, `banner`, `survey` and `mcp` all made their npm debut at
**0.2.0**. Before the first publish of any new one:

- [ ] `publishConfig: { "access": "public" }` is present. Without it a **scoped** package's first
      publish fails with a 402 asking you to pay for private packages. All eleven have it; a new
      package scaffolded by hand will not.
- [ ] The name is not already taken on npm — `npm view @guideflow/<name>` should 404.
- [ ] `verify-pack.mjs` lists it. It walks `packages/*`, so a package it does not mention is one
      whose manifest it could not read.

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
- [ ] **All seven subpaths resolve**, not just `styles`. Two of them are directories in `src`
      (`targeting`, `navigation`) and four are flat files, and the `exports` map is hand-maintained:
      ```bash
      for s in targeting navigation selector authoring html versioning styles; do
        node -e "console.log('$s', require.resolve('@guideflow/core/$s'))" || echo "BROKEN: $s"
      done
      ```
- [ ] `npx @guideflow/cli --help` runs

## Gaps to be aware of

These are known and tracked in `.claude/docs/AUDIT.md`:

- No npm **provenance** (`--provenance`) — supply-chain attestation is missing.
- No `npm audit` / dependency-review step in CI.
- No changeset-presence check on PRs, so a change can merge without a release note.
- No root `CHANGELOG.md`; per-package CHANGELOGs are generated but never surfaced.
- No published deprecation or support policy.
- `docs.yml` deploys the VitePress site; the stale root `docs/*.html` is not part of any release.
