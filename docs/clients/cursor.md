# Cursor local stdio setup

Grounded official docs: https://cursor.com/docs/mcp and https://modelcontextprotocol.io/docs/develop/build-server

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

Until npm publication, use `npx -y github:neerazz/greekssurge-mcp#v0.1.1 auth login`.

2. Merge this read-only local stdio server entry into the top-level `mcpServers` object:

```json
{
  "mcpServers": {
    "greekssurge": {
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

Until npm publication, replace `greekssurge-mcp` with `github:neerazz/greekssurge-mcp#v0.1.1`.

3. Verify by calling `get_account` from Cursor.

This is a dry-run guide: `greekssurge-mcp setup` prints JSON and never edits Cursor configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
