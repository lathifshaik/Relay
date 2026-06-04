import { describe, expect, it } from "vitest";
import { sanitiseError, sanitiseString, sanitiseValue } from "../src/sanitiser.js";

describe("sanitiseString — secret patterns", () => {
  it("redacts OpenAI-style keys", () => {
    const out = sanitiseString("key=sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).toBe("key=[REDACTED]");
  });

  it("redacts Anthropic-style keys", () => {
    const out = sanitiseString("auth: sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-ant");
  });

  it("redacts AWS access keys", () => {
    const out = sanitiseString("access key AKIAIOSFODNN7EXAMPLE used");
    expect(out).toBe("access key [REDACTED] used");
  });

  it("redacts Stripe live and test keys", () => {
    expect(sanitiseString("sk_live_abcdefghijklmnopqrstuv")).toBe("[REDACTED]");
    expect(sanitiseString("pk_test_abcdefghijklmnopqrstuv")).toBe("[REDACTED]");
  });

  it("redacts JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-def_ghi";
    expect(sanitiseString(`token=${jwt}`)).toBe("token=[REDACTED]");
  });

  it("redacts PEM blocks", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIBVQIBADAN\n-----END PRIVATE KEY-----";
    expect(sanitiseString(pem)).toBe("[REDACTED]");
  });

  it("redacts connection strings", () => {
    const out = sanitiseString("DATABASE_URL=postgres://user:pass@host:5432/db");
    expect(out).toBe("DATABASE_URL=[REDACTED]");
  });

  it("redacts long hex (SHA-256) but spares UUIDs", () => {
    const sha = "a".repeat(64);
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(sanitiseString(sha)).toBe("[REDACTED]");
    expect(sanitiseString(uuid)).toBe(uuid);
  });

  it("leaves clean strings unchanged", () => {
    expect(sanitiseString("hello world")).toBe("hello world");
  });
});

describe("sanitiseValue — recursive", () => {
  it("walks nested objects and arrays", () => {
    const input = {
      ok: "fine",
      nested: { key: "sk-abcdefghijklmnopqrstuvwxyz", list: ["clean", "AKIAIOSFODNN7EXAMPLE"] },
    };
    const out = sanitiseValue(input) as Record<string, unknown>;
    expect(out["ok"]).toBe("fine");
    const nested = out["nested"] as Record<string, unknown>;
    expect(nested["key"]).toBe("[REDACTED]");
    expect((nested["list"] as string[])[1]).toBe("[REDACTED]");
  });

  it("passes through non-string primitives", () => {
    expect(sanitiseValue(42)).toBe(42);
    expect(sanitiseValue(true)).toBe(true);
    expect(sanitiseValue(null)).toBe(null);
  });
});

describe("sanitiseError", () => {
  it("returns INTERNAL_ERROR for raw Error", () => {
    expect(sanitiseError(new Error("db secret leaked"))).toEqual({ error: "INTERNAL_ERROR" });
  });

  it("preserves custom error name and attaches requestId", () => {
    class ValidationFailure extends Error {
      override name = "ValidationFailure";
    }
    expect(sanitiseError(new ValidationFailure("..."), "req_abc")).toEqual({
      error: "ValidationFailure",
      requestId: "req_abc",
    });
  });
});
