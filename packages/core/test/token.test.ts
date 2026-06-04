import { describe, expect, it } from "vitest";
import { MemoryTokenStore, hasScope, issueToken, verifyToken } from "../src/token.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

describe("issueToken / verifyToken — round trip", () => {
  it("verifies a freshly issued token", async () => {
    const token = issueToken({ subject: "agent_1", scope: ["create_order"], signingKey: KEY });
    const result = await verifyToken(token, KEY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("agent_1");
      expect(result.claims.scope).toEqual(["create_order"]);
      expect(result.claims.exp).toBeGreaterThan(result.claims.iat);
      expect(result.claims.jti).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("requires a signingKey", () => {
    expect(() =>
      issueToken({ subject: "x", scope: [], signingKey: "" }),
    ).toThrow(/signingKey/);
  });
});

describe("verifyToken — failure modes", () => {
  it("rejects a malformed token", async () => {
    const r = await verifyToken("not-a-jwt", KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed");
  });

  it("rejects a token signed with a different key", async () => {
    const token = issueToken({ subject: "a", scope: ["x"], signingKey: KEY });
    const r = await verifyToken(token, "different-key-different-bytes");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-signature");
  });

  it("rejects a tampered payload", async () => {
    const token = issueToken({ subject: "a", scope: ["x"], signingKey: KEY });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${Buffer.from('{"sub":"evil","scope":["*"],"iat":1,"exp":9999999999,"jti":"f"}').toString("base64url")}.${parts[2]}`;
    const r = await verifyToken(tampered, KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad-signature");
  });

  it("rejects expired tokens", async () => {
    const token = issueToken({
      subject: "a",
      scope: ["x"],
      signingKey: KEY,
      ttlSeconds: 1,
    });
    await new Promise((r) => setTimeout(r, 1100));
    const r = await verifyToken(token, KEY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("rejects revoked tokens via TokenStore", async () => {
    const store = new MemoryTokenStore();
    const token = issueToken({ subject: "a", scope: ["x"], signingKey: KEY });
    const first = await verifyToken(token, KEY, store);
    expect(first.ok).toBe(true);
    if (first.ok) store.revoke(first.claims.jti);
    const second = await verifyToken(token, KEY, store);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("revoked");
  });

  it("rejects token with wrong header", async () => {
    const fakeHeader = Buffer.from('{"alg":"none"}').toString("base64url");
    const fakePayload = Buffer.from(
      JSON.stringify({ sub: "a", scope: [], iat: 1, exp: 9e9, jti: "x" }),
    ).toString("base64url");
    const r = await verifyToken(`${fakeHeader}.${fakePayload}.sig`, KEY);
    expect(r.ok).toBe(false);
  });
});

describe("hasScope", () => {
  it("matches exact actionId in scope", () => {
    expect(
      hasScope(
        { sub: "a", scope: ["create_order"], iat: 0, exp: 0, jti: "x" },
        "create_order",
      ),
    ).toBe(true);
  });

  it("matches wildcard scope", () => {
    expect(
      hasScope({ sub: "a", scope: ["*"], iat: 0, exp: 0, jti: "x" }, "anything"),
    ).toBe(true);
  });

  it("rejects actionId not in scope", () => {
    expect(
      hasScope({ sub: "a", scope: ["x"], iat: 0, exp: 0, jti: "x" }, "y"),
    ).toBe(false);
  });
});
