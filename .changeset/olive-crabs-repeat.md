---
"@guideflow/core": patch
"@guideflow/vue": patch
"@guideflow/svelte": patch
"@guideflow/cli": patch
---

Documentation and metadata corrections.

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
