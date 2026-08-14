# Contributing

Thanks for improving GreeksSurge MCP.

## Scope

Version 0.3.0 is a read-only local stdio MCP server. Keep changes inside that boundary unless a future issue explicitly designs and ships a compliant hosted transport.

Do not add trading, order-entry, admin, billing, checkout, payment, or account-mutation tools.

## Development setup

```sh
npm ci
npm run build
npm run test
```

Useful commands:

```sh
npm run format
npm run format:check
npm run lint
npm run check
npm run test
npm run build
npm run scan:secrets
npm run pack:check
npm run prepublishOnly
```

`npm run prepublishOnly` is the local release gate. It runs formatting, lint, typecheck, tests, build, secret scan, and real package verification. Do not publish from a pull request and do not add a publish workflow.

## Test discipline

Use RED-GREEN TDD for behavior changes:

1. Write the failing test first.
2. Run the focused test and confirm the expected RED failure.
3. Implement the smallest change.
4. Run the focused test and then the full gate.

## Package boundary

The public package should contain only `dist`, `README.md`, `LICENSE`, and `SECURITY.md` plus npm's required package metadata. Tests, source TypeScript, workflows, scripts, and the whole `docs/` tree are not shipped in the tarball.

`docs/` is local-only working material: it is gitignored and not published. Anything an end user needs must live in `README.md`, which is intentionally self-contained.

## Security expectations

Never commit real credentials, private keys, bearer tokens, Google passwords, or account data. Use synthetic fixtures for tests. If a secret is exposed, revoke/rotate it; removing it from the file is not enough.
