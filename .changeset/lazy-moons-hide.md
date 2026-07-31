---
"@guideflow/cli": minor
---

`vite` is no longer a runtime dependency.

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
