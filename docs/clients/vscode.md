# VS Code local stdio setup

Grounded official protocol docs: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports and https://modelcontextprotocol.io/docs/develop/build-server

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

2. Merge this read-only local stdio server entry into the top-level `servers` object:

```json
{
  "servers": {
    "greekssurge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

This is a dry-run guide: `greekssurge-mcp setup` prints JSON and never edits VS Code configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
