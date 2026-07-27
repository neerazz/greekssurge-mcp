#!/usr/bin/env node
/* global console, process */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = process.cwd();
const tempDirs = [];
let tarballPath;

try {
  tarballPath = await createTarball();
  const contents = inspectTarball(tarballPath);
  verifyTarballContents(contents);
  await verifyTarballHasNoSecrets(tarballPath);
  await installAndSmokeTest(tarballPath);
  console.log(`Package verification passed: ${tarballPath}`);
} finally {
  if (tarballPath && existsSync(tarballPath))
    await rm(tarballPath, { force: true });
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
}

async function createTarball() {
  const result = run("npm", ["pack", "--json"], { cwd: root });
  const packs = JSON.parse(result.stdout);
  const filename = packs[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a tarball filename.");
  return resolve(root, filename);
}

function inspectTarball(path) {
  return run("tar", ["-tzf", path], { cwd: root })
    .stdout.split(/\r?\n/)
    .filter(Boolean)
    .sort();
}

function verifyTarballContents(contents) {
  const retiredBuildPrefixes = [
    "package/dist/auth/cdp",
    "package/dist/auth/browser-paths",
  ];
  const retired = contents.find((entry) =>
    retiredBuildPrefixes.some((prefix) => entry.startsWith(prefix)),
  );
  if (retired)
    throw new Error(`Tarball contains retired build output: ${retired}`);

  const allowed = contents.every((entry) => {
    if (entry === "package/package.json") return true;
    if (entry === "package/README.md") return true;
    if (entry === "package/LICENSE") return true;
    if (entry === "package/SECURITY.md") return true;
    if (/^package\/dist\//.test(entry)) return true;
    if (/^package\/docs\/clients\/[a-z-]+\.md$/.test(entry)) return true;
    return false;
  });
  if (!allowed) {
    const rejected = contents.filter(
      (entry) =>
        !(
          entry === "package/package.json" ||
          entry === "package/README.md" ||
          entry === "package/LICENSE" ||
          entry === "package/SECURITY.md" ||
          /^package\/dist\//.test(entry) ||
          /^package\/docs\/clients\/[a-z-]+\.md$/.test(entry)
        ),
    );
    throw new Error(
      `Tarball contains files outside allowlist: ${rejected.join(", ")}`,
    );
  }

  for (const forbidden of [
    /^package\/src\//,
    /^package\/tests\//,
    /^package\/scripts\//,
    /^package\/.github\//,
    /^package\/docs\/superpowers\//,
    /\.env/,
    /private[-_]?key/i,
    /secret/i,
  ]) {
    const found = contents.find((entry) => forbidden.test(entry));
    if (found) throw new Error(`Tarball contains forbidden path: ${found}`);
  }
}

async function verifyTarballHasNoSecrets(path) {
  const extractDir = await mkdtemp(join(tmpdir(), "greekssurge-mcp-tarball-"));
  tempDirs.push(extractDir);
  run("tar", ["-xzf", path, "-C", extractDir], { cwd: root });
  const files = await walk(join(extractDir, "package"));
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

  for (const file of files) {
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const rule = rules.find((candidate) => candidate.pattern.test(line));
      if (rule) {
        throw new Error(
          `Tarball contains secret-like content: ${file.replace(`${extractDir}/`, "")}:${index + 1} ${rule.name}`,
        );
      }
    }
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return files.flat();
}

async function installAndSmokeTest(tarball) {
  const temp = await mkdtemp(join(tmpdir(), "greekssurge-mcp-package-"));
  tempDirs.push(temp);
  const home = join(temp, "home");
  const appData = join(temp, "AppData", "Roaming");
  await writeFile(
    join(temp, "package.json"),
    '{"name":"verify-greekssurge-mcp","private":true}\n',
  );
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    LOCALAPPDATA: join(temp, "AppData", "Local"),
    XDG_CONFIG_HOME: join(temp, "xdg"),
  };

  run("npm", ["install", "--ignore-scripts", tarball], { cwd: temp, env });
  const bin = join(temp, "node_modules", "greekssurge-mcp", "dist", "cli.js");
  const version = run(process.execPath, [bin, "--version"], {
    cwd: temp,
    env,
  }).stdout.trim();
  if (version !== "0.1.1")
    throw new Error(`Unexpected CLI version: ${version}`);

  const api = await fixtureApi();
  try {
    await sdkSmokeTest(bin, api.url, env);
  } finally {
    await api.close();
  }
}

async function fixtureApi() {
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/status")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ isMarketOpen: true }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture API failed to bind.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolveClose) => server.close(() => resolveClose())),
  };
}

async function sdkSmokeTest(bin, apiUrl, baseEnv) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bin, "serve"],
    env: {
      ...baseEnv,
      GREEKSSURGE_API_BASE_URL: apiUrl,
    },
  });
  const client = new Client({ name: "package-verifier", version: "1.0.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === "get_market_status")) {
      throw new Error("Installed package did not list get_market_status.");
    }
    const result = await client.callTool({
      name: "get_market_status",
      arguments: {},
    });
    if (result.isError)
      throw new Error("get_market_status returned an MCP error.");
    const data = result.structuredContent?.data;
    if (!data || data.isMarketOpen !== true) {
      throw new Error(
        "get_market_status returned unexpected structured content.",
      );
    }
  } finally {
    await client.close();
  }
}

function run(command, args, options = {}) {
  let executable = command;
  let commandArgs = args;
  if (process.platform === "win32" && command === "npm") {
    const npmExecPath = process.env.npm_execpath;
    if (!npmExecPath) {
      throw new Error("Cannot locate npm's JavaScript entrypoint on Windows.");
    }
    executable = process.execPath;
    commandArgs = [npmExecPath, ...args];
  }
  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}
