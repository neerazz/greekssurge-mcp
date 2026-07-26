#!/usr/bin/env node
/* global console, process */
import { existsSync, readFileSync } from "node:fs";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const releaseRoots = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "package.json",
  "package-lock.json",
  ".npmignore",
  "eslint.config.js",
  "tsconfig.json",
  "vitest.config.ts",
  ".github",
  "src",
  "tests",
  "docs",
  "scripts",
];
const allowedSynthetic = [
  /synthetic/i,
  /example/i,
  /placeholder/i,
  /token store/i,
  /token path/i,
];
const rules = [
  { name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/,
  },
  { name: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "credential-assignment",
    pattern:
      /\b(?:api[_-]?key|secret|password|token|authorization|bearer)\b\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]{20,})/i,
  },
];

const files = trackedReleaseFiles();
const findings = [];
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (
        rule.pattern.test(line) &&
        !allowedSynthetic.some((allow) => allow.test(line))
      ) {
        findings.push({ file, line: index + 1, rule: rule.name });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Secret scan failed. Values redacted:");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line} ${finding.rule}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} release files).`);

function trackedReleaseFiles() {
  return releaseRoots
    .flatMap((entry) => expand(entry))
    .filter((file) => !file.endsWith(".tgz"))
    .sort();
}

function expand(entry) {
  const abs = join(root, entry);
  if (!existsSync(abs)) return [];
  const stat = readdirSafe(abs);
  if (stat === undefined) return [entry];
  return stat.flatMap((child) => expand(join(entry, child)));
}

function readdirSafe(path) {
  try {
    return readdirSync(path);
  } catch {
    return undefined;
  }
}

process.on("exit", () => {
  for (const file of readdirSync(root).filter((name) =>
    name.endsWith(".tgz"),
  )) {
    try {
      rmSync(join(root, file), { force: true });
    } catch {
      // best effort cleanup only
    }
  }
});
