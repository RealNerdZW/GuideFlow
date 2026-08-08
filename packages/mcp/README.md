# @guideflow/mcp

An MCP server that exposes [GuideFlow.js](https://github.com/RealNerdZW/GuideFlow) tour
authoring as tools, so any MCP client can find, read, write and validate product tours.

```bash
npm install -g @guideflow/mcp
```

## Add it to your client

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

`--root` scopes every file read. It defaults to `$GUIDEFLOW_ROOT`, then to the working
directory the client launches the server in.

## The inversion

`@guideflow/ai` calls a model *from the browser*, with the customer's API key in the
bundle. This is the other direction: the authoring engine becomes tools, and whatever
agent the operator already trusts does the generating.

Two consequences, and both are the point:

- **This server holds no credentials and makes no network calls.** There is nothing to
  leak. `guideflow_author_flow` does not call a model — the client *is* the model. It
  converts and validates what the model wrote.
- **Every tool is read-only.** Nothing writes a file. Authoring returns the exact bytes
  to write and lets the client's own file tools save them, under whatever permission
  model the operator already has.

## Tools

| Tool | What it does |
|---|---|
| `guideflow_list_flows` | Every `*.flow.json` under the root, with a health summary |
| `guideflow_get_flow` | One flow by path or by id, plus derived facts |
| `guideflow_validate_flow` | The engine's real rules, with a fix for every problem |
| `guideflow_author_flow` | A step list → a validated flow file, as bytes to save |
| `guideflow_extract_strings` | A flow → the translation catalogue skeleton, keyed by id |
| `guideflow_translate_flow` | A filled catalogue → every way it is silently wrong |

The validator is `@guideflow/core/authoring`'s — the same one `guideflow validate` and
the DevTools Recorder use, not a re-implementation. A flow that passes here is one the
engine will run.

## Translation, with no translation service

The same inversion again: `guideflow_extract_strings` gives you every translatable
string keyed by step id and state id, **you** translate the values, and
`guideflow_translate_flow` checks the result. No key, no network, no vendor.

A translated catalogue is silently wrong in four ways, none of which throws, logs, or
fails a test in the host application:

1. **A key that resolves to no step or state.** It is simply never read.
2. **A lost `{{token}}`.** The content pipeline is `content → catalogue → {{token}} →
   renderer`, catalogue first *so that* a translated string containing `{{firstName}}`
   still resolves. A translation that dropped it renders the sentence without the name —
   in one locale, for as long as nobody on the team reads that locale.
3. **A field the original step does not have.** The catalogue merges over content, so it
   *adds* the line in that locale and no other.
4. **An empty value.** It is a value, so it blanks the copy rather than falling through.

An incomplete translation is a warning, never an error: a missing key falls through to
the flow's own copy, which is a working page.

```
extract → translate the values in place → check → save the bytes → registerContent()
```

Token *names* are compared, not the written form, so translating the fallback in
`{{plan|your plan}}` is correct.

## Why there is no `simulate`

`MCP-AND-SKILLS.md` proposed a fifth tool: drive a flow headlessly against a URL and
return step-by-step screenshots. It is the most valuable of the five and it is not here,
because it needs a browser download, a running copy of the operator's app, and a
screenshot transport — and this repository has spent ten phases deleting things that
were half of that. `apps/e2e` shows what it actually costs.

The honest partial answer today: `guideflow_validate_flow` catches every structural
failure without a browser, and the DevTools Recorder verifies selectors against a real
page. See the deferral note in ADR-019.

## Security

Every path goes through one sandbox function, and there is no way to opt out:

- The root is chosen by the **operator**, never by a tool argument. A `root` parameter
  would let a model that had been talked into it point the server anywhere.
- `..` traversal is collapsed and then refused.
- Containment is checked on path **segments**, so `/srv/tours-secret` is not accepted
  for a root of `/srv/tours`.
- Symlinks are resolved and re-checked — including for a file that does not exist yet,
  underneath a directory symlink that points out of the root.

## Documentation

Full guide: <https://realnerdzw.github.io/GuideFlow/guide/mcp>

Licence MIT.
