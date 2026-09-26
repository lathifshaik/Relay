import { describe, expect, it } from "vitest";
import type { ActionGraph } from "../src/action-graph.js";
import { createBlockList } from "../src/block-list.js";
import { type ConnectRequest, handleConnectRoute, resolveConnect } from "../src/connect.js";
import { type EmitterContext, handleAct } from "../src/emitter.js";
import { MemoryTokenStore, verifyToken } from "../src/token.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

const graph: ActionGraph = {
  relayVersion: "0.1",
  appName: "Shop",
  generatedAt: "",
  actions: [
    { actionId: "list_orders", method: "GET", path: "/orders", label: "List orders", inputs: {}, returns: {}, relayAccess: "allowed" },
    { actionId: "place_order", method: "POST", path: "/orders", label: "Place an order", inputs: {}, returns: { ok: { type: "boolean" } }, relayAccess: "allowed" },
    { actionId: "nope", method: "POST", path: "/x", label: "Denied", inputs: {}, returns: {}, relayAccess: "denied" },
    { actionId: "admin_stuff", method: "POST", path: "/admin/x", label: "Admin", inputs: {}, returns: {}, relayAccess: "allowed" },
  ],
};

function setup(user: string | undefined = "user_1") {
  const tokenStore = new MemoryTokenStore();
  const ctx: EmitterContext = { graph, blockList: createBlockList(), signingKey: KEY, tokenStore };
  const connect = resolveConnect({ pollIntervalSeconds: 0 }, KEY, tokenStore);
  let signedIn = user;
  const route = (r: Partial<ConnectRequest> & { method: string; path: string }) =>
    handleConnectRoute(ctx, connect, {
      query: {},
      body: {},
      origin: "https://shop.test",
      identify: () => signedIn,
      ...r,
    });
  return { ctx, tokenStore, route, signIn: (u: string | undefined) => (signedIn = u) };
}

async function start(route: ReturnType<typeof setup>["route"], body: object = { agentName: "Claude" }) {
  const r = await route({ method: "POST", path: "/relay/connect", body });
  return r?.body as { device_code: string; user_code: string; verification_uri_complete: string };
}

function csrfFrom(html: string | undefined): string {
  return /name="csrf" value="([^"]+)"/.exec(html ?? "")?.[1] ?? "";
}

describe("agent connect flow", () => {
  it("advertises itself at /.well-known/relay.json", async () => {
    const { route } = setup();
    const r = await route({ method: "GET", path: "/.well-known/relay.json" });
    expect(r?.body).toMatchObject({ agents: "allow", manifest: "/relay/manifest", connect: "/relay/connect" });
  });

  it("goes from code to consent to a scoped token for the signed-in user", async () => {
    const { ctx, tokenStore, route } = setup();
    const started = await start(route);
    expect(started.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    expect(started.verification_uri_complete).toBe(`https://shop.test/relay/approve?code=${started.user_code}`);

    const pending = await route({ method: "POST", path: "/relay/connect/token", body: { device_code: started.device_code } });
    expect(pending?.body).toEqual({ error: "authorization_pending" });

    const consent = await route({ method: "GET", path: "/relay/approve", query: { code: started.user_code.toLowerCase() } });
    expect(consent?.status).toBe(200);
    expect(consent?.html).toContain("Claude");
    expect(consent?.html).toContain("name not verified");
    expect(consent?.html).not.toContain("admin_stuff");
    expect(consent?.headers?.["x-frame-options"]).toBe("DENY");

    // The person unticks "place an order".
    const approved = await route({
      method: "POST",
      path: "/relay/approve",
      body: { code: started.user_code, csrf: csrfFrom(consent?.html), decision: "approve", scope: ["list_orders"] },
    });
    expect(approved?.html).toContain("Connected");

    const done = await route({ method: "POST", path: "/relay/connect/token", body: { device_code: started.device_code } });
    const token = (done?.body as { access_token: string; scope: string }).access_token;
    expect(done?.body).toMatchObject({ token_type: "Bearer", scope: "list_orders" });

    const verified = await verifyToken(token, KEY, tokenStore);
    expect(verified).toMatchObject({ ok: true, claims: { sub: "user_1", scope: ["list_orders"] } });

    // The app's handler learns which user the agent acts for; ungranted actions are refused.
    let seenUser: string | undefined;
    await handleAct(ctx, { token, body: {} }, "list_orders", (_a, _i, c) => {
      seenUser = c.claims?.sub;
      return {};
    });
    expect(seenUser).toBe("user_1");
    expect((await handleAct(ctx, { token, body: {} }, "place_order", () => ({}))).status).toBe(403);

    // The token is handed over only once.
    const again = await route({ method: "POST", path: "/relay/connect/token", body: { device_code: started.device_code } });
    expect(again?.body).toEqual({ error: "invalid_grant" });
  });

  it("sends signed-out people to the app's login and back", async () => {
    const { ctx, tokenStore } = setup();
    const connect = resolveConnect({ loginUrl: "/login" }, KEY, tokenStore);
    const r = await handleConnectRoute(ctx, connect, {
      method: "GET",
      path: "/relay/approve",
      query: { code: "BCDF-GHJK" },
      body: {},
      origin: "https://shop.test",
      identify: () => undefined,
    });
    expect(r?.status).toBe(302);
    expect(r?.headers?.["location"]).toBe(`/login?returnTo=${encodeURIComponent("/relay/approve?code=BCDF-GHJK")}`);
  });

  it("refuses an approval without the right CSRF token, or from a different user", async () => {
    const { route, signIn } = setup();
    const started = await start(route);
    const consent = await route({ method: "GET", path: "/relay/approve", query: { code: started.user_code } });
    const forged = await route({
      method: "POST",
      path: "/relay/approve",
      body: { code: started.user_code, csrf: "forged", decision: "approve", scope: ["list_orders"] },
    });
    expect(forged?.status).toBe(403);

    signIn("user_2");
    const otherUser = await route({
      method: "POST",
      path: "/relay/approve",
      body: { code: started.user_code, csrf: csrfFrom(consent?.html), decision: "approve", scope: ["list_orders"] },
    });
    expect(otherUser?.status).toBe(403);
  });

  it("tells the agent when the person denies", async () => {
    const { route } = setup();
    const started = await start(route);
    const consent = await route({ method: "GET", path: "/relay/approve", query: { code: started.user_code } });
    await route({ method: "POST", path: "/relay/approve", body: { code: started.user_code, csrf: csrfFrom(consent?.html), decision: "deny" } });
    const r = await route({ method: "POST", path: "/relay/connect/token", body: { device_code: started.device_code } });
    expect(r?.body).toEqual({ error: "access_denied" });
  });

  it("never grants denied or blocked actions, even if asked", async () => {
    const { route } = setup();
    const r = await route({ method: "POST", path: "/relay/connect", body: { scope: ["nope", "admin_stuff"] } });
    expect(r?.body).toEqual({ error: "invalid_scope" });
  });

  it("asks agents that poll too fast to slow down", async () => {
    const tokenStore = new MemoryTokenStore();
    const ctx: EmitterContext = { graph, blockList: createBlockList(), signingKey: KEY, tokenStore };
    const connect = resolveConnect({ pollIntervalSeconds: 5 }, KEY, tokenStore);
    const req = (path: string, body: object) =>
      handleConnectRoute(ctx, connect, { method: "POST", path, query: {}, body, origin: "https://s", identify: () => "u" });
    const started = (await req("/relay/connect", {}))?.body as { device_code: string };
    expect((await req("/relay/connect/token", { device_code: started.device_code }))?.body).toEqual({ error: "authorization_pending" });
    expect((await req("/relay/connect/token", { device_code: started.device_code }))?.body).toEqual({ error: "slow_down" });
  });

  it("lets people list and revoke their agents", async () => {
    const { ctx, tokenStore, route } = setup();
    const started = await start(route);
    const consent = await route({ method: "GET", path: "/relay/approve", query: { code: started.user_code } });
    await route({
      method: "POST",
      path: "/relay/approve",
      body: { code: started.user_code, csrf: csrfFrom(consent?.html), decision: "approve", scope: ["list_orders", "place_order"] },
    });
    const token = ((await route({ method: "POST", path: "/relay/connect/token", body: { device_code: started.device_code } }))?.body as {
      access_token: string;
    }).access_token;

    const list = (await route({ method: "GET", path: "/relay/connections" }))?.body as { connections: Array<{ id: string; agentName: string }> };
    expect(list.connections).toHaveLength(1);
    const id = list.connections[0]?.id as string;

    const notJson = await route({ method: "POST", path: `/relay/connections/${id}/revoke` });
    expect(notJson?.status).toBe(415);
    const revoked = await route({ method: "POST", path: `/relay/connections/${id}/revoke`, contentType: "application/json" });
    expect(revoked?.body).toEqual({ revoked: true, id });
    expect((await handleAct(ctx, { token, body: {} }, "list_orders", () => ({})))).toMatchObject({ status: 401 });
    expect(await verifyToken(token, KEY, tokenStore)).toEqual({ ok: false, reason: "revoked" });
  });

  it("is off unless configured, and leaves other paths alone", async () => {
    const ctx: EmitterContext = { graph, blockList: createBlockList() };
    const base = { query: {}, body: {}, origin: "https://s", identify: () => undefined };
    expect((await handleConnectRoute(ctx, undefined, { ...base, method: "POST", path: "/relay/connect" }))?.status).toBe(404);
    expect(await handleConnectRoute(ctx, undefined, { ...base, method: "GET", path: "/relay/manifest" })).toBeUndefined();
  });
});
