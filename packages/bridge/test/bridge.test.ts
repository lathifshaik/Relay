import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBlockList } from "@relay/core";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discover } from "../src/discover.js";
import { createBridgeServer } from "../src/server.js";
import { Session } from "../src/session.js";
import type { BridgeGraph } from "../src/types.js";
import { type FixtureState, startFixtureApp } from "./fixture.js";

let app: Awaited<ReturnType<typeof startFixtureApp>>;
let state: FixtureState;
let graph: BridgeGraph;
let session: Session;

beforeAll(async () => {
  app = await startFixtureApp();
  state = app.state;
  session = new Session({ cookie: "sid=abc", ratePerSecond: 1000 });
  graph = (await discover(session, app.baseUrl, { blockList: createBlockList() })).graph;
});
afterAll(() => app.close());

async function connect(readOnly = false): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createBridgeServer({ session, graph, readOnly }).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

/** Calls a tool that needs confirmation: once to get the code, again with it. */
async function confirmed(client: Client, name: string, args: Record<string, unknown>) {
  const first = parse(await client.callTool({ name, arguments: args })) as unknown as { next: string };
  const code = /"_confirm": "([0-9a-f]+)"/.exec(first.next)?.[1];
  return client.callTool({ name, arguments: { ...args, _confirm: code } });
}

function parse(result: Awaited<ReturnType<Client["callTool"]>>): { status: number; body: Record<string, unknown> } {
  const content = result.content as Array<{ text: string }>;
  return JSON.parse(content[0]?.text ?? "{}");
}

describe("discovering a plain web app from its frontend", () => {
  it("finds API endpoints from its scripts, with methods and body fields", () => {
    const byId = Object.fromEntries(graph.actions.map((a) => [a.actionId, a]));
    expect(byId["list_orders"]?.method).toBe("GET");
    expect(byId["get_order"]?.inputs["id"]).toMatchObject({ required: true });
    expect(Object.keys(byId["place_order"]?.inputs ?? {})).toEqual(["title", "qty"]);
    expect(byId["get_api_profile"]).toBeDefined();
  });

  it("finds the contact form without exposing its hidden CSRF field", () => {
    const form = graph.actions.find((a) => a.target.kind === "form" && a.path === "/contact");
    expect(form?.inputs).toMatchObject({
      message: { type: "string", required: true, description: "Message" },
      topic: { type: "enum", enum: ["sales", "help"] },
    });
    expect(form?.inputs["csrf"]).toBeUndefined();
  });

  it("never follows logout links or reads blocked pages", () => {
    expect(state.loggedOut).toBe(false);
    expect(graph.pages).not.toContain("/admin");
  });
});

describe("using the app through MCP", () => {
  it("lists one tool per action plus read_page", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_orders", "place_order", "read_page"]));
  });

  it("calls an API with the user's session and redacts secrets in the reply", async () => {
    const client = await connect();
    const created = parse(await confirmed(client, "place_order", { title: "Hat", qty: "2" }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Hat", secret: "[REDACTED]" });

    const one = parse(await client.callTool({ name: "get_order", arguments: { id: "2" } }));
    expect(one.body).toMatchObject({ id: 2, title: "Hat" });
  });

  it("submits a form with its fresh CSRF token and returns the result as text", async () => {
    const client = await connect();
    const form = graph.actions.find((a) => a.target.kind === "form" && a.path === "/contact");
    const result = parse(
      await confirmed(client, form?.actionId ?? "", { message: "hi", topic: "help" }),
    );
    expect(result.status).toBe(200);
    expect(result.body["text"]).toContain("Thanks, we got your message.");
    expect(state.messages).toContainEqual({ message: "hi", topic: "help" });
  });

  it("returns validation errors instead of calling the app", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_order", arguments: {} });
    expect(r.isError).toBe(true);
    expect((r.content as Array<{ text: string }>)[0]?.text).toContain("RELAY_VALIDATION_FAILED");
  });

  it("reads pages as text and stays on the site", async () => {
    const client = await connect();
    const page = parse(await client.callTool({ name: "read_page", arguments: { path: "/" } }));
    expect(page.body["text"]).toContain("Welcome to Shop");
    const away = await client.callTool({ name: "read_page", arguments: { path: "https://example.org/" } });
    expect(away.isError).toBe(true);
  });

  it("hides actions that change things in read-only mode", async () => {
    const client = await connect(true);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("list_orders");
    expect(names).not.toContain("place_order");
  });
});

describe("knowing what an action means", () => {
  it("names endpoints after the function that calls them and rates their risk", () => {
    const place = graph.actions.find((a) => a.actionId === "place_order");
    expect(place?.risk).toBe("external");
    expect(place?.description).toContain('Afterwards the app shows: "Order placed"');
    expect(graph.actions.find((a) => a.actionId === "list_orders")?.risk).toBe("read");
    // Minified code has no useful name; the path-based id stays.
    expect(graph.actions.find((a) => a.actionId === "get_api_stats")?.risk).toBe("read");
  });

  it("marks tools with MCP hints the client can use to ask the user", async () => {
    const client = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools.find((t) => t.name === "place_order")?.annotations).toMatchObject({
      title: "Place order",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
    expect(tools.find((t) => t.name === "list_orders")?.annotations).toMatchObject({ readOnlyHint: true });
  });

  it("does nothing until a risky call is confirmed with the same inputs", async () => {
    const client = await connect();
    const before = state.orders.length;
    const first = parse(await client.callTool({ name: "place_order", arguments: { title: "Coat", qty: "1" } })) as unknown as {
      confirmationRequired: boolean;
      next: string;
    };
    expect(first.confirmationRequired).toBe(true);
    expect(state.orders.length).toBe(before);

    const code = /"_confirm": "([0-9a-f]+)"/.exec(first.next)?.[1];
    // A code for one set of inputs can't be reused for another.
    await client.callTool({ name: "place_order", arguments: { title: "Car", qty: "9", _confirm: code } });
    expect(state.orders.length).toBe(before);
  });
});

describe("apps that describe themselves", () => {
  async function serve(app: express.Express): Promise<{ url: string; close: () => void }> {
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
  }

  it("prefers a published OpenAPI spec", async () => {
    const api = express();
    api.get("/openapi.json", (_req, res) =>
      res.json({
        openapi: "3.0.0",
        paths: {
          "/pets/{petId}": {
            get: {
              operationId: "getPet",
              summary: "Get a pet",
              parameters: [{ name: "petId", in: "path", required: true, schema: { type: "integer" } }],
              responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } } },
            },
          },
        },
        components: { schemas: { Pet: { type: "object", properties: { name: { type: "string" } } } } },
      }),
    );
    api.get("/pets/:id", (req, res) => res.json({ name: `pet ${req.params.id}` }));
    const { url, close } = await serve(api);
    try {
      const result = await discover(new Session({ ratePerSecond: 1000 }), url, { blockList: createBlockList() });
      expect(result.source).toBe("openapi");
      const action = result.graph.actions[0];
      expect(action).toMatchObject({
        actionId: "get_pet",
        path: "/pets/:petId",
        inputs: { petId: { type: "integer", required: true } },
        returns: { name: { type: "string" } },
      });
    } finally {
      close();
    }
  });

  it("uses a Relay manifest when the app has one", async () => {
    const api = express();
    api.get("/relay/manifest", (_req, res) =>
      res.json({
        relayVersion: "0.1",
        appName: "todo",
        generatedAt: "",
        actions: [{ actionId: "list_todos", method: "GET", path: "/todos", label: "List", inputs: {}, returns: {}, relayAccess: "allowed" }],
      }),
    );
    const { url, close } = await serve(api);
    try {
      const result = await discover(new Session({ ratePerSecond: 1000 }), url, { blockList: createBlockList() });
      expect(result.source).toBe("relay");
      expect(result.graph.actions[0]?.target).toEqual({
        kind: "api",
        urlTemplate: `${url}/relay/act/list_todos`,
        callMethod: "POST",
      });
    } finally {
      close();
    }
  });
});
