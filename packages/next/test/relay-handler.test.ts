import { issueToken } from "@relay/core";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { defineAction } from "../src/define-action.js";
import { createRelayHandler } from "../src/relay-handler.js";

const products = [
  { id: "p_1", name: "Widget", price: 10 },
  { id: "p_2", name: "Gadget", price: 25 },
];

const listProducts = defineAction({
  actionId: "list_products",
  method: "GET",
  path: "/api/products",
  label: "List products",
  inputs: {},
  returns: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
        },
      },
    },
  },
  async handler() {
    return { products };
  },
});

const addToCart = defineAction({
  actionId: "add_to_cart",
  method: "POST",
  path: "/api/cart",
  label: "Add item to cart",
  inputs: {
    product_id: { type: "string", required: true },
    quantity: { type: "integer", min: 1, max: 99, required: true },
  },
  returns: {
    cart_id: { type: "string" },
    total_items: { type: "integer" },
  },
  async handler({ product_id, quantity }) {
    return {
      cart_id: "c_1",
      total_items: quantity as number,
      // Field that must be stripped by projection:
      internal_db_id: 12345,
      product_id,
    };
  },
});

describe("createRelayHandler — manifest", () => {
  it("returns Action Graph with all registered actions", async () => {
    const relay = createRelayHandler({
      appName: "shop",
      appVersion: "0.0.1",
      actions: [listProducts, addToCart],
    });
    const req = new NextRequest("http://localhost/relay/manifest");
    const res = await relay(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      relayVersion: string;
      appName: string;
      actions: Array<{ actionId: string; method: string; path: string }>;
    };
    expect(body.relayVersion).toBe("0.1");
    expect(body.appName).toBe("shop");
    expect(body.actions).toHaveLength(2);
    const ids = body.actions.map((a) => a.actionId).sort();
    expect(ids).toEqual(["add_to_cart", "list_products"]);
  });
});

describe("createRelayHandler — /relay/act/:actionId", () => {
  it("validates inputs, runs handler, projects output", async () => {
    const relay = createRelayHandler({ appName: "shop", actions: [addToCart] });
    const req = new NextRequest("http://localhost/relay/act/add_to_cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { product_id: "p_1", quantity: 3 } }),
    });
    const res = await relay(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cart_id: "c_1", total_items: 3 });
  });

  it("returns 400 for invalid input", async () => {
    const relay = createRelayHandler({ appName: "shop", actions: [addToCart] });
    const req = new NextRequest("http://localhost/relay/act/add_to_cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { product_id: "p_1", quantity: 0 } }),
    });
    const res = await relay(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toBe("RELAY_VALIDATION_FAILED");
    expect(body.field).toBe("quantity");
  });

  it("returns 404 for unknown action", async () => {
    const relay = createRelayHandler({ appName: "shop", actions: [addToCart] });
    const req = new NextRequest("http://localhost/relay/act/nope", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await relay(req);
    expect(res.status).toBe(404);
  });
});

describe("createRelayHandler — /relay/validate", () => {
  it("validates without invoking the handler", async () => {
    let calls = 0;
    const action = defineAction({
      actionId: "do_thing",
      method: "POST",
      path: "/x",
      label: "x",
      inputs: { name: { type: "string", required: true } },
      returns: {},
      async handler() {
        calls += 1;
        return {};
      },
    });
    const relay = createRelayHandler({ appName: "x", actions: [action] });
    const req = new NextRequest("http://localhost/relay/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: "do_thing", inputs: { name: "hi" } }),
    });
    const res = await relay(req);
    expect(res.status).toBe(200);
    expect(calls).toBe(0);
  });
});

describe("createRelayHandler — /relay/state", () => {
  it("delegates to buildState", async () => {
    const relay = createRelayHandler({
      appName: "x",
      actions: [],
      buildState: () => ({ user: "alice", step: 9 }),
    });
    const res = await relay(new NextRequest("http://localhost/relay/state"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "alice", step: 9 });
  });
});

describe("createRelayHandler — auth", () => {
  const KEY = "test-signing-key-32-chars-or-longer";

  it("returns 401 without a token when signingKey set", async () => {
    const relay = createRelayHandler({
      appName: "x",
      actions: [listProducts],
      signingKey: KEY,
    });
    const res = await relay(new NextRequest("http://localhost/relay/manifest"));
    expect(res.status).toBe(401);
  });

  it("accepts a valid token", async () => {
    const relay = createRelayHandler({
      appName: "x",
      actions: [listProducts],
      signingKey: KEY,
    });
    const token = issueToken({ subject: "agent", scope: ["*"], signingKey: KEY });
    const req = new NextRequest("http://localhost/relay/manifest", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await relay(req);
    expect(res.status).toBe(200);
  });
});

describe("createRelayHandler — unknown /relay/* path", () => {
  it("returns 404", async () => {
    const relay = createRelayHandler({ appName: "x", actions: [] });
    const res = await relay(new NextRequest("http://localhost/relay/something-else"));
    expect(res.status).toBe(404);
  });
});
