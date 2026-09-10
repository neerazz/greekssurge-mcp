import {
  generateKeyPairSync,
  privateDecrypt,
  createDecipheriv,
  constants,
  webcrypto,
} from "node:crypto";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { createHandoffPages } from "../src/auth/handoff-pages.js";

function browser(
  overrides: {
    origin?: string;
    expired?: boolean;
    framed?: boolean;
    blocked?: boolean;
  } = {},
) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const config = {
    origin: "http://127.0.0.1:43827",
    nonce: "synthetic-nonce",
    publicKey: publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64"),
    expiresAt: overrides.expired ? 1 : Date.now() + 300_000,
    scriptNonce: "synthetic-script-nonce",
  };
  const pages = createHandoffPages(config);
  const bookmark = /id="bookmark"[^>]+href="([^"]+)"/
    .exec(pages.helper)![1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const listeners = new Map<string, (event: unknown) => Promise<void>>();
  const postMessage = vi.fn();
  const popup = { postMessage };
  const win: Record<string, unknown> = {
    addEventListener: (name: string, cb: (event: unknown) => Promise<void>) =>
      listeners.set(name, cb),
    removeEventListener: (name: string) => listeners.delete(name),
    open: vi.fn(() => (overrides.blocked ? null : popup)),
  };
  win.top = overrides.framed ? {} : win;
  const getItem = vi.fn(() => "synthetic-test-token");
  const alert = vi.fn();
  const context = {
    window: win,
    location: { origin: overrides.origin ?? "https://csp.greekssurge.com" },
    localStorage: { getItem },
    alert,
    crypto: webcrypto,
    Uint8Array,
    TextEncoder,
    atob,
    btoa,
    Date,
    setTimeout: () => 1,
    clearTimeout: vi.fn(),
  };
  runInNewContext(bookmark.replace(/^javascript:/, ""), context);
  return {
    config,
    pages,
    privateKey,
    win,
    popup,
    postMessage,
    getItem,
    alert,
    listeners,
  };
}

it.each([
  { origin: "https://accounts.google.com" },
  { origin: "https://csp.greekssurge.com.evil.example" },
  { expired: true },
  { framed: true },
  { blocked: true },
])(
  "does not read a session when bookmark preconditions fail: %j",
  (options) => {
    const b = browser(options);
    expect(b.getItem).not.toHaveBeenCalled();
    expect(b.alert).toHaveBeenCalled();
  },
);
it("waits for exact popup origin, source and nonce before reading any session", async () => {
  const b = browser();
  const receive = b.listeners.get("message")!;
  const valid = {
    origin: b.config.origin,
    source: b.popup,
    data: { type: "gs-ready", nonce: b.config.nonce },
  };
  for (const event of [
    { ...valid, origin: "https://evil.example" },
    { ...valid, source: {} },
    { ...valid, data: { type: "gs-ready", nonce: "wrong" } },
    { ...valid, data: { ...valid.data, extra: true } },
  ])
    await receive(event);
  expect(b.getItem).not.toHaveBeenCalled();
  await receive(valid);
  expect(b.getItem).toHaveBeenCalledOnce();
  expect(b.postMessage).toHaveBeenCalledOnce();
  expect(b.postMessage.mock.calls[0][1]).toBe(b.config.origin);
  const p = b.postMessage.mock.calls[0][0].payload;
  expect(JSON.stringify(p)).not.toContain("synthetic-test-token");
  const key = privateDecrypt(
    {
      key: b.privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(p.key, "base64"),
  );
  const data = Buffer.from(p.data, "base64"),
    iv = Buffer.from(p.iv, "base64");
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(b.config.nonce));
  cipher.setAuthTag(data.subarray(-16));
  expect(
    Buffer.concat([
      cipher.update(data.subarray(0, -16)),
      cipher.final(),
    ]).toString(),
  ).toBe("synthetic-test-token");
  await receive(valid);
  expect(b.getItem).toHaveBeenCalledOnce();
});
it("does not announce cancellation when the server rejects it", async () => {
  const b = browser();
  const actions = new Map<string, () => Promise<void>>();
  const status = { textContent: "" };
  const button = (id: string) => ({
    disabled: false,
    addEventListener: (_event: string, cb: () => Promise<void>) =>
      actions.set(id, cb),
  });
  const elements = {
    status,
    cancel: button("cancel"),
    connect: button("connect"),
  };
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(
    b.pages.receiver,
  )![1];
  runInNewContext(script, {
    window: { opener: {}, addEventListener: () => {} },
    document: {
      getElementById: (id: keyof typeof elements) => elements[id],
      querySelectorAll: () => [],
    },
    fetch: async () => ({ ok: false }),
    Date,
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  await actions.get("cancel")!();
  expect(status.textContent).toContain("Cancellation was not confirmed");
  expect(status.textContent).not.toContain("Connection cancelled.");
});

it("renders no cross-origin fetch or wildcard message target", () => {
  const b = browser();
  expect(b.pages.receiver).toContain("event.source!==opener");
  expect(b.pages.receiver).toContain("event.origin!==c.site");
  expect(b.pages.receiver).not.toContain("postMessage('*'");
  expect(b.pages.helper).not.toContain("<script src=");
});
