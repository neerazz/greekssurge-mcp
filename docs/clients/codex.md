# Codex CLI local stdio setup

Grounded official docs: https://developers.openai.com/codex/mcp/

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

2. Add the read-only local stdio server:

```sh
codex mcp add greekssurge -- npx -y greekssurge-mcp
```

This is a dry-run guide: `greekssurge-mcp setup` prints the command and never edits Codex configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
