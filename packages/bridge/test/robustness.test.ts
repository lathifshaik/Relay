import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createBlockList } from "@relay/core";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { describe, expect, it } from "vitest";
import { looksSignedOut, parsePastedSession, sessionFile } from "../src/auth.js";
import { discover } from "../src/discover.js";
import { applyLabels, classifyRisk, words } from "../src/meaning.js";
import { PolicyError, parseRobots } from "../src/policy.js";
import { createBridgeServer } from "../src/server.js";
import { Session } from "../src/session.js";
import type { BridgeAction, BridgeGraph } from "../src/types.js";

const fast = () => new Session({ ratePerSecond: 1000 });

async function serve(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

async function connect(opts: Parameters<typeof createBridgeServer>[0]) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createBridgeServer(opts);
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return { client, server };
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
  JSON.parse((r.content as Array<{ text: string }>)[0]?.text ?? "{}") as { status: number; body: Record<string, unknown>; note?: string };

function apiAction(actionId: string, url: string, method: BridgeAction["method"] = "GET"): BridgeAction {
  return {
    actionId,
    method,
    path: new URL(url).pathname,
    label: actionId,
    inputs: {},
    returns: {},
    relayAccess: "allowed",
    risk: method === "GET" ? "read" : "write",
    target: { kind: "api", urlTemplate: url },
  };
}

function graphOf(base: string, actions: BridgeAction[]): BridgeGraph {
  return { relayVersion: "0.1", appName: "t", baseUrl: base, generatedAt: "", pages: [], actions };
}

describe("risk", () => {
  it.each([
    ["GET", "listInvoices", "read"],
    ["POST", "sendInvoice", "external"],
    ["POST", "chargeCard", "external"],
    ["POST", "deleteProject", "destructive"],
    ["DELETE", "project", "destructive"],
    ["POST", "searchOrders", "read"],
    ["PATCH", "updateProfile", "write"],
  ])("%s %s is %s", (method, name, risk) => {
    expect(classifyRisk(method, words(name))).toBe(risk);
  });
});

describe("labels", () => {
  it("rename, re-rate or hide tools by the endpoint they call", () => {
    const actions = [apiAction("post_api_v2_x", "https://a.io/api/v2/x", "POST"), apiAction("get_api_y", "https://a.io/api/y")];
    const out = applyLabels(actions, {
      "POST /api/v2/x": { name: "send_invoice", description: "Emails the invoice to the customer", risk: "external" },
      "GET /api/y": { hidden: true },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ actionId: "send_invoice", risk: "external" });
  });
});

describe("site permission", () => {
  it("reads robots.txt rules for the bridge, falling back to *", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/ok\n", "relay-bridge");
    expect(robots.allows("/")).toBe(true);
    expect(robots.allows("/private/x")).toBe(false);
    expect(robots.allows("/private/ok")).toBe(true);
    expect(parseRobots("User-agent: relay-bridge\nDisallow: /", "relay-bridge")).toMatchObject({ specific: true });
  });

  it("refuses sites that opt out, and skips pages robots.txt disallows", async () => {
    const deny = express();
    deny.get("/.well-known/relay.json", (_req, res) => res.json({ agents: "deny", message: "no bots please" }));
    const official = express();
    official.get("/.well-known/relay.json", (_req, res) => res.json({ agents: "official-only" }));
    const robots = express();
    robots.get("/robots.txt", (_req, res) => res.type("text").send("User-agent: *\nDisallow: /secret-page"));
    robots.get("/", (_req, res) => res.type("html").send('<a href="/secret-page">x</a><a href="/open">y</a>'));
    robots.get(["/secret-page", "/open"], (_req, res) => res.type("html").send("<p>page</p>"));

    const a = await serve(deny);
    const b = await serve(official);
    const c = await serve(robots);
    try {
      await expect(discover(fast(), a.url, { blockList: createBlockList() })).rejects.toThrow(/no bots please/);
      await expect(discover(fast(), b.url, { blockList: createBlockList() })).rejects.toBeInstanceOf(PolicyError);
      const { graph } = await discover(fast(), c.url, { blockList: createBlockList() });
      expect(graph.pages).toContain("/open");
      expect(graph.pages).not.toContain("/secret-page");
    } finally {
      await Promise.all([a.close(), b.close(), c.close()]);
    }
  });
});

describe("signing in", () => {
  it("understands what people paste", () => {
    expect(parsePastedSession("Cookie: sid=abc; theme=dark")).toEqual({ cookie: "sid=abc; theme=dark" });
    expect(parsePastedSession("Authorization: Bearer tok_123")).toEqual({ token: "tok_123" });
    expect(parsePastedSession("  ghp_abcdef  ")).toEqual({ token: "ghp_abcdef" });
    expect(parsePastedSession("   ")).toBeUndefined();
  });

  it("recognises a signed-out reply", () => {
    const res = (over: Partial<Parameters<typeof looksSignedOut>[0]>) => ({
      status: 200,
      url: "https://a.io/orders",
      requestUrl: "https://a.io/orders",
      contentType: "text/html",
      text: "<p>ok</p>",
      ...over,
    });
    expect(looksSignedOut(res({}))).toBe(false);
    expect(looksSignedOut(res({ status: 401 }))).toBe(true);
    expect(looksSignedOut(res({ url: "https://a.io/users/sign_in" }))).toBe(true);
    expect(looksSignedOut(res({ text: '<form><input type="password" name="p"></form>' }))).toBe(true);
    // Asking for the login page itself is not "signed out".
    expect(looksSignedOut(res({ requestUrl: "https://a.io/login", url: "https://a.io/login" }))).toBe(false);
  });

  it("tells the agent to have the user log in again instead of returning a login page", async () => {
    const app = express();
    app.get("/api/me", (_req, res) => res.redirect("/login"));
    app.get("/login", (_req, res) => res.type("html").send('<form><input name="email"><input type="password" name="pw"></form>'));
    const { url, close } = await serve(app);
    try {
      const { client } = await connect({ session: fast(), graph: graphOf(url, [apiAction("get_me", `${url}/api/me`)]) });
      const r = text(await client.callTool({ name: "get_me", arguments: {} }));
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ error: "SIGNED_OUT" });
      expect(r.body["message"]).toContain("relay-bridge login");
    } finally {
      await close();
    }
  });

  it("login verifies the pasted session and saves it privately", async () => {
    const app = express();
    app.get("/", (req, res) =>
      (req.headers.cookie ?? "").includes("sid=good") ? res.type("html").send("<p>Hi Ada</p>") : res.redirect("/login"),
    );
    app.get("/login", (_req, res) => res.type("html").send('<form><input type="password" name="pw"></form>'));
    const { url, close } = await serve(app);
    const dir = await mkdtemp(path.join(tmpdir(), "relay-bridge-login-"));
    const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/bin.js");
    const run = (input: string) =>
      new Promise<{ code: number | null; stderr: string }>((resolve) => {
        const child = execFile("node", [bin, "login", url, "--cache-dir", dir], (err, _out, stderr) =>
          resolve({ code: err ? (err as { code?: number }).code ?? 1 : 0, stderr }),
        );
        child.stdin?.end(input);
      });
    try {
      const bad = await run("Cookie: sid=wrong\n");
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain("still treats that session as signed out");

      const good = await run("Cookie: sid=good\n");
      expect(good.code).toBe(0);
      const file = sessionFile(dir, url);
      expect(((await stat(file)).mode & 0o777).toString(8)).toBe("600");
      expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ cookie: "sid=good" });
    } finally {
      await close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe("when the app changes", () => {
  it("reports a moved endpoint, asks for a rescan, and can swap the tool list live", async () => {
    const app = express();
    app.post("/api/old", (_req, res) => res.status(405).send("Method Not Allowed"));
    app.get("/api/profile", (_req, res) => res.json({ name: "Ada", plan: "pro" }));
    const { url, close } = await serve(app);
    const stale: string[] = [];
    try {
      const old = { ...apiAction("save_thing", `${url}/api/old`, "POST"), risk: "write" as const };
      const { client, server } = await connect({
        session: fast(),
        graph: graphOf(url, [old]),
        onStale: (a, reason) => stale.push(`${a.actionId}: ${reason}`),
      });
      const r = text(await client.callTool({ name: "save_thing", arguments: {} }));
      expect(r.body).toMatchObject({ error: "ENDPOINT_CHANGED" });
      expect(stale).toEqual(["save_thing: the app no longer accepts this method here"]);

      const changed = new Promise<void>((resolve) =>
        client.setNotificationHandler(ToolListChangedNotificationSchema, () => resolve()),
      );
      server.setGraph(graphOf(url, [apiAction("get_profile", `${url}/api/profile`)]));
      await changed;
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(["get_profile", "read_page"]);
    } finally {
      await close();
    }
  });

  it("notes when a reply loses fields it used to have", async () => {
    let plan = true;
    const app = express();
    app.get("/api/profile", (_req, res) => res.json(plan ? { name: "Ada", plan: "pro" } : { name: "Ada" }));
    const { url, close } = await serve(app);
    try {
      const { client } = await connect({ session: fast(), graph: graphOf(url, [apiAction("get_profile", `${url}/api/profile`)]) });
      await client.callTool({ name: "get_profile", arguments: {} });
      plan = false;
      const r = text(await client.callTool({ name: "get_profile", arguments: {} }));
      expect(r.note).toContain("reply no longer has: plan");
    } finally {
      await close();
    }
  });
});

describe("being a polite client", () => {
  it("spaces requests out to the configured rate", async () => {
    const app = express();
    app.get("/", (_req, res) => res.send("ok"));
    const { url, close } = await serve(app);
    try {
      const session = new Session({ ratePerSecond: 20 });
      const started = Date.now();
      await Promise.all(Array.from({ length: 5 }, () => session.request(url)));
      expect(Date.now() - started).toBeGreaterThanOrEqual(190);
    } finally {
      await close();
    }
  });

  it("waits as told by Retry-After and tries once more", async () => {
    let calls = 0;
    const app = express();
    app.get("/", (_req, res) => {
      calls++;
      if (calls === 1) return res.status(429).set("retry-after", "0").send("slow down");
      return res.send("ok");
    });
    const { url, close } = await serve(app);
    try {
      const r = await fast().request(url);
      expect(r.status).toBe(200);
      expect(calls).toBe(2);
    } finally {
      await close();
    }
  });
});

describe("probing for specs", () => {
  it("doesn't request spec locations robots.txt disallows", async () => {
    const hits: string[] = [];
    const app = express();
    app.use((req, _res, next) => {
      hits.push(req.path);
      next();
    });
    app.get("/robots.txt", (_req, res) => res.type("text").send("User-agent: *\nDisallow: /api/"));
    app.get("/", (_req, res) => res.type("html").send("<p>hi</p>"));
    const { url, close } = await serve(app);
    try {
      await discover(fast(), url, { blockList: createBlockList() });
      expect(hits.filter((p) => p.startsWith("/api/"))).toEqual([]);
      expect(hits).toContain("/openapi.json");
    } finally {
      await close();
    }
  });
});

describe("modern frontends", () => {
  it("reads the sitemap first, flags JavaScript forms, lists Server Actions, and hides session endpoints", async () => {
    const app = express();
    app.get("/robots.txt", (_req, res) => res.type("text").send("User-agent: *\nAllow: /\nSitemap: /sitemap.xml"));
    app.get("/sitemap.xml", (req, res) =>
      res.type("xml").send(`<urlset><url><loc>http://${req.headers.host}/contact</loc></url></urlset>`),
    );
    app.get("/", (_req, res) => res.type("html").send('<script src="/app.js"></script><p>home, no links</p>'));
    app.get("/contact", (_req, res) =>
      res.type("html").send('<form><input name="email"><textarea name="message"></textarea><button>Send</button></form>'),
    );
    app.get("/app.js", (_req, res) =>
      res
        .type("js")
        .send(
          'let x=(0,m.createServerReference)("60dec564a4f3572debed8cd2ef5b0b377cc3250406",m.callServer,void 0,m.findSourceMapURL,"submitContactForm");' +
            'async function signOut(){return fetch("/api/auth/logout",{method:"POST"})}' +
            'async function loadMe(){return fetch("/api/auth/me")}',
        ),
    );
    const { url, close } = await serve(app);
    try {
      const { graph } = await discover(fast(), url, { blockList: createBlockList() });
      expect(graph.pages).toContain("/contact");
      expect(graph.actions.find((a) => a.target.kind === "form")).toBeUndefined();
      expect(graph.unresolved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "js-form", where: "/contact", fields: ["email", "message"] }),
          expect.objectContaining({ kind: "server-action", name: "submitContactForm" }),
        ]),
      );
      const byPath = Object.fromEntries(graph.actions.map((a) => [`${a.method} ${a.path}`, a.relayAccess]));
      expect(byPath["POST /api/auth/logout"]).toBe("denied");
      expect(byPath["GET /api/auth/me"]).toBe("allowed");
    } finally {
      await close();
    }
  });
});

describe("struggling sites", () => {
  it("slows down on a 503 and reads the page again at the end", async () => {
    let attempts = 0;
    const app = express();
    app.get("/", (_req, res) => res.type("html").send('<a href="/busy">busy</a><a href="/calm">calm</a>'));
    app.get("/busy", (_req, res) => {
      attempts++;
      if (attempts === 1) return res.status(503).json({ error: "worker exceeded resource limits" });
      return res.type("html").send("<p>ok now</p>");
    });
    app.get("/calm", (_req, res) => res.type("html").send("<p>calm</p>"));
    const { url, close } = await serve(app);
    try {
      const session = new Session({ ratePerSecond: 1000 });
      const { graph } = await discover(session, url, { blockList: createBlockList() });
      expect(attempts).toBe(2);
      expect(graph.pages).toEqual(["/", "/calm", "/busy"]);
      expect(session.requestsPerSecond).toBeLessThanOrEqual(2);
    } finally {
      await close();
    }
  }, 15_000);
});

describe("a site that is down", () => {
  it("stops after three server errors in a row instead of working through the whole sitemap", async () => {
    let hits = 0;
    const app = express();
    app.get("/sitemap.xml", (req, res) =>
      res.type("xml").send(
        `<urlset>${Array.from({ length: 200 }, (_, i) => `<url><loc>http://${req.headers.host}/p${i}</loc></url>`).join("")}</urlset>`,
      ),
    );
    app.get("/", (_req, res) => res.type("html").send("<p>home</p>"));
    app.get(/^\/p\d+$/, (_req, res) => {
      hits++;
      res.status(503).json({ error: "down" });
    });
    const { url, close } = await serve(app);
    try {
      await discover(new Session({ ratePerSecond: 1000 }), url, { blockList: createBlockList() });
      expect(hits).toBe(3);
    } finally {
      await close();
    }
  }, 30_000);
});
