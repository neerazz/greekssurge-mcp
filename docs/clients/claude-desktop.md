# Claude Desktop local stdio setup

Grounded official docs: https://code.claude.com/docs/en/mcp and https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

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

This is a dry-run guide: `greekssurge-mcp setup` prints JSON and never edits Claude Desktop configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
