---
name: gf-extension-dev
description: Build, load, and manually exercise the GuideFlow MV3 devtools browser extension — bundle verification, loading unpacked, the page/content/background/panel message path, and the tour recorder. Use when changing packages/devtools, when the panel does not detect a page, when debugging the postMessage bridge or the service worker, or when asked to test or package the extension.
---

# /gf-extension-dev — working on the devtools extension

`@guideflow/devtools` is a Manifest V3 extension. It is `private: true` and has **no automated
tests**, so manual verification is the only gate — do it every time.

## Architecture: the four worlds

```
 PAGE WORLD                 ISOLATED WORLD            EXTENSION
 ┌──────────────┐           ┌──────────────┐          ┌───────────────┐
 │ your app     │           │ content.js   │          │ background.js │
 │ window.      │◀─inject──▶│ (inspector)  │◀─runtime▶│ (service      │
 │  __guideflow │           │              │  msg     │  worker)      │
 │              │           │              │          └───────┬───────┘
 │ bridge.js  ◀─┼─postMessage─▶            │                  │
 └──────────────┘           └──────────────┘          ┌───────▼───────┐
                                                      │ panel.js      │
                                                      │ popup.js      │
                                                      └───────────────┘
```

- `bridge.js` runs in the **page world** (injected via a `<script>` tag; it is a
  `web_accessible_resource`). Only page-world code can see `window.__guideflow`.
- `content.js` runs in the **isolated world**. It talks to the bridge with `window.postMessage` and
  to the extension with `chrome.runtime.sendMessage`.
- Sentinels: `__gf_bridge__` (bridge → content), `__gf_content__` (content → bridge).

**The library never sets `window.__guideflow`.** The host app must assign it — see
`apps/demo/src/main.tsx:100`. Every "extension does not detect my app" report is this.

## Build and verify the bundle

```bash
pnpm --filter @guideflow/devtools build
ls -R packages/devtools/dist
```

Every path named in `manifest.json` must exist in `dist/`:

| manifest key | expected file |
|---|---|
| `background.service_worker` | `background.js` (ES module) |
| `content_scripts[0].js` | `content.js` — **must be IIFE, not ESM**; a content script cannot use `import` |
| `web_accessible_resources` | `bridge.js` |
| `devtools_page` | `devtools.html` (+ `devtools.js`) |
| panel | `panel.html`, `panel.js` |
| `action.default_popup` | `popup.html`, `popup.js` |
| `icons` | `assets/icon-16.png`, `icon-48.png`, `icon-128.png` |
| — | `manifest.json` itself must be copied into `dist/` |

If any is missing, the extension fails to load with a bare "Manifest file is missing or unreadable"
or silently no-ops — fix `vite.config.ts` before going further.

## Load it

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `packages/devtools/dist`.
3. Note the errors panel on the extension card — MV3 reports manifest and service-worker errors there.
4. Re-load the extension after **every** rebuild. `vite build --watch` (`pnpm --filter
   @guideflow/devtools dev`) rewrites `dist/` but Chrome does not hot-reload it.

## Exercise it against the demo

```bash
pnpm demo      # http://localhost:5173, assigns window.__guideflow
```

Then walk the whole path:

- [ ] Open DevTools → **GuideFlow** panel. It shows "detected" with a version.
- [ ] Panel lists registered flows (`GF_LIST_FLOWS` → `listFlows()`).
- [ ] Start a tour in the page; step events stream into the panel live.
- [ ] Panel Pause / Resume / Stop drive the page tour.
- [ ] **Reload the page** with the panel open — detection recovers (this is the `GF_PROBE` path).
- [ ] **Close and reopen DevTools** — panel re-detects without a page reload.
- [ ] Navigate to a different origin — panel resets rather than showing stale state.
- [ ] Open a second tab; the two panels do not cross-talk.
- [ ] Visit a page with **no** GuideFlow — panel shows a clean empty state, not a spinner forever.
- [ ] The action popup opens and its recording controls work end to end: pick element → step appears
      in the list → export produces a **valid `FlowDefinition`** (`initial` + `states`, not a flat
      `steps` array — check against `/gf-flow-authoring`).
- [ ] Recorded state survives a page reload, or the UI says clearly that it will not.

## Service-worker lifecycle

MV3 service workers are **killed after ~30 s idle**. Anything held in module scope in
`background/service-worker.ts` disappears. To test:

1. `chrome://extensions` → the extension's **service worker** link → it goes inactive.
2. Interact with the panel again and confirm everything still works.

State that must survive belongs in `chrome.storage.session`, not a module-level variable.

## Security invariants — check on every change

Read `.claude/docs/SECURITY-MODEL.md` §5 before touching the message path. Since Phase 3.4:

- The bridge → content relay is **allowlisted**: only `GF_DETECTED`, `GF_FLOWS_LIST`,
  `GF_TOUR_EVENT` and `GF_ACTIVE_TOUR_STATE` cross into `chrome.runtime`, each after a per-type
  shape check in `sanitizeRelayed()`. **Adding a message type to this channel means adding a
  validator** — an unlisted type is silently dropped, which is exactly how a "my new event never
  reaches the panel" bug will present.
- Both directions carry a **per-page-load nonce** (`data-gf-nonce` on the injected `<script>` tag)
  and post to a concrete `targetOrigin`. The nonce is not a secret — a page script that watched the
  injection can read it. Never put anything on this channel the page must not see.
- `bridge.js` is injected as a **classic** script and `vite.config.ts` wraps it in an IIFE, because
  `document.currentScript` is null inside module scripts. **bridge.ts must stay import-free**; the
  build throws if ESM syntax appears in `dist/bridge.js`.
- Never render page-derived strings into panel/popup DOM via `innerHTML` or
  `dangerouslySetInnerHTML`. The panel runs with extension privileges.
- `chrome.runtime.onMessage` handlers validate `sender.id` and then split on `sender.tab`: content
  scripts may report tab state, only extension pages may touch `chrome.storage`.
- The manifest requests `activeTab`, `contextMenus`, `storage` and nothing else;
  `<all_urls>` is `optional_host_permissions` only. The `<all_urls>` **content script** is
  deliberate and justified in `src/content/inspector.ts`'s header. Do not add `tabs` back —
  `tabs.query`/`tabs.sendMessage`/`tabs.onRemoved` need no permission for what this extension does.
- The recorder must never capture password/hidden input values, credential-`autocomplete` fields, or
  anything under `[data-gf-private]`; those record `'[redacted]'`.

## Firefox / Edge

Code uses `chrome.*` directly. Edge is fine (Chromium). Firefox needs the `browser.*` namespace or a
polyfill, plus MV3 differences around background scripts. There is currently no `web-ext` build and
no packaging job — packaging for a store is unimplemented.
