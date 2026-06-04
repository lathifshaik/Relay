import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { defineAction } from "../src/define-action.js";

describe("defineAction — POST happy path", () => {
  it("validates body inputs, runs handler, returns JSON", async () => {
    const create = defineAction({
      actionId: "create_thing",
      method: "POST",
      path: "/api/things",
      label: "Create thing",
      inputs: { name: { type: "string", required: true } },
      returns: { id: { type: "string" }, name: { type: "string" } },
      async handler({ name }) {
        return { id: "t_1", name };
      },
    });

    const req = new NextRequest("http://localhost/api/things", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "widget" }),
    });
    const res = await create(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string };
    expect(body).toEqual({ id: "t_1", name: "widget" });
  });
});

describe("defineAction — validation failure", () => {
  it("returns 400 with the structured RELAY_VALIDATION_FAILED error", async () => {
    const action = defineAction({
      actionId: "x",
      method: "POST",
      path: "/x",
      label: "x",
      inputs: { count: { type: "integer", min: 1, max: 10, required: true } },
      returns: {},
      handler: async () => ({}),
    });

    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 99 }),
    });
    const res = await action(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string };
    expect(body.error).toBe("RELAY_VALIDATION_FAILED");
    expect(body.field).toBe("count");
  });
});

describe("defineAction — GET reads query string", () => {
  it("pulls inputs out of nextUrl.searchParams", async () => {
    const action = defineAction({
      actionId: "search",
      method: "GET",
      path: "/api/search",
      label: "Search",
      inputs: { q: { type: "string", required: true } },
      returns: { q: { type: "string" } },
      async handler({ q }) {
        return { q };
      },
    });

    const req = new NextRequest("http://localhost/api/search?q=hello");
    const res = await action(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect((await res.json()) as { q: string }).toEqual({ q: "hello" });
  });
});

describe("defineAction — URL params override body", () => {
  it("uses params for path placeholders even when body provides same key", async () => {
    const action = defineAction({
      actionId: "update_thing",
      method: "PATCH",
      path: "/api/things/[id]",
      label: "Update thing",
      inputs: {
        id: { type: "string", required: true },
        title: { type: "string", required: true },
      },
      returns: { id: { type: "string" }, title: { type: "string" } },
      async handler({ id, title }) {
        return { id, title };
      },
    });

    const req = new NextRequest("http://localhost/api/things/t_real", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "t_spoofed", title: "renamed" }),
    });
    const res = await action(req, { params: Promise.resolve({ id: "t_real" }) });
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toEqual({
      id: "t_real",
      title: "renamed",
    });
  });
});

describe("defineAction — error sanitisation", () => {
  it("returns 500 with sanitised error when handler throws", async () => {
    const action = defineAction({
      actionId: "fail",
      method: "POST",
      path: "/x",
      label: "fail",
      inputs: {},
      returns: {},
      async handler() {
        throw new Error("postgres://user:pass@host/db went down");
      },
    });
    const req = new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await action(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("postgres://");
  });
});

describe("defineAction — meta is attached", () => {
  it("exposes _relayMeta for the relay handler to consume", () => {
    const action = defineAction({
      actionId: "create_widget",
      method: "POST",
      path: "/api/widgets",
      label: "Create widget",
      inputs: { name: { type: "string", required: true } },
      returns: { id: { type: "string" } },
      handler: async () => ({ id: "w_1" }),
    });
    expect(action._relayMeta.actionId).toBe("create_widget");
    expect(action._relayMeta.method).toBe("POST");
  });
});
