import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

async function withFixtureApi() {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith("/api/status")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          market: "open",
          asOf: "2026-07-26T15:30:00.000Z",
          timezone: "America/New_York",
        }),
      );
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing server address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function send(
  proc: ChildProcessWithoutNullStreams,
  id: number,
  method: string,
  params: Record<string, unknown> = {},
) {
  proc.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
  );
}

class StdoutReader {
  private buffer = "";
  private waiters: Array<(message: Record<string, unknown>) => void> = [];

  constructor(proc: ChildProcessWithoutNullStreams) {
    proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this.drain();
    });
  }

  read(): Promise<Record<string, unknown>> {
    const existing = this.take();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private drain() {
    let message = this.take();
    while (message && this.waiters.length > 0) {
      const resolve = this.waiters.shift();
      resolve?.(message);
      message = this.take();
    }
  }

  private take(): Record<string, unknown> | undefined {
    const idx = this.buffer.indexOf("\n");
    if (idx === -1) return undefined;
    const line = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx + 1);
    return JSON.parse(line) as Record<string, unknown>;
  }
}

describe("stdio CLI integration", () => {
  it("initializes, lists tools, and invokes one mocked public tool with JSON-RPC-only stdout", async () => {
    const api = await withFixtureApi();
    const proc = spawn(process.execPath, ["dist/cli.js", "serve"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GREEKSSURGE_API_BASE_URL: api.url,
        GREEKSSURGE_AUTH_ISSUER: "https://csp.greekssurge.com",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr: string[] = [];
    const reader = new StdoutReader(proc);
    proc.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
    try {
      send(proc, 1, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "integration", version: "1.0.0" },
      });
      const init = await reader.read();
      expect(init).toMatchObject({ id: 1, result: expect.any(Object) });
      proc.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
      );

      send(proc, 2, "tools/list");
      const tools = await reader.read();
      expect(JSON.stringify(tools)).toContain("get_market_status");

      send(proc, 3, "tools/call", { name: "get_market_status", arguments: {} });
      const call = await reader.read();
      expect(call).toMatchObject({
        id: 3,
        result: { structuredContent: { data: { market: "open" } } },
      });
    } finally {
      proc.kill("SIGTERM");
      await Promise.race([
        once(proc, "exit"),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      await api.close();
    }
    expect(stderr.join("")).not.toContain("site-token");
  });
});
