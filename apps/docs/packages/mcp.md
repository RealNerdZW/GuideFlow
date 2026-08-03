# @guideflow/mcp

MCP server. Guide: [MCP server](/guide/mcp).

```bash
npm install -g @guideflow/mcp
```

Ships a `guideflow-mcp` binary that speaks MCP over **stdio**. Not HTTP: it reads the
operator's own filesystem, so it belongs in the operator's own process rather than behind a
port anything on the machine could reach.

Unlike every other package here, `@guideflow/core` is a real **dependency** rather than a
peer — this is an application, not a library, and there is no host bundle for a peer to
deduplicate against.

## Configuration

| | |
|---|---|
| `--root <dir>` | Directory every file read is scoped to |
| `GUIDEFLOW_ROOT` | Same, as an environment variable |
| *(neither)* | The working directory the client launched the server in |
| `--version`, `--help` | Print and exit |

The root is chosen by the **operator**, never by a tool argument — that is the whole
security model. See the guide.

## Tools

All four are `readOnlyHint: true` and `destructiveHint: false`. Nothing writes a file.

| Tool | Arguments |
|---|---|
| `guideflow_list_flows` | `limit` (1-200, default 50), `offset` |
| `guideflow_get_flow` | exactly one of `path` or `flowId` |
| `guideflow_validate_flow` | `flow` — a `FlowDefinition` or a `{ gfFlowFile, flow }` envelope |
| `guideflow_author_flow` | `id`, `name`, `steps[]`, `sourceUrl?` |

Every tool returns `structuredContent` alongside a JSON text block, so clients that render
only text still show something useful.

Errors come back as `isError` results with a message naming the next step — not as
transport exceptions — because that is what the model actually sees.

## Version

The version in the MCP handshake is substituted from `package.json` at build time via
tsup's `define`, so it cannot drift from what changesets published. The same arrangement
`@guideflow/devtools` uses for its extension manifest.

## Related

- [@guideflow/cli](/packages/cli) — `guideflow validate`, the same validator on the command line
- [@guideflow/core](/packages/core) — `./authoring`, where the rules live
