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

- `window.postMessage(msg, '*')` broadcasts to **every** script on the page, and the receiving
  listener trusts only a string sentinel on `data.source`. Any page script can both read the tour
  stream and forge commands. Do not add new message types to this channel without reading
  `.claude/docs/SECURITY-MODEL.md` §extension first.
- Never render page-derived strings into panel/popup DOM via `innerHTML` or
  `dangerouslySetInnerHTML`. The panel runs with extension privileges.
- `chrome.runtime.onMessage` handlers must validate `sender.tab` / `sender.id`.
- Keep `host_permissions` as narrow as the feature allows; `<all_urls>` is the current, overly broad
  setting and is an audit finding.

## Firefox / Edge

Code uses `chrome.*` directly. Edge is fine (Chromium). Firefox needs the `browser.*` namespace or a
polyfill, plus MV3 differences around background scripts. There is currently no `web-ext` build and
no packaging job — packaging for a store is unimplemented.
