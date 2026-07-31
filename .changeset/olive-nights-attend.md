---
'@guideflow/analytics': patch
'@guideflow/svelte': patch
'@guideflow/react': patch
'@guideflow/core': patch
'@guideflow/vue': patch
'@guideflow/cli': patch
'@guideflow/ai': patch
---

Correct the author identity shipped inside every package.

The header block at the top of each package entry point named
`github.com/johnmugabe` and a `@263tickets.co.zw` address, neither of which owns
the repository or reads mail for it. Because `"files"` ships `src`, both strings
went out inside the published tarballs. The headers now carry the owner from
`repo.config.json` (`github.com/RealNerdZW`), and the `@email` line is gone —
vulnerabilities are reported through GitHub Security Advisories, as `SECURITY.md`
says.

No runtime code changed.
