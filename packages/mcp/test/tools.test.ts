import { describe, expect, it, vi } from "vitest";
import { RelayClient } from "../src/client.js";
import { TOOL_DEFINITIONS, callTool } from "../src/tools.js";

function clientWithResponse(status: number, body: unknown): RelayClient {
  const fetchImpl: typeof fetch = vi.fn(async () => {
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return new RelayClient({ fetchImpl });
}

describe("TOOL_DEFINITIONS", () => {
  it("exposes exactly the four tools named in the protocol", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort();
    expect(names).toEqual(["relay_act", "relay_manifest", "relay_state", "relay_validate"]);
  });

  it("every tool has a required url argument", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema.required).toContain("url");
      expect(tool.inputSchema.properties).toHaveProperty("url");
    }
  });
});

describe("callTool — happy paths", () => {
  it("relay_manifest returns the graph as text content", async () => {
    const client = clientWithResponse(200, {
      relayVersion: "0.1",
      actions: [{ actionId: "x" }],
    });
    const r = await callTool(client, "relay_manifest", { url: "http://x.test" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]?.type).toBe("text");
    expect(JSON.parse(r.content[0]?.text ?? "")).toEqual({
      relayVersion: "0.1",
      actions: [{ actionId: "x" }],
    });
  });

  it("relay_act includes inputs in the post body", async () => {
    const calls: Array<RequestInit> = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input: unknown, init: unknown) => {
      calls.push(init as RequestInit);
      return new Response(JSON.stringify({ id: "t_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new RelayClient({ fetchImpl });

    const r = await callTool(client, "relay_act", {
      url: "http://x.test",
      actionId: "create_thing",
      inputs: { name: "hi" },
    });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(String(calls[0]?.body))).toEqual({ inputs: { name: "hi" } });
  });

  it("relay_validate hits /relay/validate", async () => {
    const client = clientWithResponse(200, { ok: true, actionId: "x" });
    const r = await callTool(client, "relay_validate", {
      url: "http://x.test",
      actionId: "x",
      inputs: {},
    });
    expect(r.isError).toBeUndefined();
  });

  it("relay_state returns state body", async () => {
    const client = clientWithResponse(200, { user: "alice" });
    const r = await callTool(client, "relay_state", { url: "http://x.test" });
    expect(JSON.parse(r.content[0]?.text ?? "")).toEqual({ user: "alice" });
  });
});

describe("callTool — error mapping", () => {
  it("marks the result isError:true when Relay returns >=400", async () => {
    const client = clientWithResponse(400, {
      error: "RELAY_VALIDATION_FAILED",
      field: "x",
      expected: "integer",
      received: "string",
      suggestion: "Pass an integer",
    });
    const r = await callTool(client, "relay_act", {
      url: "http://x.test",
      actionId: "a",
      inputs: {},
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("RELAY_VALIDATION_FAILED");
  });
});

describe("callTool — input validation", () => {
  it("throws when url is missing", async () => {
    const client = clientWithResponse(200, {});
    await expect(callTool(client, "relay_manifest", {})).rejects.toThrow(/url/);
  });

  it("throws when actionId is missing on relay_act", async () => {
    const client = clientWithResponse(200, {});
    await expect(
      callTool(client, "relay_act", { url: "http://x.test", inputs: {} }),
    ).rejects.toThrow(/actionId/);
  });

  it("throws when inputs is not an object", async () => {
    const client = clientWithResponse(200, {});
    await expect(
      callTool(client, "relay_act", {
        url: "http://x.test",
        actionId: "x",
        inputs: "not an object",
      }),
    ).rejects.toThrow(/inputs/);
  });

  it("returns isError:true for unknown tool name", async () => {
    const client = clientWithResponse(200, {});
    const r = await callTool(client, "relay_unknown", {});
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("Unknown tool");
  });
});
