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
  session = new Session({ cookie: "sid=abc" });
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

function parse(result: Awaited<ReturnType<Client["callTool"]>>): { status: number; body: Record<string, unknown> } {
  const content = result.content as Array<{ text: string }>;
  return JSON.parse(content[0]?.text ?? "{}");
}

describe("discovering a plain web app from its frontend", () => {
  it("finds API endpoints from its scripts, with methods and body fields", () => {
    const byId = Object.fromEntries(graph.actions.map((a) => [a.actionId, a]));
    expect(byId["get_api_orders"]?.method).toBe("GET");
    expect(byId["get_api_orders_by_id"]?.inputs["id"]).toMatchObject({ required: true });
    expect(Object.keys(byId["post_api_orders"]?.inputs ?? {})).toEqual(["title", "qty"]);
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
    expect(names).toEqual(expect.arrayContaining(["get_api_orders", "post_api_orders", "read_page"]));
  });

  it("calls an API with the user's session and redacts secrets in the reply", async () => {
    const client = await connect();
    const created = parse(await client.callTool({ name: "post_api_orders", arguments: { title: "Hat", qty: "2" } }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Hat", secret: "[REDACTED]" });

    const one = parse(await client.callTool({ name: "get_api_orders_by_id", arguments: { id: "2" } }));
    expect(one.body).toMatchObject({ id: 2, title: "Hat" });
  });

  it("submits a form with its fresh CSRF token and returns the result as text", async () => {
    const client = await connect();
    const form = graph.actions.find((a) => a.target.kind === "form" && a.path === "/contact");
    const result = parse(
      await client.callTool({ name: form?.actionId ?? "", arguments: { message: "hi", topic: "help" } }),
    );
    expect(result.status).toBe(200);
    expect(result.body["text"]).toContain("Thanks, we got your message.");
    expect(state.messages).toContainEqual({ message: "hi", topic: "help" });
  });

  it("returns validation errors instead of calling the app", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "get_api_orders_by_id", arguments: {} });
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
    expect(names).toContain("get_api_orders");
    expect(names).not.toContain("post_api_orders");
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
      const result = await discover(new Session(), url, { blockList: createBlockList() });
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
      const result = await discover(new Session(), url, { blockList: createBlockList() });
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
