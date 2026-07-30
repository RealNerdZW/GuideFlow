# Contributing to GuideFlow.js

Thanks for your interest. This document covers setup, the conventions the linter enforces, and what
"done" means here.

If you are working with Claude Code, read [`CLAUDE.md`](CLAUDE.md) as well — it carries the
architecture notes and traps that are easy to trip over.

---

## Setup

**Requirements:** Node ≥ 18 (CI runs 22), pnpm ≥ 8.

```bash
git clone https://github.com/RealNerdZW/GuideFlow.git
cd GuideFlow
pnpm install
pnpm turbo run build --filter=!storybook --filter=!docs --filter=!e2e
```

> **Windows users:** some package scripts use POSIX `cp -r` and `rm -rf`. Run builds from **Git
> Bash**, not PowerShell or cmd.exe, until that is fixed. Fixing it is a welcome first contribution.

Verify your setup — you should see 197 passing unit tests:

```bash
pnpm turbo run test --filter=!storybook --filter=!docs --filter=!e2e
```

### Useful entry points

```bash
pnpm demo        # React playground at :5173 — the fastest way to see a change
pnpm docs:dev    # VitePress docs site
pnpm storybook   # component explorer at :6006
```

---

## Repository layout

| Path | What |
|---|---|
| `packages/core` | The engine. Zero runtime dependencies, ≤ 12 kB gzip. |
| `packages/{react,vue,svelte}` | Framework adapters. |
| `packages/{ai,analytics}` | Optional capability packages. |
| `packages/cli` | `guideflow` command-line tool. |
| `packages/devtools` | MV3 browser extension (not published). |
| `apps/docs` | **The** documentation site. |
| `apps/{demo,e2e,storybook}` | Playground, Playwright suite, component explorer. |
| `docs/*.html` | Legacy static site. **Stale — do not edit.** |

---

## Conventions

Most of these are enforced; the linter will tell you. The reasoning is in `CLAUDE.md` §4.

- **TypeScript strict**, plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`.
  - Optional properties use the conditional-spread idiom:
    `...(x !== undefined && { x })`.
  - Index-signature reads use brackets: `process.env['KEY']`.
- **No `any`.** If you genuinely need one, add an ESLint disable comment *and* a sentence explaining
  why.
- **No `console.log`.** Only `console.warn` / `console.error`, or a `debug`-gated internal logger.
  `--max-warnings 0` means a stray log fails the build.
- **Relative imports carry `.js`**: `import { x } from './engine/tour.js'`.
- **`import type` for type-only imports**; imports are grouped and alphabetised.
- **SSR-safe**: no `document`/`window` at module scope; guard with `isBrowser()`.
- **CSP-safe**: inject styles only via `injectStyles(css, id, nonce)`.
- Match the surrounding file's formatting. Prettier settles the rest.

### Rules that are not negotiable

1. **Never add a runtime dependency to `@guideflow/core`.** Zero-dep is a published promise.
2. **Never exceed the size budget.** `pnpm --filter @guideflow/core size` must stay ≤ 12 kB gzip.
3. **Never weaken a tsconfig or ESLint rule to silence an error.** Fix the code.
4. **Never add `--passWithNoTests` to a new package.** It makes an empty suite look green.
5. **Never edit `docs/*.html`.** Edit `apps/docs/`.

---

## Making a change

1. Branch off `master`.
2. Write the change **and a test that fails without it**. Bug fixes especially — most of the known
   defects in this repo exist because behaviour was never pinned.
3. If the change is user-visible in a published package, update `apps/docs/` in the same commit.
   A doc that contradicts the code is a bug.
4. Add a changeset:
   ```bash
   pnpm changeset
   ```
   Write the summary for a consumer of the package, not for the repo. "Fix per-instance i18n so
   `gf.i18n.use()` affects rendered strings" — not "fix i18n bug".
5. Run the full gate before pushing:
   ```bash
   pnpm turbo run build type-check lint test --filter=!storybook --filter=!docs --filter=!e2e
   pnpm --filter @guideflow/core size
   ```

### Commit messages

Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, with an optional
scope — `fix(core): …`, `feat(devtools): …`.

---

## Pull requests

A PR is ready when:

- [ ] build, type-check, lint and tests are green
- [ ] `@guideflow/core` is still within budget (if you touched it)
- [ ] a test covers the new behaviour or the fixed bug
- [ ] docs in `apps/docs/` are updated
- [ ] a changeset is included (or the change is genuinely internal)
- [ ] the description says what a *user* will notice

CI runs build, type-check, lint and unit tests on Node 22. Note that CI does **not** currently run the
e2e suite, Storybook, or the size gate — so run the size gate locally.

---

## Testing

| Layer | Tool | Where |
|---|---|---|
| Unit | Vitest + happy-dom | `packages/*/src/__tests__/` |
| Component | Storybook 8 | `apps/storybook/stories/` |
| E2E | Playwright | `apps/e2e/tests/` |

Current reality: `core`, `ai`, `analytics` and `react` have unit tests; `vue`, `svelte`, `cli` and
`devtools` have none; the Playwright suite does not currently run. Contributions to any of those are
high-value. See [`.claude/docs/TESTING-STRATEGY.md`](.claude/docs/TESTING-STRATEGY.md).

---

## Reporting bugs

Include: package and version, framework and version, a minimal reproduction (a flow definition plus
the relevant markup), what you expected, what happened, and browser/OS.

For **security** issues, do not open a public issue — see [`SECURITY.md`](SECURITY.md).

---

## Licence

By contributing you agree that your contributions are licensed under the [MIT Licence](LICENSE).
