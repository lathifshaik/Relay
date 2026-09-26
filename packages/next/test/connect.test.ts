import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { defineAction } from "../src/define-action.js";
import { createRelayHandler } from "../src/relay-handler.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

const whoAmI = defineAction({
  actionId: "who_am_i",
  method: "GET",
  path: "/api/me",
  label: "Who am I",
  inputs: {},
  returns: { user: { type: "string" } },
  handler: (_inputs, ctx) => ({ user: ctx.agent?.subject ?? "nobody" }),
});

const handler = createRelayHandler({
  appName: "Next app",
  signingKey: KEY,
  actions: [whoAmI],
  connect: { loginUrl: "/sign-in" },
  identify: (req) => req.cookies.get("user")?.value,
});

const call = (path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  handler(new NextRequest(`http://localhost${path}`, init));

describe("@relay/next connect", () => {
  it("connects an agent that then acts as the approving user", async () => {
    const started = (await (
      await call("/relay/connect", { method: "POST", body: JSON.stringify({ agentName: "Claude" }), headers: { "content-type": "application/json" } })
    ).json()) as Record<string, string>;

    const signedOut = await call(`/relay/approve?code=${started["user_code"]}`);
    expect(signedOut.status).toBe(302);
    expect(signedOut.headers.get("location")).toContain("/sign-in?returnTo=");

    const page = await call(`/relay/approve?code=${started["user_code"]}`, { headers: { cookie: "user=grace" } });
    expect(page.headers.get("content-type")).toContain("text/html");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? "";

    await call("/relay/approve", {
      method: "POST",
      headers: { cookie: "user=grace", "content-type": "application/x-www-form-urlencoded" },
      body: `code=${started["user_code"]}&csrf=${encodeURIComponent(csrf)}&decision=approve&scope=who_am_i`,
    });
    const token = (await (
      await call("/relay/connect/token", { method: "POST", body: JSON.stringify({ device_code: started["device_code"] }), headers: { "content-type": "application/json" } })
    ).json()) as { access_token: string };

    const res = await call("/relay/act/who_am_i", {
      method: "POST",
      body: "{}",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ user: "grace" });
  });
});
