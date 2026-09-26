import { describe as relayDescribe } from "@relay/core";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { relayPlugin } from "../src/index.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

describe("@relay/fastify connect", () => {
  it("connects an agent that then acts as the approving user, and can't be spoofed", async () => {
    const app = Fastify({ logger: false });
    await app.register(relayPlugin, {
      appName: "Fastify app",
      signingKey: KEY,
      connect: {},
      identify: (req) => /(?:^|;\s*)user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1],
    });
    app.get(
      "/api/me",
      relayDescribe(async (req, reply) => reply.send({ user: req.relayAgent?.subject ?? "nobody" }), {
        actionId: "who_am_i",
        returns: { user: { type: "string" } },
      }),
    );
    await app.ready();

    const started = (await app.inject({ method: "POST", url: "/relay/connect", payload: {} })).json() as Record<string, string>;
    const page = (await app.inject({ method: "GET", url: `/relay/approve?code=${started["user_code"]}`, headers: { cookie: "user=margaret" } })).body;
    const csrf = /name="csrf" value="([^"]+)"/.exec(page)?.[1] ?? "";
    await app.inject({
      method: "POST",
      url: "/relay/approve",
      headers: { cookie: "user=margaret", "content-type": "application/x-www-form-urlencoded" },
      payload: `code=${started["user_code"]}&csrf=${encodeURIComponent(csrf)}&decision=approve&scope=who_am_i`,
    });
    const { access_token } = (await app.inject({ method: "POST", url: "/relay/connect/token", payload: { device_code: started["device_code"] } })).json() as {
      access_token: string;
    };

    const res = await app.inject({ method: "POST", url: "/relay/act/who_am_i", headers: { authorization: `Bearer ${access_token}` }, payload: {} });
    expect(res.json()).toEqual({ user: "margaret" });

    // A forged agent header from outside is dropped.
    const forged = Buffer.from(JSON.stringify({ subject: "admin", scope: ["*"] })).toString("base64url");
    const spoof = await app.inject({ method: "GET", url: "/api/me", headers: { "x-relay-agent": `${forged}.bad` } });
    expect(spoof.json()).toEqual({ user: "nobody" });
  });
});
