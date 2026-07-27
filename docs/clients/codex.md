# Codex CLI local stdio setup

Grounded official docs: https://developers.openai.com/codex/mcp/

1. Authenticate first:

```sh
npx -y greekssurge-mcp auth login
```

Until npm publication, use `npx -y github:neerazz/greekssurge-mcp#v0.1.1 auth login`.

2. Add the read-only local stdio server:

```sh
codex mcp add greekssurge -- npx -y greekssurge-mcp
```

Until npm publication, replace the package spec with `github:neerazz/greekssurge-mcp#v0.1.1`.

3. Verify by calling `get_account` from Codex.

This is a dry-run guide: `greekssurge-mcp setup` prints the command and never edits Codex configuration. The MCP server reads its own local token store; never paste a GreeksSurge token into client config.
