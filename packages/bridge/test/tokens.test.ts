import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBlockList } from "@relay/core";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSite, saveSite, siteFile } from "../src/cache.js";
import { ReadMemory } from "../src/changes.js";
import { discover } from "../src/discover.js";
import { LayoutMemory } from "../src/layout.js";
import { createBridgeServer } from "../src/server.js";
import { Session } from "../src/session.js";
import type { BridgeGraph } from "../src/types.js";
import { startFixtureApp } from "./fixture.js";

describe("LayoutMemory", () => {
  it("hides lines shared by different kinds of page", () => {
    const layout = new LayoutMemory();
    layout.observe("https://a.io/", ["Home · Orders", "Welcome", "© Shop"]);
    layout.observe("https://a.io/contact", ["Home · Orders", "Write to us", "© Shop"]);
    expect(layout.strip("https://a.io/orders", ["Home · Orders", "Order list", "© Shop"])).toEqual({
      kept: ["Order list"],
      hidden: 2,
    });
  });

  it("never hides a repeated detail line across pages of the same template", () => {
    const layout = new LayoutMemory();
    layout.observe("https://a.io/orders/1", ["Status: shipped"]);
    layout.observe("https://a.io/orders/2", ["Status: shipped"]);
    expect(layout.isChrome("Status: shipped")).toBe(false);
  });

  it("round-trips through a snapshot", () => {
    const layout = new LayoutMemory();
    layout.observe("https://a.io/", ["nav"]);
    layout.observe("https://a.io/b", ["nav"]);
    expect(LayoutMemory.from(layout.snapshot()).isChrome("nav")).toBe(true);
  });
});

describe("ReadMemory", () => {
  const order = (id: number, qty = 1) => ({ id, qty, title: `Order number ${id}`, status: "processing" });

  it("sends the full value first, then unchanged, then only the changes", () => {
    const reads = new ReadMemory();
    const v1 = { orders: Array.from({ length: 10 }, (_, i) => order(i + 1)), total: 10 };
    const v2 = { orders: [order(1, 3), ...v1.orders.slice(1), order(11)], total: 11 };
    expect(reads.compare("k", v1)).toEqual({ full: v1 });
    expect(reads.compare("k", v1)).toEqual({ unchanged: true });
    expect(reads.compare("k", v2)).toEqual({
      changes: [
        { path: "orders[id=1].qty", from: 1, to: 3 },
        { path: "orders", added: order(11) },
        { path: "total", from: 10, to: 11 },
      ],
    });
  });

  it("falls back to the full value when a diff would not be smaller", () => {
    const reads = new ReadMemory();
    reads.compare("k", { a: 1 });
    expect(reads.compare("k", { b: 2 })).toEqual({ full: { b: 2 } });
  });
});

describe("the bridge over MCP", () => {
  let app: Awaited<ReturnType<typeof startFixtureApp>>;
  let graph: BridgeGraph;
  let layout: LayoutMemory;
  const session = new Session({ cookie: "sid=abc" });
  const logs: string[] = [];

  beforeAll(async () => {
    app = await startFixtureApp();
    // A realistic history, so a list is bigger than a note about one change to it.
    for (let id = 2; id <= 20; id++) app.state.orders.push({ id, title: `Past order ${id}`, qty: 1 });
    layout = new LayoutMemory();
    graph = (await discover(session, app.baseUrl, { blockList: createBlockList(), layout })).graph;
  });
  afterAll(() => app.close());

  async function connect(): Promise<Client> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createBridgeServer({ session, graph, layout, log: (l) => logs.push(l) }).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    return client;
  }

  async function call(client: Client, name: string, args: Record<string, unknown>) {
    const r = await client.callTool({ name, arguments: args });
    return JSON.parse((r.content as Array<{ text: string }>)[0]?.text ?? "{}") as { status: number; body: Record<string, unknown> };
  }

  it("hides the header and footer it learned while discovering", async () => {
    const client = await connect();
    const page = await call(client, "read_page", { path: "/orders" });
    expect(page.body["text"]).toContain("Your orders");
    expect(page.body["text"]).not.toContain("All rights reserved");
    expect(page.body["text"]).not.toContain("Signed in as Ada");
    expect(page.body["hidden"]).toMatch(/lines of site navigation/);
  });

  it("answers a repeat read with unchanged, and later with only what changed", async () => {
    const client = await connect();
    await call(client, "get_api_orders", {});
    expect((await call(client, "get_api_orders", {})).body).toEqual({ unchanged: true });

    await call(client, "post_api_orders", { title: "Scarf", qty: "1" });
    const after = await call(client, "get_api_orders", {});
    expect(after.body["changes"]).toEqual([
      { path: "orders", added: expect.objectContaining({ title: "Scarf" }) },
    ]);

    const page1 = await call(client, "read_page", { path: "/orders" });
    await call(client, "post_api_orders", { title: "Gloves", qty: "2" });
    const page2 = await call(client, "read_page", { path: "/orders" });
    expect(page1.body["text"]).toBeDefined();
    expect(page2.body["changes"]).toEqual([{ path: "text", added: "Gloves × 2" }]);
  });

  it("returns everything when asked with _full", async () => {
    const client = await connect();
    await call(client, "read_page", { path: "/" });
    const again = await call(client, "read_page", { path: "/", _full: true });
    expect(again.body["text"]).toContain("Welcome to Shop");
  });

  it("logs what it read and how much it sent on", () => {
    expect(logs.some((l) => /^read \/orders → 200 · .+ in → .+ out/.test(l))).toBe(true);
    expect(logs.some((l) => l.includes("unchanged since last read"))).toBe(true);
  });
});

describe("site map cache", () => {
  it("saves privately and loads until it is too old", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "relay-bridge-"));
    try {
      const graph = { relayVersion: "0.1", appName: "a.io", baseUrl: "https://a.io", generatedAt: "", pages: [], actions: [] };
      await saveSite(dir, "https://a.io/x", graph, { templates: ["/"], lines: {} });
      expect(((await stat(siteFile(dir, "https://a.io"))).mode & 0o777).toString(8)).toBe("600");
      expect((await loadSite(dir, "https://a.io"))?.graph.appName).toBe("a.io");
      expect(await loadSite(dir, "https://a.io", -1)).toBeUndefined();
      expect(await loadSite(dir, "https://b.io")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
