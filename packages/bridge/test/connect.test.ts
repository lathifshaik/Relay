import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createBlockList, describe as relayDescribe } from "@relay/core";
import { middleware } from "@relay/express";
import express, { type Request, type Response } from "express";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { connectWithRelay, supportsConnect } from "../src/connect-client.js";
import { discover } from "../src/discover.js";
import { createBridgeServer } from "../src/server.js";
import { Session } from "../src/session.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

describe("relay-bridge + a Relay site's connect flow", () => {
  it("connects with the person's approval, then uses the app as them", async () => {
    const app = express();
    app.use(express.json());
    const userOf = (req: Request) => /(?:^|;\s*)user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    app.use(middleware({ appName: "Tasks", signingKey: KEY, connect: { pollIntervalSeconds: 0 }, identify: userOf }));
    const tasks: Record<string, string[]> = { ada: ["write docs"] };
    app.get(
      "/tasks",
      relayDescribe((req: Request, res: Response) => res.relayRespond({ tasks: tasks[req.relay?.subject ?? ""] ?? [] }), {
        actionId: "list_tasks",
        label: "List my tasks",
        returns: { tasks: { type: "array", items: { type: "string" } } },
      }),
    );
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", () => r()));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
      const connectUrl = await supportsConnect(new Session(), origin);
      expect(connectUrl).toBe(`${origin}/relay/connect`);

      // What Ada does in her browser when the bridge shows her the link.
      const approveInBrowser = async (url: string) => {
        const page = await (await fetch(url, { headers: { cookie: "user=ada" } })).text();
        const csrf = /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";
        const code = new URL(url).searchParams.get("code") ?? "";
        await fetch(`${origin}/relay/approve`, {
          method: "POST",
          headers: { cookie: "user=ada", "content-type": "application/x-www-form-urlencoded" },
          body: `code=${code}&csrf=${encodeURIComponent(csrf)}&decision=approve&scope=list_tasks`,
        });
      };

      let approval: Promise<void> = Promise.resolve();
      const result = await connectWithRelay(new Session({ ratePerSecond: 1000 }), connectUrl as string, {
        agentName: "relay-bridge test",
        onPrompt: ({ url }) => {
          approval = approveInBrowser(url);
        },
        sleep: async () => {
          await approval;
        },
      });
      expect(result.scope).toEqual(["list_tasks"]);

      // The bridge now reads the site's Relay manifest and acts with the token.
      const session = new Session({ bearerToken: result.token, ratePerSecond: 1000 });
      const { graph, source } = await discover(session, origin, { blockList: createBlockList() });
      expect(source).toBe("relay");

      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await createBridgeServer({ session, graph }).connect(serverSide);
      const client = new Client({ name: "test", version: "0" });
      await client.connect(clientSide);
      const reply = await client.callTool({ name: "list_tasks", arguments: {} });
      expect(JSON.parse((reply.content as Array<{ text: string }>)[0]?.text ?? "{}")).toEqual({
        status: 200,
        body: { tasks: ["write docs"] },
      });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
