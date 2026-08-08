# @guideflow/mcp

## 0.2.0

### Minor Changes

- 66fe2b0: New package `@guideflow/mcp` — author and validate tours from any MCP client

  `@guideflow/ai` calls a model from the browser, with the customer's API key in
  the bundle. This is the other direction, and the more defensible half of the
  "AI-powered" claim: expose the authoring engine as tools and let whatever agent
  the operator already trusts do the generating.

  ```json
  {
    "mcpServers": {
      "guideflow": { "command": "guideflow-mcp", "args": ["--root", "."] }
    }
  }
  ```

  Four tools: `guideflow_list_flows`, `guideflow_get_flow`,
  `guideflow_validate_flow`, `guideflow_author_flow`. The validator is
  `@guideflow/core/authoring`'s — the same one `guideflow validate` and the
  DevTools Recorder use, not a re-implementation.

  **It holds no credentials and makes no network calls.** `author_flow` does not
  call a model; the client _is_ the model. It converts the step list the agent
  wrote, validates it, and hands back the bytes.

  **Every tool is read-only.** Nothing writes a file. Authoring returns
  `fileContents` and lets the client's own file tools save it, under whatever
  permissions the operator already granted. A second write path inside an MCP
  server is new blast radius for no capability.

  **No `simulate`.** The proposal's fifth tool — drive a flow headlessly and
  return screenshots — needs a browser download, a running copy of your app and a
  screenshot transport. It is deferred and named rather than half-built; the docs
  say what covers the gap in the meantime.

  Every path goes through one sandbox: the root is the operator's choice and never
  a tool argument, `..` is refused, containment is checked on path segments (so
  `/srv/tours-secret` is not accepted for a root of `/srv/tours`), and symlinks
  are resolved against the nearest existing ancestor — which catches a
  non-existent file underneath a directory symlink pointing out of the root.

  See ADR-019.

### Patch Changes

- Updated dependencies [ef40833]
- Updated dependencies [bbd09a8]
- Updated dependencies [463b07d]
- Updated dependencies [93214ff]
- Updated dependencies [4bfc44a]
- Updated dependencies [7c72cb2]
- Updated dependencies [9cde7b4]
- Updated dependencies [301ed81]
- Updated dependencies [cb7169d]
- Updated dependencies [a49e235]
- Updated dependencies [d01266d]
- Updated dependencies [c994a5b]
- Updated dependencies [8dc6621]
- Updated dependencies [b81409f]
- Updated dependencies [8dc6621]
- Updated dependencies [b5dd516]
- Updated dependencies [07b094b]
- Updated dependencies [42412fb]
- Updated dependencies [c8bcaa7]
- Updated dependencies [dc687bb]
- Updated dependencies [4981071]
- Updated dependencies [4981071]
- Updated dependencies [84670f2]
- Updated dependencies [edfa115]
- Updated dependencies [37e9cb7]
- Updated dependencies [e98d6fd]
- Updated dependencies [26164ec]
  - @guideflow/core@0.2.0
