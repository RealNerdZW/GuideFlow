# Submitting to the Chrome Web Store

Everything here needs a human. An account has to be created, a fee has to be paid with a
card, and a review has to be waited on. Nothing in this repository can do any of it.

What the repository *has* done is make the mechanical half unable to be wrong:
`store-readiness.test.ts` fails the build if the manifest, the icons or this pack drift
out of shape, and `no-network.test.ts` fails it if the privacy claim stops being true.

---

## Before you start

- [ ] A Google account you are happy to publish under, permanently. The developer name is
      shown on the listing and is painful to change later.
- [ ] **US$5**, one-off, non-refundable, for the developer registration.
- [ ] Two-step verification enabled on that account — the dashboard requires it.

## 1. Take the screenshots (20 min)

At least one is mandatory, at 1280×800 or 640×400. Take them against the real extension;
a mock-up that does not match what installs is a rejection risk and, more practically, a
lie.

```bash
pnpm --filter @guideflow/devtools build
```

Then load `packages/devtools/dist` at `chrome://extensions` → **Load unpacked**, with
Developer mode on. Open any page running GuideFlow — `pnpm demo` serves one — and:

1. **The Recorder.** Toolbar button → Open Recorder. Record three or four steps against
   the demo so the step list is populated and the validation panel is green.
2. **The panel.** Open DevTools → GuideFlow → Events, and run a tour so the event list has
   real entries in it.
3. *(Optional but the most persuasive)* the Recorder refusing to export a deliberately
   broken flow, with the validator's message visible.

Resize the window so the capture is exactly 1280×800. Do not include your own browser
chrome, bookmarks bar, or anything identifying.

Save them to `packages/devtools/store/screenshots/`. They are **not** committed — see the
`.gitignore` note in that directory — because binary marketing assets in a source
repository rot silently and the store keeps the canonical copy.

## 2. Register (10 min)

<https://chrome.google.com/webstore/devconsole>

Pay the $5. Set the developer display name. If this is meant to look like a project rather
than a person, say so here — it is what appears under the listing title.

## 3. Package

```bash
pnpm --filter @guideflow/devtools build
node scripts/pack-extension.mjs
```

That writes `guideflow-devtools-<version>.zip` at the repository root, with
`manifest.json` at the archive root — the packer refuses to write the zip otherwise,
because a nested layout is accepted by the uploader and then fails in a way that names
neither cause.

Upload that zip. Do not zip `dist/` by hand.

## 4. Fill in the listing

Everything you need is in [`LISTING.md`](./LISTING.md), field by field, ready to paste:
name, summary, detailed description, single-purpose statement, a justification for every
permission, and the data-usage declaration.

Privacy policy URL:

```
https://github.com/RealNerdZW/GuideFlow/blob/master/packages/devtools/store/PRIVACY.md
```

## 5. Expect questions about broad site access

This is the one thing likely to come back. The extension runs a content script on
`<all_urls>`, and reviewers scrutinise that hardest.

The justification is real and is written out in `LISTING.md`: the extension authors tours
*for the developer's own application*, whose address cannot be known in advance, and it has
no network code at all so nothing it reads can leave the machine — which is verified by a
test in a public repository.

If the reviewer pushes back anyway, the options in order of preference are:

1. **Point at `no-network.test.ts`** and the absence of `host_permissions`. Reviewers
   respond to verifiable claims.
2. **Offer `optional_host_permissions`.** Note that Phase 7.9b *removed* this deliberately:
   it was never actually requested at runtime, so it silently withheld the content script
   and the extension appeared broken. Re-adding it means also adding the request flow and
   testing it — real work, not a manifest edit.
3. **Ship unlisted.** The extension installs from a direct link and is not in search
   results. For a developer tool aimed at people who already use the library, that loses
   less than it sounds.

## 6. Submit, then wait

Review is usually a few days and can be weeks for an extension with broad host access.
Rejections arrive by email with a policy reference.

---

## After it is published

- [ ] Replace the "load unpacked" instructions in
      [`apps/docs/packages/devtools.md`](../../../apps/docs/packages/devtools.md) with the
      store link.
- [ ] Add the store badge to the root README.
- [ ] Record the extension ID here — it is stable across updates and needed for support.
- [ ] Tick 7.9c in `.claude/docs/REMEDIATION-PLAN.md`.

### Published extension ID

```
(not yet published)
```

---

## Updating later

The version in `packages/devtools/package.json` is the single source of truth; the Vite
build injects it into `dist/manifest.json`. Changesets bumps it along with every other
package in the fixed group.

The store rejects an upload whose version is not higher than the published one, so a
re-upload after a rejection needs a version bump — which, in this repo, means going
through changesets rather than hand-editing the manifest.
