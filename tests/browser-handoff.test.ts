import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publicEncrypt,
  randomBytes,
  createCipheriv,
  constants,
} from "node:crypto";
import { request } from "node:http";
import { startBrowserHandoff } from "../src/auth/browser-handoff.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
});
async function start(
  options: Partial<Parameters<typeof startBrowserHandoff>[0]> = {},
) {
  const completeLogin = vi.fn(async () => ({ tier: "free" }));
  const flow = await startBrowserHandoff({ completeLogin, ...options });
  cleanups.push(flow.close);
  const html = await (await fetch(flow.url)).text();
  const config = JSON.parse(/id="handoff-config"[^>]*>([^<]+)/.exec(html)![1]);
  return { ...flow, config, html, completeLogin };
}
function encrypt(
  config: { publicKey: string; nonce: string },
  token = "synthetic-test-token",
) {
  const key = randomBytes(32),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(config.nonce));
  const data = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const wrapped = publicEncrypt(
    {
      key: Buffer.from(config.publicKey, "base64"),
      format: "der",
      type: "spki",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    key,
  );
  return {
    key: wrapped.toString("base64"),
    iv: iv.toString("base64"),
    data: data.toString("base64"),
  };
}
function post(
  flow: Awaited<ReturnType<typeof start>>,
  body = encrypt(flow.config),
  headers = {},
) {
  return fetch(new URL("session", flow.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: flow.url.origin,
      "x-greekssurge-nonce": flow.config.nonce,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function raw(
  url: URL,
  path: string,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      { hostname: url.hostname, port: url.port, path, headers },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end();
  });
}
describe("loopback session handoff (real sockets, synthetic credentials)", () => {
  it("keeps a valid account check alive beyond the HTTP body timeout", async () => {
    const flow = await start({
      timeoutMs: 7000,
      completeLogin: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5200));
        return { tier: "free" };
      },
    });
    expect((await post(flow)).status).toBe(200);
    await expect(flow.completion).resolves.toEqual({ tier: "free" });
  }, 10_000);
  it("settles truthfully if the browser disconnects during validation", async () => {
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const flow = await start({
      completeLogin: async (_token, _signal, beginCommit) => {
        started();
        await waiting;
        beginCommit();
        return { tier: "free" };
      },
    });
    const controller = new AbortController();
    const pending = fetch(new URL("session", flow.url), {
      method: "POST",
      signal: controller.signal,
      headers: {
        origin: flow.url.origin,
        "content-type": "application/json",
        "x-greekssurge-nonce": flow.config.nonce,
      },
      body: JSON.stringify(encrypt(flow.config)),
    }).catch(() => undefined);
    await entered;
    controller.abort();
    await pending;
    release();
    await expect(flow.completion).resolves.toEqual({ tier: "free" });
  });
  it("acknowledges browser cancellation during validation and aborts the pending import", async () => {
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const flow = await start({
      completeLogin: async (_token, signal) => {
        started();
        await new Promise<void>((_yes, no) =>
          signal.addEventListener("abort", () => no(new Error("cancelled")), {
            once: true,
          }),
        );
        return {};
      },
    });
    const pending = post(flow).catch(() => undefined);
    await entered;
    const response = await fetch(new URL("cancel", flow.url), {
      method: "POST",
      headers: {
        origin: flow.url.origin,
        "content-type": "application/json",
        "x-greekssurge-nonce": flow.config.nonce,
      },
      body: "{}",
    });
    expect(response.status).toBe(200);
    await expect(flow.completion).rejects.toThrow(/cancelled/);
    await pending;
  });
  it("finishes an already-started storage commit instead of reporting a false cancellation", async () => {
    const controller = new AbortController();
    let started!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const flow = await start({
      signal: controller.signal,
      completeLogin: async (_token, _signal, beginCommit) => {
        if (beginCommit) beginCommit();
        started();
        await waiting;
        return { tier: "free" };
      },
    });
    const pending = post(flow).catch(() => undefined);
    await entered;
    controller.abort();
    release();
    expect((await pending)?.status).toBe(200);
    await expect(flow.completion).resolves.toEqual({ tier: "free" });
  });
  it("validates and stores before returning success", async () => {
    const flow = await start();
    expect(flow.url.hostname).toBe("127.0.0.1");
    expect(flow.url.port).not.toBe("");
    const response = await post(flow);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(flow.completeLogin).toHaveBeenCalledWith(
      "synthetic-test-token",
      expect.any(AbortSignal),
      expect.any(Function),
    );
    expect(await flow.completion).toEqual({ tier: "free" });
    await expect(fetch(flow.url)).rejects.toThrow();
  });
  it("rejects a validation failure without leaking the error", async () => {
    const flow = await start({
      completeLogin: async () => {
        throw new Error("synthetic-test-token");
      },
    });
    const response = await post(flow);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("synthetic-test-token");
    await expect(flow.completion).rejects.toThrow(/Unable to validate/);
  });
  it.each([
    { origin: "https://evil.example" },
    { "x-greekssurge-nonce": "wrong" },
    { "content-type": "text/plain" },
  ])(
    "rejects hostile request metadata without consuming the flow",
    async (headers) => {
      const flow = await start();
      expect((await post(flow, undefined, headers)).status).toBe(403);
      expect(flow.completeLogin).not.toHaveBeenCalled();
      expect((await post(flow)).status).toBe(200);
    },
  );
  it("rejects raw-path tricks, unsolicited paths, and cross-site helper reads", async () => {
    const flow = await start();
    expect(
      await raw(flow.url, flow.url.pathname, { host: "evil.example" }),
    ).toBe(403);
    for (const path of [
      "/",
      flow.url.pathname + "../receive",
      flow.url.pathname + "%2e/receive",
      flow.url.pathname + "?other=1",
    ]) {
      expect(await raw(flow.url, path)).toBe(404);
    }
    expect(
      (await fetch(flow.url, { headers: { "sec-fetch-site": "cross-site" } }))
        .status,
    ).toBe(403);
  });
  it("rejects oversized bodies and invalid ciphertext without calling validation", async () => {
    const flow = await start();
    expect(
      (await post(flow, { key: "x".repeat(33_000), iv: "x", data: "x" }))
        .status,
    ).toBe(413);
    expect(
      (await post(flow, { key: "AAAA", iv: "AAAA", data: "AAAA" })).status,
    ).toBe(400);
    expect(flow.completeLogin).not.toHaveBeenCalled();
  });
  it("rejects ciphertext encrypted for a different login process", async () => {
    const one = await start(),
      two = await start();
    expect((await post(two, encrypt(one.config))).status).toBe(400);
    expect(two.completeLogin).not.toHaveBeenCalled();
  });
  it("allows only one concurrent authenticated submission", async () => {
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const flow = await start({
      completeLogin: async () => {
        started();
        await waiting;
        return {};
      },
    });
    const first = post(flow);
    await entered;
    const replay = await post(flow);
    expect(replay.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
  });
  it("times out and closes its listener", async () => {
    const flow = await start({ timeoutMs: 100 });
    await expect(flow.completion).rejects.toThrow(/expired/);
    await expect(fetch(flow.url)).rejects.toThrow();
  });
  it("cancels in-flight validation and never reports success afterwards", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const flow = await start({
      signal: controller.signal,
      completeLogin: async (_token, signal) => {
        receivedSignal = signal;
        started();
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          ),
        );
        return {};
      },
    });
    const pending = post(flow).catch(() => undefined);
    await entered;
    controller.abort();
    await expect(flow.completion).rejects.toThrow(/cancelled/);
    expect(receivedSignal?.aborted).toBe(true);
    await pending;
  });
  it("requires an explicit nonce-bound cancel POST", async () => {
    const flow = await start();
    const response = await fetch(new URL("cancel", flow.url), {
      method: "POST",
      headers: {
        origin: flow.url.origin,
        "content-type": "application/json",
        "x-greekssurge-nonce": flow.config.nonce,
      },
      body: "{}",
    });
    expect(response.status).toBe(200);
    await expect(flow.completion).rejects.toThrow(/cancelled/);
  });
});
