import { describe as relayDescribe } from "@relay/core";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import { getRelayAgent, mountRelay } from "../src/index.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

describe("@relay/hono connect", () => {
  it("connects an agent that then acts as the approving user", async () => {
    const app = new Hono();
    app.get(
      "/api/me",
      relayDescribe((c) => c.json({ user: getRelayAgent(c)?.subject ?? "nobody" }), {
        actionId: "who_am_i",
        returns: { user: { type: "string" } },
      }),
    );
    mountRelay(app, { appName: "Hono app", signingKey: KEY, connect: {}, identify: (c) => getCookie(c, "user") });
    const call = (path: string, init: RequestInit = {}) => app.fetch(new Request(`http://localhost${path}`, init));
    const json = { "content-type": "application/json" };

    const started = (await (await call("/relay/connect", { method: "POST", headers: json, body: "{}" })).json()) as Record<string, string>;
    expect((await call(`/relay/approve?code=${started["user_code"]}`)).status).toBe(401);

    const page = await (await call(`/relay/approve?code=${started["user_code"]}`, { headers: { cookie: "user=linus" } })).text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";
    await call("/relay/approve", {
      method: "POST",
      headers: { cookie: "user=linus", "content-type": "application/x-www-form-urlencoded" },
      body: `code=${started["user_code"]}&csrf=${encodeURIComponent(csrf)}&decision=approve&scope=who_am_i`,
    });
    const { access_token } = (await (
      await call("/relay/connect/token", { method: "POST", headers: json, body: JSON.stringify({ device_code: started["device_code"] }) })
    ).json()) as { access_token: string };

    const res = await call("/relay/act/who_am_i", { method: "POST", headers: { ...json, authorization: `Bearer ${access_token}` }, body: "{}" });
    expect(await res.json()).toEqual({ user: "linus" });
    // Calling the route directly never counts as an agent.
    expect(await (await call("/api/me")).json()).toEqual({ user: "nobody" });
  });
});
