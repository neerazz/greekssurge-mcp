import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));

describe('package metadata', () => {
  it('defines the publishable ESM package contract', async () => {
    const pkg = await readJson('package.json');

    expect(pkg.name).toBe('greekssurge-mcp');
    expect(pkg.type).toBe('module');
    expect(pkg.engines?.node).toBe('>=20');
    expect(pkg.bin?.['greekssurge-mcp']).toBe('dist/cli.js');
    expect(pkg.exports?.['.']).toBe('./dist/index.js');
    expect(pkg.files).toEqual([
      'dist',
      'README.md',
      'LICENSE',
      'docs/superpowers/specs/2026-07-26-greekssurge-mcp-design.md',
      'docs/superpowers/plans/2026-07-26-greekssurge-mcp-v1.md',
    ]);
  });

  it('has the expected development scripts and dependency pins', async () => {
    const pkg = await readJson('package.json');

    expect(Object.keys(pkg.scripts)).toEqual(
      expect.arrayContaining([
        'build',
        'check',
        'test',
        'test:coverage',
        'lint',
        'format:check',
        'pack:check',
        'start',
      ]),
    );
    expect(pkg.dependencies?.['@modelcontextprotocol/sdk']).toBe('1.29.0');
    expect(pkg.dependencies?.zod).toMatch(/^\^4\./);
  });

  it('keeps source and tests out of the npm tarball', async () => {
    const npmIgnore = await readFile('.npmignore', 'utf8');

    expect(npmIgnore).toContain('src');
    expect(npmIgnore).toContain('tests');
    expect(npmIgnore).toContain('coverage');
  });
});
