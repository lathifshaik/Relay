import { describe, expect, it } from "vitest";
import type { ActionGraph, IOField } from "../src/action-graph.js";
import { RELAY_PROTOCOL_VERSION } from "../src/action-graph.js";
import { createBlockList } from "../src/block-list.js";
import type { EmitterContext } from "../src/emitter.js";
import { handleAct, handleManifest, handleState, handleValidate } from "../src/emitter.js";
import { issueToken } from "../src/token.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

const intField: IOField = { type: "integer", min: 1, max: 99, required: true };

const sampleGraph: ActionGraph = {
  relayVersion: RELAY_PROTOCOL_VERSION,
  appName: "test-app",
  generatedAt: "2026-06-04T00:00:00Z",
  actions: [
    {
      actionId: "create_order",
      method: "POST",
      path: "/orders",
      label: "Create order",
      inputs: { item_id: { type: "string", required: true }, quantity: intField },
      returns: { order_id: { type: "string" }, status: { type: "string" } },
      relayAccess: "allowed",
    },
    {
      actionId: "list_secrets",
      method: "GET",
      path: "/secrets/all",
      label: "List secrets",
      inputs: {},
      returns: {},
      relayAccess: "allowed",
    },
    {
      actionId: "denied_action",
      method: "POST",
      path: "/anything",
      label: "Denied",
      inputs: {},
      returns: {},
      relayAccess: "denied",
    },
  ],
};

const baseCtx = (overrides: Partial<EmitterContext> = {}): EmitterContext => ({
  graph: sampleGraph,
  blockList: createBlockList(),
  authDisabled: true,
  ...overrides,
});

describe("handleManifest", () => {
  it("returns the graph when auth is disabled", async () => {
    const r = await handleManifest(baseCtx(), {});
    expect(r.status).toBe(200);
    expect(r.body).toBe(sampleGraph);
  });

  it("returns 401 without a token when signingKey is set", async () => {
    const r = await handleManifest(baseCtx({ signingKey: KEY, authDisabled: false }), {});
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toBe("RELAY_UNAUTHENTICATED");
  });

  it("accepts a valid token", async () => {
    const token = issueToken({ subject: "agent", scope: ["*"], signingKey: KEY });
    const r = await handleManifest(
      baseCtx({ signingKey: KEY, authDisabled: false }),
      { token },
    );
    expect(r.status).toBe(200);
  });

  it("rejects a token with bad signature", async () => {
    const token = issueToken({ subject: "agent", scope: ["*"], signingKey: "other-key" });
    const r = await handleManifest(
      baseCtx({ signingKey: KEY, authDisabled: false }),
      { token },
    );
    expect(r.status).toBe(401);
    expect((r.body as { error: string }).error).toBe("RELAY_TOKEN_INVALID");
  });
});

describe("handleAct — happy path", () => {
  it("validates, invokes, projects output", async () => {
    const r = await handleAct(
      baseCtx(),
      { body: { inputs: { item_id: "i_1", quantity: 5 } } },
      "create_order",
      (_action, inputs) => ({
        order_id: "ord_1",
        status: "paid",
        internal_db_id: 999, // must be stripped by projection
        inputs_received: inputs,
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ order_id: "ord_1", status: "paid" });
  });

  it("accepts inputs at the body root if no `inputs` wrapper present", async () => {
    const r = await handleAct(
      baseCtx(),
      { body: { item_id: "i_1", quantity: 5 } },
      "create_order",
      () => ({ order_id: "ord_2", status: "open" }),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ order_id: "ord_2", status: "open" });
  });
});

describe("handleAct — failure modes", () => {
  it("returns 404 for unknown action", async () => {
    const r = await handleAct(baseCtx(), { body: {} }, "nope", () => ({}));
    expect(r.status).toBe(404);
  });

  it("returns 403 for blocked path via default block list", async () => {
    const r = await handleAct(baseCtx(), { body: {} }, "list_secrets", () => ({}));
    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe("RELAY_FORBIDDEN");
  });

  it("returns 403 for relayAccess: denied", async () => {
    const r = await handleAct(baseCtx(), { body: {} }, "denied_action", () => ({}));
    expect(r.status).toBe(403);
  });

  it("returns 400 for validation failure with structured error", async () => {
    const r = await handleAct(
      baseCtx(),
      { body: { inputs: { item_id: "i", quantity: "five" } } },
      "create_order",
      () => ({}),
    );
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe("RELAY_VALIDATION_FAILED");
  });

  it("returns 500 with sanitised error when handler throws", async () => {
    const r = await handleAct(
      baseCtx(),
      { body: { inputs: { item_id: "i", quantity: 1 } } },
      "create_order",
      () => {
        throw new Error("DB went boom: postgres://user:pass@host/db");
      },
    );
    expect(r.status).toBe(500);
    expect((r.body as { error: string }).error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("postgres://");
  });
});

describe("handleAct — scope enforcement", () => {
  it("returns 403 when token does not include the actionId in scope", async () => {
    const token = issueToken({
      subject: "agent",
      scope: ["other_action"],
      signingKey: KEY,
    });
    const r = await handleAct(
      baseCtx({ signingKey: KEY, authDisabled: false }),
      { body: { inputs: { item_id: "i_1", quantity: 5 } }, token },
      "create_order",
      () => ({ order_id: "x", status: "y" }),
    );
    expect(r.status).toBe(403);
    expect((r.body as { error: string }).error).toBe("RELAY_OUT_OF_SCOPE");
  });
});

describe("handleValidate", () => {
  it("returns ok for valid input without invoking a handler", async () => {
    const r = await handleValidate(
      baseCtx(),
      { body: { inputs: { item_id: "i_1", quantity: 5 } } },
      "create_order",
    );
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
  });

  it("returns 400 on invalid input", async () => {
    const r = await handleValidate(
      baseCtx(),
      { body: { inputs: { item_id: "i", quantity: 999 } } },
      "create_order",
    );
    expect(r.status).toBe(400);
  });
});

describe("handleState", () => {
  it("delegates to buildState", async () => {
    const r = await handleState(baseCtx(), {}, () => ({ user: "alice", step: 3 }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ user: "alice", step: 3 });
  });
});
