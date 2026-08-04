# Chrome Web Store listing copy

Everything on this page is meant to be pasted into the Developer Dashboard verbatim.
Field names match the dashboard's own labels.

---

## Store listing

### Name (45 char limit)

```
GuideFlow DevTools
```

### Summary / short description (132 char limit)

```
Inspect, record and validate GuideFlow.js product tours. Build a tour by clicking through your app. Nothing leaves your machine.
```

*127 characters.*

### Category

`Developer Tools`

### Language

`English (United Kingdom)`

### Detailed description

```
GuideFlow DevTools is the authoring surface for GuideFlow.js, an open-source product-tour
library whose tours are real finite state machines rather than linear step arrays.

WHAT IT DOES

• Record a tour by clicking through your own app. Each click becomes a step, with a CSS
  selector generated for the element and verified to match exactly one thing on the page.
• Inspect any page running GuideFlow: which flows are registered, which tour is active,
  which step it is on, and every tour event as it fires.
• Validate before you ship. The Recorder runs the same validator the GuideFlow CLI does,
  so it catches the failures that are silent at runtime — a transition naming a state that
  does not exist, a duplicate step id, an unreachable state.
• Export a .flow.json file you can commit, review in a pull request, and serve as a
  static asset.

WHO IT IS FOR

Developers already using, or evaluating, GuideFlow.js. It is not a general-purpose
recorder: it detects GuideFlow through the window.__guideflow global that an integration
sets, and the panel says plainly when a page is not running it.

PRIVACY

This extension has no server, no analytics and no network code of any kind. It cannot
send anything anywhere. Tours you record are saved in your own browser profile via
chrome.storage and are cleared when you uninstall it or use Clear All Data.

That is enforced rather than promised: the project's test suite fails the build if any
network call appears in the extension's source, and the manifest requests no host
permissions.

OPEN SOURCE

MIT licensed. https://github.com/RealNerdZW/GuideFlow
```

---

## Privacy practices tab

### Single purpose description

```
Author and inspect GuideFlow.js product tours on a page the developer is working on:
record a click-path into a tour definition, validate it, and observe the library's tour
events.
```

### Permission justifications

Paste each into the matching box. The reviewer reads these individually.

**`activeTab`**

```
Used so the context-menu items ("Add Element to GuideFlow Tour", "Inspect with GuideFlow",
"Quick Tour from Here") and the toolbar popup act on the tab the developer is currently
looking at. Without it those commands have no target.
```

**`contextMenus`**

```
The extension adds three right-click entries that are its primary way of picking an element
to turn into a tour step. Selecting an element by right-clicking it is faster and more
accurate than a coordinate-based picker for the small controls tours usually point at.
```

**`storage`**

```
Saves recorded tours and two preferences (debug logging, auto-record) in the developer's
own browser profile via chrome.storage.local, and keeps the in-progress recording buffer
in chrome.storage.session so a recording survives a page navigation or the DevTools window
closing. No data is transmitted anywhere; there is no network code in the extension.
```

**Host permission / broad site access (content script on `<all_urls>`)**

```
The extension authors tours FOR the developer's own web application, and cannot know that
application's address in advance — it is typically localhost during development and a
different origin per customer in production. A fixed match list would make the extension
work for one project and silently fail for every other.

The content script is inert until the developer acts: it detects whether the page exposes
GuideFlow, and otherwise does nothing. Recording starts only from an explicit action in
the DevTools panel or a context-menu item.

The extension has no network code at all, so nothing it reads can leave the machine. This
is verified by a test in the project's public repository
(packages/devtools/src/__tests__/no-network.test.ts) that fails the build if fetch,
XMLHttpRequest, WebSocket, EventSource, sendBeacon or a remote import appears in the
source.
```

**Remote code use**

```
No. Everything the extension executes ships inside the package. The content security
policy is "script-src 'self'; object-src 'self'", which forbids remote script and eval.
```

### Data usage declarations

Tick **nothing** on the data-collection form, and state:

```
This extension collects no user data. It has no server, no analytics and no network code.
Tours the developer records are stored locally via chrome.storage and never transmitted.
```

### Privacy policy URL

```
https://github.com/RealNerdZW/GuideFlow/blob/master/packages/devtools/store/PRIVACY.md
```

*A GitHub URL is acceptable to the store. If the docs site later hosts it, update this and
the dashboard together.*

---

## Graphic assets

The dashboard requires these. `assets/icon-128.png` covers the store icon; the rest have
to be produced.

| Asset | Requirement | Status |
|---|---|---|
| Store icon | 128×128 PNG | **Ready** — `assets/icon-128.png` |
| Screenshot 1 | 1280×800 or 640×400 | **Needed** — the Recorder with a captured step list |
| Screenshot 2 | same | **Needed** — the DevTools panel showing live tour events |
| Screenshot 3 | same | *Optional* — the validator refusing a broken flow |
| Small promo tile | 440×280 | *Optional* |
| Marquee promo tile | 1400×560 | *Optional, only for featuring* |

At least one screenshot is mandatory. See `SUBMITTING.md` for how to take them against the
real extension rather than mocking them up.
