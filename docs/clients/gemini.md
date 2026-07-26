# Gemini CLI local stdio setup

Grounded official docs: https://geminicli.com/docs/tools/mcp-server/ and https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

2. Add the read-only local stdio server:

```sh
gemini mcp add --scope user --transport stdio greekssurge npx -y greekssurge-mcp
```

This is a dry-run guide: `greekssurge-mcp setup` prints the command and never edits Gemini configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
