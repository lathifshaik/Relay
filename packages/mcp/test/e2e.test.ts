import { describe as relayDescribe } from "@relay/core";
import { middleware as relayMiddleware } from "@relay/express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import express from "express";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "../dist/bin.js");

// Skip the suite if the bin hasn't been built yet — happens on first install,
// `pnpm turbo run build` makes it available.
const SUITE = existsSync(BIN) ? describe : describe.skip;

SUITE("@relay/mcp — end-to-end against a live Express server", () => {
  let baseUrl: string;
  let server: ReturnType<express.Express["listen"]>;
  let client: Client;
  let transport: StdioClientTransport;

  const todos: Array<{ id: string; title: string; done: boolean }> = [];

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(relayMiddleware({ appName: "mcp-e2e-todo" }));

    app.get(
      "/todos",
      relayDescribe(
        (_req, res) => {
          res.relayRespond({ todos });
        },
        {
          actionId: "list_todos",
          inputs: {},
          returns: { todos: { type: "array", items: { type: "object" } } },
        },
      ),
    );

    app.post(
      "/todos",
      relayDescribe(
        (req, res) => {
          const title = String(req.body?.title ?? "");
          const todo = { id: `t_${todos.length + 1}`, title, done: false };
          todos.push(todo);
          res.relayRespond(todo);
        },
        {
          actionId: "create_todo",
          inputs: { title: { type: "string", required: true, min: 1 } },
          returns: {
            id: { type: "string" },
            title: { type: "string" },
            done: { type: "boolean" },
          },
        },
      ),
    );

    server = await new Promise<ReturnType<express.Express["listen"]>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;

    transport = new StdioClientTransport({
      command: "node",
      args: [BIN],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    client = new Client({ name: "e2e-test", version: "0" }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await transport?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("lists the four Relay tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["relay_act", "relay_manifest", "relay_state", "relay_validate"]);
  });

  it("relay_manifest returns the live Action Graph", async () => {
    const result = await client.callTool({
      name: "relay_manifest",
      arguments: { url: baseUrl },
    });
    expect(result.isError).toBeFalsy();
    const text = readText(result);
    const body = JSON.parse(text);
    expect(body.relayVersion).toBe("0.1");
    expect(body.appName).toBe("mcp-e2e-todo");
    expect(body.actions.map((a: { actionId: string }) => a.actionId).sort()).toEqual([
      "create_todo",
      "list_todos",
    ]);
  });

  it("relay_act creates a real todo on the live server", async () => {
    const result = await client.callTool({
      name: "relay_act",
      arguments: {
        url: baseUrl,
        actionId: "create_todo",
        inputs: { title: "via MCP" },
      },
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(readText(result));
    expect(body).toEqual({ id: "t_1", title: "via MCP", done: false });
    expect(todos).toHaveLength(1);
  });

  it("relay_validate fails for bad input without invoking the handler", async () => {
    const before = todos.length;
    const result = await client.callTool({
      name: "relay_validate",
      arguments: {
        url: baseUrl,
        actionId: "create_todo",
        inputs: { title: "" },
      },
    });
    expect(result.isError).toBe(true);
    expect(readText(result)).toContain("RELAY_VALIDATION_FAILED");
    expect(todos.length).toBe(before);
  });
});

function readText(result: { content?: unknown }): string {
  const arr = result.content;
  if (Array.isArray(arr) && arr[0] && typeof arr[0] === "object" && "text" in arr[0]) {
    return String((arr[0] as { text: unknown }).text);
  }
  throw new Error("Expected text content in tool result");
}
