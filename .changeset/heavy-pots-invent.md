---
'@guideflow/cli': patch
---

Documentation only: the README now describes what the CLI actually does.

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
