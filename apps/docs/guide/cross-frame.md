---
description: Drive a GuideFlow tour from a parent page across an iframe boundary with postMessage — a closed command allowlist over the public API, and the event.origin discipline that keeps the channel from becoming a hole.
keywords: postMessage tour control, iframe product tour, embedded demo control, cross-origin postMessage security, guideflow remote control
---

# Recipe: driving a tour across an iframe

Your application is in an iframe and something outside it wants to start a tour:
an embedded sandbox on your docs site, a training console, a support view with
the customer's app on one side and a script on the other.

There is no library feature for this, and there should not be — `postMessage` is
already the channel, and the tour API is already public. What follows is about
**forty lines of your code**, and the part worth reading twice is the validation.

::: danger An origin-blind listener is a remote control for anyone
Any page on the internet can `postMessage` into a window it can reach, including
one it opened. A listener that acts on `event.data` without checking
`event.origin` lets an arbitrary site start, drive and end tours in your
application — and, if you accept a whole flow definition over the wire, position
copy of its choosing over your real controls.
:::

## Inside the app frame

```ts
import type { GuideFlowInstance } from '@guideflow/core'

/**
 * Origins allowed to drive this tour. EXACT strings — never a prefix test, a
 * `includes`, or a RegExp: `startsWith('https://docs.example.com')` is also true
 * of `https://docs.example.com.attacker.test`.
 */
const ALLOWED_ORIGINS = new Set(['https://docs.example.com'])

/** The only commands that cross. Everything else is dropped, silently. */
const COMMANDS = new Set(['start', 'next', 'prev', 'stop', 'goTo'])

/** Sentinel, so we ignore other libraries' traffic. NOT authentication. */
const SOURCE = 'acme-tour-remote'

const MAX_ID_CHARS = 120

export function installTourRemote(gf: GuideFlowInstance): () => void {
  const embedder = window.parent
  // Not framed: there is nobody to talk to, and `window.parent === window`.
  if (embedder === window) return () => {}

  /**
   * The allowed origin we last heard from — the one address status goes back to.
   *
   * The obvious version of `report` loops over ALLOWED_ORIGINS and posts to
   * each. That sends N messages of which the browser delivers **one** and
   * silently drops N-1, because a post whose `targetOrigin` does not match the
   * receiving document is discarded. Harmless with a single allowed origin;
   * wasteful and confusing with several, and this file is written to be copied.
   *
   * Seeded when there is exactly one candidate, so a parent that only listens
   * still gets status. With several, nothing goes out until one of them has
   * identified itself.
   */
  let driverOrigin: string | null =
    ALLOWED_ORIGINS.size === 1 ? ([...ALLOWED_ORIGINS][0] ?? null) : null

  function onMessage(event: MessageEvent): void {
    // 1. It came from the window we expect.
    if (event.source !== embedder) return
    // 2. From an origin we allow. This is the authentication.
    if (!ALLOWED_ORIGINS.has(event.origin)) return
    // Past the gate, so this is where status belongs. See `report` below.
    driverOrigin = event.origin

    // 3. It is shaped like one of ours.
    const data = event.data as Record<string, unknown> | null | undefined
    if (!data || typeof data !== 'object') return
    if (data['source'] !== SOURCE) return

    // 4. It names a command on the allowlist.
    const type = data['type']
    if (typeof type !== 'string' || !COMMANDS.has(type)) return

    // 5. Per-command shape check. Never pass a value straight through.
    switch (type) {
      case 'start': {
        const flowId = data['flowId']
        if (typeof flowId !== 'string' || flowId === '' || flowId.length > MAX_ID_CHARS) return
        // A registered id, not a flow definition — see below.
        void gf.start(flowId)
        return
      }
      case 'goTo': {
        const stepId = data['stepId']
        if (typeof stepId !== 'string' || stepId === '' || stepId.length > MAX_ID_CHARS) return
        void gf.goTo(stepId)
        return
      }
      case 'next': void gf.next(); return
      case 'prev': void gf.prev(); return
      case 'stop': gf.stop(); return
    }
  }

  window.addEventListener('message', onMessage)

  // Status back. A concrete target origin on every post — never '*'.
  function report(payload: Record<string, unknown>): void {
    if (driverOrigin === null) return
    embedder.postMessage({ source: 'acme-tour', ...payload }, driverOrigin)
  }

  const offEnter = gf.on('step:enter', ({ stepId, stepIndex }) => {
    // A FRESH object. Forwarding the payload throws DataCloneError, because
    // `step:enter` carries `target: Element | null` and a DOM element is not
    // structured-cloneable.
    report({ type: 'step', stepId, stepIndex, totalSteps: gf.totalSteps })
  })
  const offDone = gf.on('tour:complete', ({ flowId }) => report({ type: 'complete', flowId }))
  const offGone = gf.on('tour:abandon', ({ flowId }) => report({ type: 'abandon', flowId }))

  return () => {
    window.removeEventListener('message', onMessage)
    offEnter()
    offDone()
    offGone()
  }
}
```

## Outside it

```js
const APP_ORIGIN = 'https://app.example.com'
const frame = document.querySelector('#app-frame')

function send(command) {
  // Addressed to one origin. With '*' the message is delivered to whatever
  // document happens to be in that frame — including one you were navigated to.
  frame.contentWindow.postMessage({ source: 'acme-tour-remote', ...command }, APP_ORIGIN)
}

document.querySelector('#run-billing-tour').addEventListener('click', () => {
  send({ type: 'start', flowId: 'billing-setup' })
})

window.addEventListener('message', (event) => {
  if (event.origin !== APP_ORIGIN) return
  if (event.source !== frame.contentWindow) return
  if (event.data?.source !== 'acme-tour') return

  if (event.data.type === 'step') {
    caption.textContent = `Step ${event.data.stepIndex + 1} of ${event.data.totalSteps}`
  }
})
```

Both directions here are cross-origin, and that is fine — `postMessage` is
designed for exactly that. What the parent needs is not same-origin access but a
**reference to the frame's window**, which `contentWindow` gives it because it is
the document that embedded the frame. (`contentWindow` itself is readable across
origins; `contentDocument` is not, and you do not need it.) A page that merely
sits alongside yours has no such reference and no way to reach the app frame.

## The rules, and why each one is there

These are the rules for **this** recipe — a channel that crosses an origin
boundary. Three of them come straight out of
`packages/devtools/src/content/inspector.ts`, the extension's own page-message
listener, and are marked below; the rest do not apply there and it does not
implement them, because that channel has both ends inside one document and
therefore no origin to check. [Why the extension does it
differently](#why-the-extension-does-it-differently) is the whole story. Do not
read this list as a description of that file.

**Check `event.source`.** *(also in `inspector.ts`, as `event.source !== window`)*
Identity of the sending window, set by the browser and unforgeable. It is what
stops a nested frame or a popup from impersonating the embedder.

**Match the origin exactly.** `Set.has`, or `===`. Not `startsWith`, not
`includes`, not a RegExp you wrote in a hurry. Prefix matching on origins is the
single most common way this goes wrong, and the domain that exploits it is one
registration away.

**Refuse an opaque origin.** A sandboxed frame, a `data:` URL and a `file:` page
all report `event.origin === "null"`, and they all report the *same* `"null"`.
It cannot be allowlisted, because allowlisting it allowlists every one of them.

**Allowlist the commands.** *(also in `inspector.ts`, as its `RELAYABLE` set)* A
closed set of verbs, checked before anything is read out of the payload. Adding a
verb should mean adding a validator, in the same commit.

**Validate per command, and build a fresh object.** *(also in `inspector.ts`, as
`sanitizeRelayed` and its JSON round-trip)* Bound every string, reject rather
than coerce, and never hand the sender's own object to anything. The sender's
object may have a prototype, a getter, or a cycle.

**Never `'*'` as a target origin.** A wildcard post is delivered to whichever
document is in that window when it arrives — which is not necessarily the one
you meant, if the frame navigated. And treat the channel as public regardless:
anything you post can be read by any listener in the receiving document. Do not
put user data on it.

That last one is a rule for *this* recipe, and `inspector.ts` deliberately breaks
it: on a page whose own origin is opaque it falls back to `'*'`, because an
opaque origin cannot be named as a `targetOrigin` at all. It can afford that
only because its `event.source === window` check already confines the message to
one document. Across a frame boundary you have no such fallback, and no need for
one — you know the origin, so name it.

**Send ids, never definitions.** `gf.start(flowId)` looks the id up among the
flows you registered and warns if there is no match, so the command surface is
closed by construction. Accepting a `FlowDefinition` over the wire would let the
other origin choose the copy that appears over your real controls — and, if you
have configured [`sanitizeHTML`](/guide/flows-and-steps), the markup too.

### Do not use `exposeGlobal` for this

`createGuideFlow({ exposeGlobal: true })` puts the instance on
`window.__guideflow` for the [devtools extension](/packages/devtools). It is a
debugging aid, off by default, and it is not the seam for remote control:

- It is same-document, so it does nothing for a cross-origin parent anyway.
- The instance extends the event emitter, so anything holding it can
  `emit('tour:complete', { flowId })`. That runs core's own completion handler,
  writes a completed record, and `start()` honours it — one line from any script
  on the page permanently stops that tour reaching that user again.

The command allowlist above exists precisely so that "drive the tour" does not
mean "hold the tour".

## Why the extension does it differently

`inspector.ts` does not check `event.origin` at all, and does not refuse an
opaque one. It guards its channel with a per-page-load nonce instead. That is
not an alternative worth copying here. Both ends of *that* channel live in the
same document, so the origins are identical and checking one proves nothing; the
nonce only means a script that did not observe the injection cannot blindly forge
a message. Any script that *did* observe it can read the nonce straight off the
DOM — the file's own comment says so, and says to treat the channel as public
regardless. It is a speed bump, not authentication, and it is not trying to be.

What it does have is the part that generalises: a closed relay allowlist and a
per-type validator, so even a forged message can only carry one of four shapes
into the privileged world.

Across a frame boundary you have a real origin, and it is real authentication.
Use it.

## Related

- [`exposeGlobal` and the extension](/packages/devtools) — the same-document case
- [Guides in your help centre](/guide/help-centre) — the no-JavaScript way to start a named tour
- [Flows & steps](/guide/flows-and-steps) — what a flow id refers to
- [createGuideFlow()](/api/create-guide-flow) — the API these commands call
