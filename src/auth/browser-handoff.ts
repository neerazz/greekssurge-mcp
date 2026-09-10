import {
  constants,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHandoffPages } from "./handoff-pages.js";

export interface BrowserHandoffOptions {
  completeLogin: (
    token: string,
    signal: AbortSignal,
    beginCommit: () => void,
  ) => Promise<{ tier?: string }>;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface BrowserHandoff {
  url: URL;
  completion: Promise<{ tier?: string }>;
  close(): Promise<void>;
}

export async function startBrowserHandoff(
  options: BrowserHandoffOptions,
): Promise<BrowserHandoff> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new Error("Invalid connection timeout.");
  options.signal?.throwIfAborted();
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const nonce = randomBytes(32).toString("base64url");
  const scriptNonce = randomBytes(24).toString("base64");
  const base = `/connect/${nonce}/`;
  const controller = new AbortController();
  let origin = "",
    host = "",
    busy = false,
    committing = false,
    finished = false;
  let pages = { helper: "", receiver: "" };
  let resolve!: (result: { tier?: string }) => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<{ tier?: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void completion.catch(() => undefined);

  let closing: Promise<void> | undefined;

  const server = createServer(
    {
      maxHeaderSize: 8192,
      requestTimeout: 5000,
      headersTimeout: 5000,
      connectionsCheckingInterval: 1000,
    },
    (req, res) => {
      void handle(req, res).catch(() => {
        if (!res.headersSent) reply(res, 400, { ok: false });
        else res.destroy();
      });
    },
  );
  server.maxConnections = 16;
  server.setTimeout(5000, (socket) => socket.destroy());
  function closeServer(): Promise<void> {
    if (closing) return closing;
    closing = new Promise<void>((done) => {
      server.close(() => done());
      server.closeAllConnections();
    });
    return closing;
  }
  async function settle(error?: Error, result: { tier?: string } = {}) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    if (error) controller.abort();
    await closeServer();
    if (error) reject(error);
    else resolve(result);
  }
  const onAbort = () => {
    if (committing) return;
    void settle(new Error("GreeksSurge connection cancelled."));
  };
  function beginCommit() {
    controller.signal.throwIfAborted();
    if (finished) throw new Error("Connection is closed.");
    // Once storage starts, report its real result instead of a false cancellation.
    committing = true;
    clearTimeout(timer);
  }
  const securityHeaders = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'nonce-${scriptNonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    Connection: "close",
  };
  function reply(res: ServerResponse, status: number, body: object | string) {
    res.writeHead(status, {
      ...securityHeaders,
      "Content-Type":
        typeof body === "string"
          ? "text/html; charset=utf-8"
          : "application/json",
    });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }
  function single(
    req: IncomingMessage,
    name: string,
    expected: string,
  ): boolean {
    const values = req.headersDistinct[name];
    return values?.length === 1 && values[0] === expected;
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (
      !single(req, "host", host) ||
      req.socket.remoteAddress !== "127.0.0.1"
    ) {
      reply(res, 403, { ok: false });
      return;
    }
    if (finished) {
      reply(res, 410, { ok: false });
      return;
    }
    if (req.method === "GET" && req.url === base) {
      if (
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && !single(req, "origin", origin))
      ) {
        reply(res, 403, { ok: false });
        return;
      }
      reply(res, 200, pages.helper);
      return;
    }
    if (req.method === "GET" && req.url === base + "receive") {
      reply(res, 200, pages.receiver);
      return;
    }
    if (req.url !== base + "session" && req.url !== base + "cancel") {
      reply(res, 404, { ok: false });
      return;
    }
    if (
      req.method !== "POST" ||
      !single(req, "origin", origin) ||
      !single(req, "x-greekssurge-nonce", nonce) ||
      !single(req, "content-type", "application/json")
    ) {
      reply(res, 403, { ok: false });
      return;
    }
    if (busy && (req.url !== base + "cancel" || committing)) {
      reply(res, 409, { ok: false });
      return;
    }
    if (Number(req.headers["content-length"]) > 32_768) {
      reply(res, 413, { ok: false });
      return;
    }
    let bytes = 0;
    const chunks: Buffer[] = [];
    // Absolute body deadline: a peer sending one byte periodically cannot hold it forever.
    const bodyTimer = setTimeout(() => req.destroy(), 5000);
    try {
      for await (const chunk of req) {
        const data = Buffer.from(chunk as Buffer);
        bytes += data.length;
        if (bytes > 32_768) {
          reply(res, 413, { ok: false });
          return;
        }
        chunks.push(data);
      }
    } finally {
      clearTimeout(bodyTimer);
    }
    if (finished || controller.signal.aborted) {
      reply(res, 410, { ok: false });
      return;
    }
    // Check again after the asynchronous read; two valid bodies can arrive together.
    if (busy && (req.url !== base + "cancel" || committing)) {
      reply(res, 409, { ok: false });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      reply(res, 400, { ok: false });
      return;
    }
    if (req.url === base + "cancel") {
      if (
        !payload ||
        typeof payload !== "object" ||
        Object.keys(payload).length
      ) {
        reply(res, 400, { ok: false });
        return;
      }
      res.once("finish", onAbort);
      reply(res, 200, { ok: true });
      return;
    }
    let token: string;
    try {
      if (
        !payload ||
        typeof payload !== "object" ||
        Object.keys(payload).sort().join(",") !== "data,iv,key"
      )
        throw new Error();
      const p = payload as Record<string, unknown>;
      const key = privateDecrypt(
        {
          key: privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        decode(p.key, 256, 256),
      );
      if (key.length !== 32) throw new Error();
      const iv = decode(p.iv, 12, 12),
        data = decode(p.data, 17, 16_400);
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(nonce));
      cipher.setAuthTag(data.subarray(-16));
      const plain = Buffer.concat([
        cipher.update(data.subarray(0, -16)),
        cipher.final(),
      ]);
      key.fill(0);
      token = plain.toString("utf8");
      plain.fill(0);
      if (!/^[A-Za-z0-9._~+/=-]{1,16384}$/.test(token)) throw new Error();
    } catch {
      reply(res, 400, { ok: false });
      return;
    }
    busy = true;
    req.socket.setTimeout(0);
    try {
      const result = await options.completeLogin(
        token,
        controller.signal,
        beginCommit,
      );
      if (finished || controller.signal.aborted) return;
      if (res.destroyed) {
        await settle(undefined, result);
        return;
      }
      res.once("finish", () => {
        void settle(undefined, result);
      });
      res.once("close", () => {
        void settle(undefined, result);
      });
      reply(res, 200, { ok: true });
    } catch {
      if (finished) return;
      if (res.destroyed) {
        await settle(
          new Error("Unable to validate or store the GreeksSurge session."),
        );
        return;
      }
      res.once("finish", () => {
        void settle(
          new Error("Unable to validate or store the GreeksSurge session."),
        );
      });
      res.once("close", () => {
        void settle(
          new Error("Unable to validate or store the GreeksSurge session."),
        );
      });
      reply(res, 401, { ok: false });
    }
  }
  await new Promise<void>((yes, no) => {
    server.once("error", no);
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      server.removeListener("error", no);
      yes();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer();
    throw new Error("Unable to start local connection.");
  }
  host = `127.0.0.1:${address.port}`;
  origin = `http://${host}`;
  pages = createHandoffPages({
    origin,
    nonce,
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
    expiresAt: Date.now() + timeoutMs,
    scriptNonce,
  });
  const timer = setTimeout(() => {
    void settle(
      new Error("GreeksSurge connection expired. Run auth login again."),
    );
  }, timeoutMs);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  server.on("error", () => {
    void settle(new Error("Local GreeksSurge connection failed."));
  });
  return {
    url: new URL(origin + base),
    completion,
    close: async () => {
      if (!finished)
        await settle(new Error("GreeksSurge connection cancelled."));
      else await closeServer();
    },
  };
}

function decode(value: unknown, min: number, max: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error();
  const data = Buffer.from(value, "base64");
  if (
    data.length < min ||
    data.length > max ||
    data.toString("base64") !== value
  )
    throw new Error();
  return data;
}
