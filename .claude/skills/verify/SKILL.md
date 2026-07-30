---
name: verify
description: Full local verification gate for GuideFlow — build, type-check, lint, unit tests, and the core bundle-size budget, reported as a pass/fail table with real output. Use before claiming any task is done, before opening a PR, and after any change to packages/*. Also use when asked "is the repo green?", "did that break anything?", or "run the checks".
---

# /verify — GuideFlow local verification gate

Green CI in this repo is a weak signal (see `.claude/docs/TESTING-STRATEGY.md`), so this gate
reports *what was actually exercised*, not just exit codes.

## Procedure

Run each step. **Do not stop at the first failure** — collect every result, then report.

Use Git Bash (the `Bash` tool), not PowerShell: several package scripts use POSIX `cp`/`rm -rf` and
will fail in PowerShell until AUDIT `posix-only-scripts` is fixed.

```bash
# 1. Build — every publishable package
pnpm turbo run build --filter=!storybook --filter=!docs --filter=!e2e

# 2. Types
pnpm turbo run type-check --filter=!storybook --filter=!docs --filter=!e2e

# 3. Lint — zero-warning policy
pnpm turbo run lint --filter=!storybook --filter=!docs --filter=!e2e

# 4. Unit tests
pnpm turbo run test --filter=!storybook --filter=!docs --filter=!e2e

# 5. Bundle-size budget for core
pnpm --filter @guideflow/core size
```

If the change touched `packages/devtools`, additionally confirm the extension bundle is complete:

```bash
pnpm --filter @guideflow/devtools build
ls packages/devtools/dist
```

Every path named in `packages/devtools/manifest.json` must exist in `dist/`:
`background.js`, `content.js`, `bridge.js`, `devtools.html`, `panel.html`, `popup.html`,
`manifest.json`, and `assets/icon-{16,48,128}.png`.

## Baseline to compare against

| Check | Expected |
|---|---|
| Build | 9 tasks successful |
| Type-check | 13 tasks successful |
| Lint | 8 tasks successful, 0 warnings |
| Unit tests | **197 passing** — core 114, ai 37, analytics 32, react 14 |
| `@guideflow/core` size | ≤ 12 kB gzip (baseline 11.09 kB) |

A drop in test count is a regression even if the run is green — someone deleted or skipped tests.

## Reporting

Output a table:

| Check | Result | Detail |
|---|---|---|
| Build | ✅ / ❌ | task count, or the first real error |
| Type-check | ✅ / ❌ | file:line of each error |
| Lint | ✅ / ❌ | rule + file:line |
| Tests | ✅ / ❌ | `N passed` per package, and names of failures |
| Size | ✅ / ❌ | `X kB / 12 kB` |

Then state plainly whether the change is safe to commit. If anything failed, quote the real output —
never summarise a failure as "some tests failed".

## Known non-blocking noise

These are expected and are **not** failures:

- `Entry module "dist/index.global.js" is using named and default exports together` — the IIFE build
  of `core`. Tracked as AUDIT `iife-mixed-exports`.
- `@guideflow/vue:test: No test files found, exiting with code 0` — vue has no tests. Tracked as
  AUDIT `vue-zero-tests`. It is a gap, not a regression.
- Storybook's `axe-*.js` / `DocsRenderer-*.js` chunk-size warnings — dev-tooling bundles, not shipped.
