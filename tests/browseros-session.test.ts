import { describe, expect, it, vi } from "vitest";
import {
  findGreeksSurgeBrowserOsPage,
  readBrowserOsToken,
  type BrowserOsPage,
} from "../src/auth/browseros-session.js";

const exactPage: BrowserOsPage = {
  type: "page",
  url: "https://csp.greekssurge.com/dashboard",
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/synthetic-page-id",
};

describe("BrowserOS session import", () => {
  it("selects only an exact GreeksSurge page with a loopback DevTools endpoint", () => {
    expect(
      findGreeksSurgeBrowserOsPage([
        { ...exactPage, url: "https://csp.greekssurge.com.attacker.test/" },
        {
          ...exactPage,
          webSocketDebuggerUrl:
            "ws://attacker.test:9222/devtools/page/synthetic-page-id",
        },
        exactPage,
      ]),
    ).toEqual(exactPage);
  });

  it("reads the existing token without returning it through logs or CLI arguments", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([exactPage], {
        headers: { "content-type": "application/json" },
      }),
    );
    const evaluateToken = vi.fn(async () => "synthetic-test-token");

    const token = await readBrowserOsToken({
      serverConfig: { cdp_port: 9222 },
      fetchImpl: fetchImpl as typeof fetch,
      evaluateToken,
    });

    expect(token).toBe("synthetic-test-token");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:9222/json/list",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(evaluateToken).toHaveBeenCalledWith(exactPage.webSocketDebuggerUrl);
  });

  it("rejects missing sessions, malformed ports, and invalid captured values", async () => {
    await expect(
      readBrowserOsToken({
        serverConfig: { cdp_port: 0 },
        fetchImpl: vi.fn() as unknown as typeof fetch,
        evaluateToken: vi.fn(),
      }),
    ).rejects.toThrow(/BrowserOS/i);

    await expect(
      readBrowserOsToken({
        serverConfig: { cdp_port: 9222 },
        fetchImpl: vi.fn(async () =>
          Response.json([]),
        ) as unknown as typeof fetch,
        evaluateToken: vi.fn(),
      }),
    ).rejects.toThrow(/Open GreeksSurge in BrowserOS/i);

    await expect(
      readBrowserOsToken({
        serverConfig: { cdp_port: 9222 },
        fetchImpl: vi.fn(async () =>
          Response.json([exactPage]),
        ) as unknown as typeof fetch,
        evaluateToken: vi.fn(async () => "contains whitespace"),
      }),
    ).rejects.toThrow(/valid GreeksSurge session/i);
  });
});
