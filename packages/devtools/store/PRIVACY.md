# Privacy policy — GuideFlow DevTools

**Last updated: 2026-08-04**

## The short version

**This extension never sends anything anywhere.** It has no server, no analytics, no
telemetry, no crash reporting and no network code of any kind. Everything it observes
stays in your browser profile on your machine.

That is not a promise about intent — it is enforced. `packages/devtools/src/__tests__/no-network.test.ts`
fails the build if `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or a
remote `import()` appears anywhere in the extension's source, and the manifest requests no
host permissions, so the background service worker has no cross-origin reach either.

## What it can see

GuideFlow DevTools is a developer tool for building product tours with
[GuideFlow.js](https://github.com/RealNerdZW/GuideFlow). To do that it runs a content
script on pages you visit, which can read:

- **Page structure.** When you use the element picker or the recorder, it reads the DOM
  around the element you clicked in order to generate a CSS selector for it.
- **GuideFlow tour events.** If the page exposes a GuideFlow instance on
  `window.__guideflow`, the extension subscribes to its tour events so the DevTools panel
  can show them.

It does **not** read page content you have not pointed it at, does not monitor typing,
and does not record browsing history.

## What it stores, and where

All of it in `chrome.storage`, which is local to your browser profile:

| What | Where | Cleared by |
|---|---|---|
| Tours you save in the Recorder | `chrome.storage.local` | "Clear All Data" in the panel's Settings tab, or uninstalling |
| Debug / auto-record preferences | `chrome.storage.local` | the same |
| The in-progress recording buffer | `chrome.storage.session` | closing the browser |

`chrome.storage.session` is deliberate: an in-progress recording survives the DevTools
window closing and a page navigation, but not a browser restart.

## What it does not do

- No accounts, no sign-in, no identifiers.
- No advertising, and no data sold or shared with anyone — there is no one to share it
  with.
- No remote code. Everything the extension runs ships inside it, and its content security
  policy forbids anything else.

## Permissions, and why each one exists

| Permission | Why |
|---|---|
| `activeTab` | Act on the tab you are looking at when you use the toolbar button or a context-menu item |
| `contextMenus` | The right-click entries: "Add Element to GuideFlow Tour", "Inspect with GuideFlow", "Quick Tour from Here" |
| `storage` | Save your tours and preferences locally, per the table above |
| Content script on all sites | You build tours **for your own site**, and the extension cannot know its address in advance. It activates only when you open the panel or use a menu item |

## Data deletion

Uninstalling the extension removes everything. To clear it without uninstalling, use
**Clear All Data** in the DevTools panel's Settings tab.

## Changes

This extension is open source. Any change to what it collects is visible in the
[commit history](https://github.com/RealNerdZW/GuideFlow/commits/master/packages/devtools),
and this file changes in the same commit.

## Contact

Report a concern through
[GitHub Security Advisories](https://github.com/RealNerdZW/GuideFlow/security/advisories/new)
or as a [public issue](https://github.com/RealNerdZW/GuideFlow/issues).
