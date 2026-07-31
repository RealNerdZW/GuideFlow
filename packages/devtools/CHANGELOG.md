# @guideflow/devtools

## 0.2.0

### Minor Changes

- c29870c: Stop recording input values, and single-source the extension version.

  **The recorder no longer captures what you typed.** Every `input` step carried a
  `value`, and the sensitive-field redaction added alongside it wrote
  `'[redacted]'` for password and hidden inputs, credential/OTP/payment
  `autocomplete` tokens, and anything inside a `[data-gf-private]` subtree.

  The panel never displayed that field. `BuilderTab` renders only `action`,
  `selector`, `label` and `tagName`, both when listing recorded actions and when
  importing them into the builder. Recorded steps are persisted to
  `chrome.storage`, so the field was pure liability — and not collecting it is
  strictly better than redacting it. `value` and `redacted` are gone from the
  `GF_RECORDED_STEP` payload and from the `RecordedStep` type, along with
  `isSensitiveField()` and `readFieldValue()`, which existed solely to guard
  `value`.

  **Label redaction is unaffected.** `[data-gf-private]` still replaces an
  element's label with `[redacted]`, because the label _is_ rendered in the panel.

  **The version now comes from one place.** `manifest.json` and `package.json`
  said `0.1.9`, the popup hardcoded `v0.2.0` in two spots, and the panel's About
  card hardcoded `v0.1.9`. `package.json` is now the single source: the Vite build
  injects `version` into `dist/manifest.json` — the source manifest no longer
  carries the key — and defines `__GF_VERSION__` for the panel and popup. A
  prerelease suffix is stripped for Chrome's dotted-integer `version` and kept in
  `version_name`.

  For that to hold, the package was removed from the changesets `ignore` array,
  which was the one thing freezing its version: `private: true` blocks publishing
  but not versioning, since `privatePackages.version` defaults to `true`. The
  extension is still never published, and is not git-tagged either.

### Patch Changes

- Updated dependencies [bbd09a8]
- Updated dependencies [8dc6621]
- Updated dependencies [8dc6621]
- Updated dependencies [b5dd516]
- Updated dependencies [4981071]
- Updated dependencies [4981071]
- Updated dependencies [37e9cb7]
- Updated dependencies [26164ec]
  - @guideflow/core@0.2.0
