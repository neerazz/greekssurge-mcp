import { describe, expect, it } from "vitest";
import { defaultTokenPath, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads safe defaults for local stdio mode", () => {
    const config = loadConfig({ HOME: "/tmp/home" });

    expect(config.apiBaseUrl.toString()).toBe("https://csp.greekssurge.com/");
    expect(config.authIssuerUrl.toString()).toBe(
      "https://csp.greekssurge.com/",
    );
    expect(config.transport).toBe("stdio");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3333);
    expect(config.allowedHosts).toEqual(["127.0.0.1", "localhost"]);
    expect(config.tokenPath).toContain("greekssurge-mcp");
  });

  it("accepts explicit environment overrides", () => {
    const config = loadConfig({
      HOME: "/tmp/home",
      GREEKSSURGE_API_BASE_URL: "https://example.test/api-root",
      GREEKSSURGE_AUTH_ISSUER: "https://auth.example.test",
      MCP_TRANSPORT: "http",
      HOST: "localhost",
      PORT: "8088",
      ALLOWED_HOSTS: "localhost,example.test",
      GREEKSSURGE_TOKEN_PATH: "/tmp/token.json",
      BROWSER_EXECUTABLE:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    expect(config.apiBaseUrl.toString()).toBe("https://example.test/api-root/");
    expect(config.authIssuerUrl.toString()).toBe("https://auth.example.test/");
    expect(config.transport).toBe("http");
    expect(config.host).toBe("localhost");
    expect(config.port).toBe(8088);
    expect(config.allowedHosts).toEqual(["localhost", "example.test"]);
    expect(config.tokenPath).toBe("/tmp/token.json");
    expect(config.browserExecutable).toContain("Google Chrome");
  });

  it("rejects invalid URLs and ports", () => {
    expect(() =>
      loadConfig({ GREEKSSURGE_API_BASE_URL: "ftp://bad.test" }),
    ).toThrow(/GREEKSSURGE_API_BASE_URL/);
    expect(() => loadConfig({ PORT: "0" })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: "not-a-number" })).toThrow(/PORT/);
  });

  it("uses native per-user config roots on macOS, Windows, and Linux", () => {
    expect(defaultTokenPath({ HOME: "/Users/person" }, "darwin")).toBe(
      "/Users/person/Library/Application Support/greekssurge-mcp/token.json",
    );
    expect(
      defaultTokenPath(
        {
          HOME: "C:\\Users\\person",
          APPDATA: "C:\\Users\\person\\AppData\\Roaming",
        },
        "win32",
      ),
    ).toBe("C:\\Users\\person\\AppData\\Roaming\\greekssurge-mcp\\token.json");
    expect(
      defaultTokenPath(
        { HOME: "/home/person", XDG_CONFIG_HOME: "/custom/config" },
        "linux",
      ),
    ).toBe("/custom/config/greekssurge-mcp/token.json");
  });
});
