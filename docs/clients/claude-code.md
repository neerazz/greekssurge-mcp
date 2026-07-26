# Claude Code local stdio setup

Grounded official docs: https://code.claude.com/docs/en/mcp

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

2. Add the read-only local stdio server:

```sh
claude mcp add --scope user greekssurge -- npx -y greekssurge-mcp
```

This is a dry-run guide: `greekssurge-mcp setup` prints the command and never edits Claude Code configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
