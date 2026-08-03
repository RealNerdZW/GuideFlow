---
description: Author and validate GuideFlow tours from any MCP client — a read-only server holding no credentials and making no network calls.
keywords: guideflow mcp server, model context protocol, agentic tour authoring, ai product tours, mcp tools
---

# MCP server

Point an MCP client at a project and it can find, read, write and validate its product
tours — using the same validator `guideflow validate` and the DevTools Recorder use.

```bash
npm install -g @guideflow/mcp
```

```json
{
  "mcpServers": {
    "guideflow": {
      "command": "guideflow-mcp",
      "args": ["--root", "/path/to/your/project"]
    }
  }
}
```

## The inversion

`@guideflow/ai` calls a model **from the browser**, which means the customer's API key
is in the bundle. This is the other direction, and it is the more defensible half of the
"AI-powered" claim:

> Expose the authoring engine as tools, and let whatever agent the operator already
> trusts do the generating.

Two consequences follow, and both are the point:

- **No credentials, no network.** This server calls nothing. There is nothing to leak.
  `guideflow_author_flow` does **not** call a model — the client *is* the model. It
  converts and validates what the model wrote.
- **Every tool is read-only.** Nothing writes a file. Authoring returns the exact bytes
  and lets the client's own file tools save them, under whatever permissions the
  operator already granted.

## Tools

### `guideflow_list_flows`

Every `*.flow.json` under the root, with a health summary: whether it is valid, how many
errors and warnings, how many steps, and its structural fingerprint. Paginated.

There is no hosted flow store — a flow is a [static asset](/guide/hosting-flows) — so
this walks a directory. `node_modules`, `.git`, `dist`, `build`, `coverage` and dotted
directories are skipped; the walk is bounded to 8 levels and 500 files.

An invalid flow is still **named**: the id is recovered from the raw JSON when validation
withheld it, because "which file is the broken tour?" is exactly the question you ask
when something is broken.

### `guideflow_get_flow`

One flow, by `path` or by `flowId`, with the derived facts that are easy to get wrong by
eye — `stepCount` walks the `NEXT` path from `initial` rather than summing every state's
array, which is the distinction that once put a Done button on step one of a two-state
tour. Two files declaring the same id is reported as ambiguous rather than silently
resolved to the first.

### `guideflow_validate_flow`

The engine's real rules. Every issue carries a stable `code`, a `path`, and a `hint`
naming the fix in one imperative sentence.

Selector rules are skipped, not failed: there is no DOM in this process.

### `guideflow_author_flow`

A linear step list becomes a valid `FlowDefinition`: one state per step, the `NEXT`
transitions between them, `final: true` on the last, and the envelope. Then it validates
the result and refuses to hand back something the engine would mishandle.

It returns `fileContents` — save it yourself.

## Why there is no `simulate`

The original proposal had a fifth tool: drive a flow headlessly against a URL and return
step-by-step screenshots. It is the most valuable of the five, and it is deliberately not
here.

It needs a browser download, a running copy of your app, and a screenshot transport. This
project has spent ten phases deleting things that were half of that, and `apps/e2e` is a
standing measurement of what the full thing costs. Shipping a `simulate` that works on a
static page and silently does nothing useful on a real SPA would be worse than not having
one.

What exists instead: `guideflow_validate_flow` catches every *structural* failure with no
browser at all — including the dangling transition that makes the engine truncate a tour
**and record it as completed**, so it never shows again. Selector verification against a
real page is the [DevTools Recorder](/packages/devtools)'s job, where there is a real DOM.

## Security

Every path goes through one sandbox function, and there is no way to opt out.

- **The root is the operator's choice, never a tool argument.** A `root` parameter would
  let a model that had been talked into it point the server anywhere on the disk.
- `..` is collapsed and then refused.
- Containment is checked on path **segments**. A naive prefix check accepts
  `/srv/tours-secret` for a root of `/srv/tours`; this does not.
- Symlinks are resolved and re-checked — including for a file that **does not exist yet**
  underneath a directory symlink pointing out of the root, which a
  `try { realpath() } catch { accept }` would wave through.

The server also writes nothing, so the worst a confused agent can do is read a flow file
you pointed it at.

## Related

- [Authoring](/guide/authoring) — the validator and the flow-file format
- [Hosting flows](/guide/hosting-flows) — why a flow is a file
- [@guideflow/devtools](/packages/devtools) — the Recorder, for selectors against a real page
