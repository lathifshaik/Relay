import { describe, expect, it, vi } from "vitest";
import { RelayClient } from "../src/client.js";

function mockFetchOnce(status: number, body: unknown): typeof fetch {
  return vi.fn(async (input: unknown, init?: unknown) => {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("RelayClient.getManifest", () => {
  it("GETs /relay/manifest", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: unknown, init: unknown) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({ relayVersion: "0.1", actions: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = new RelayClient({ fetchImpl });
    const r = await client.getManifest("http://localhost:3000");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ relayVersion: "0.1", actions: [] });
    expect(calls[0]?.url).toBe("http://localhost:3000/relay/manifest");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("trims trailing slash on base URL", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    await client.getManifest("http://localhost:3000/");
    expect(calls[0]).toBe("http://localhost:3000/relay/manifest");
  });
});

describe("RelayClient.act", () => {
  it("POSTs /relay/act/:actionId with inputs wrapper", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: unknown, init: unknown) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({ id: "t_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });

    await client.act("http://localhost:3000", "create_todo", { title: "X" });
    expect(calls[0]?.url).toBe("http://localhost:3000/relay/act/create_todo");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      inputs: { title: "X" },
    });
  });

  it("URL-encodes the actionId", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    await client.act("http://x.test", "weird/action", {});
    expect(calls[0]).toContain("/relay/act/weird%2Faction");
  });
});

describe("RelayClient.validate", () => {
  it("POSTs /relay/validate with {actionId, inputs}", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input: unknown, init: unknown) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    await client.validate("http://x.test", "do_thing", { name: "alice" });
    expect(calls[0]?.url).toBe("http://x.test/relay/validate");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      actionId: "do_thing",
      inputs: { name: "alice" },
    });
  });
});

describe("RelayClient — Bearer token", () => {
  it("sets Authorization header when token is provided", async () => {
    const captured: Array<RequestInit> = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input: unknown, init: unknown) => {
      captured.push(init as RequestInit);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl, token: "my-jwt-token" });
    await client.getManifest("http://x.test");
    expect((captured[0]?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my-jwt-token",
    );
  });

  it("omits Authorization header when no token", async () => {
    const captured: Array<RequestInit> = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input: unknown, init: unknown) => {
      captured.push(init as RequestInit);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    await client.getManifest("http://x.test");
    const headers = (captured[0]?.headers as Record<string, string>) ?? {};
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("RelayClient — response parsing", () => {
  it("parses empty body as null", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    const r = await client.getManifest("http://x.test");
    expect(r.body).toBe(null);
  });

  it("returns raw text when body is not JSON", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      return new Response("plain text response", { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });
    const r = await client.getManifest("http://x.test");
    expect(r.body).toBe("plain text response");
  });

  it("preserves error status", async () => {
    const fetchImpl = mockFetchOnce(401, { error: "RELAY_UNAUTHENTICATED" });
    const client = new RelayClient({ fetchImpl });
    const r = await client.getManifest("http://x.test");
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: "RELAY_UNAUTHENTICATED" });
  });
});
