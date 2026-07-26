import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, redactSecrets } from "../src/logger.js";

describe("redactSecrets", () => {
  it("redacts headers, local-storage tokens, JWTs, query tokens, and emails", () => {
    const raw =
      "Authorization: Bearer abc.def.ghi gs_token=secret-token ?access_token=abc123&state=sensitive-state&code=sensitive-code code_verifier=sensitive-verifier&email=person@example.com jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature";

    const redacted = redactSecrets(raw);

    expect(redacted).not.toContain("secret-token");
    expect(redacted).not.toContain("person@example.com");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).not.toContain("sensitive-state");
    expect(redacted).not.toContain("sensitive-code");
    expect(redacted).not.toContain("sensitive-verifier");
    expect(redacted).toContain("Authorization: [REDACTED]");
    expect(redacted).toContain("gs_token=[REDACTED]");
    expect(redacted).toContain("access_token=[REDACTED]");
    expect(redacted).toContain("[EMAIL_REDACTED]");
    expect(redacted).toContain("[JWT_REDACTED]");
  });
});

describe("createLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes JSON diagnostics only to stderr with redaction", () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const logger = createLogger({
      component: "test",
      account: "person@example.com",
    });

    logger.info("auth failed for person@example.com", {
      Authorization: "Bearer abc.def.ghi",
      url: "https://csp.greekssurge.com/callback?gs_token=private",
      clientSecret: "compound-client-secret",
      userPassword: "compound-user-password",
      sessionCookie: "compound-session-cookie",
      state: "sensitive-state",
      code: "sensitive-code",
      codeVerifier: "sensitive-verifier",
    });

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledOnce();
    const line = String(stderr.mock.calls[0]?.[0]);
    expect(() => JSON.parse(line)).not.toThrow();
    expect(line).not.toContain("person@example.com");
    expect(line).not.toContain("private");
    expect(line).not.toContain("abc.def.ghi");
    expect(line).not.toContain("sensitive-state");
    expect(line).not.toContain("sensitive-code");
    expect(line).not.toContain("sensitive-verifier");
    expect(line).not.toContain("compound-client-secret");
    expect(line).not.toContain("compound-user-password");
    expect(line).not.toContain("compound-session-cookie");
  });
});
