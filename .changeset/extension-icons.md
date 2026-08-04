---
'@guideflow/devtools': patch
---

Fix the extension icons, which were never square

Measured from the PNG headers: `icon-16.png` was 15×16, `icon-48.png` was 46×48
and `icon-128.png` was 122×128 — a few pixels narrow each, from the day they
were added. Chrome renders those squashed, and the Chrome Web Store requires an
exact 128×128 for a listing.

Regenerated centred on square canvases, so the artwork is padded rather than
stretched, and at bit depth 8 rather than 16 — which takes the 128px icon from
17.7 kB to 8.1 kB.

`store-readiness.test.ts` now reads each PNG's IHDR chunk and asserts it matches
the size its manifest key claims, so an icon named for a size it is not cannot
ship again.
