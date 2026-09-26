import { describe as describeRelay } from "@relay/core";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { middleware } from "../src/middleware.js";

const KEY = "test-signing-key-32-bytes-or-longer-for-hs256";

/** An app with its own (toy) login: the `user` cookie says who is signed in. */
function buildApp() {
  const app = express();
  app.use(express.json());
  const userOf = (req: Request) => /(?:^|;\s*)user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];

  app.use(
    middleware({
      appName: "Notes",
      signingKey: KEY,
      connect: { loginUrl: "/login" },
      identify: (req) => userOf(req),
    }),
  );

  const notes: Record<string, string[]> = { ada: ["buy milk"], bob: ["secret plans"] };
  app.get(
    "/notes",
    describeRelay(
      (req: Request, res: Response) => {
        // An agent acts for the person who approved it; a browser for whoever is signed in.
        const user = req.relay?.subject ?? userOf(req) ?? "";
        res.relayRespond({ notes: notes[user] ?? [] });
      },
      { actionId: "list_notes", label: "List your notes", returns: { notes: { type: "array" } } },
    ),
  );
  app.post(
    "/notes",
    describeRelay(
      (req: Request, res: Response) => {
        const user = req.relay?.subject ?? "";
        (notes[user] ??= []).push(String(req.body.text));
        res.relayRespond({ ok: true });
      },
      { actionId: "add_note", label: "Add a note", inputs: { text: { type: "string", required: true } }, returns: { ok: { type: "boolean" } } },
    ),
  );
  return app;
}

describe("connecting an agent to a person's account", () => {
  it("runs code → sign-in → consent → token, and the agent acts as that person", async () => {
    const app = buildApp();
    const agent = request(app);

    const wellKnown = await agent.get("/.well-known/relay.json");
    expect(wellKnown.body).toMatchObject({ agents: "allow", connect: "/relay/connect" });

    const started = await agent.post("/relay/connect").send({ agentName: "Claude", scope: ["list_notes"] });
    const { device_code, user_code, verification_uri_complete } = started.body as Record<string, string>;
    expect(verification_uri_complete).toMatch(/\/relay\/approve\?code=[A-Z]{4}-[A-Z]{4}$/);

    // Signed out: the site's own login page comes first.
    const signedOut = await agent.get(`/relay/approve?code=${user_code}`);
    expect(signedOut.status).toBe(302);
    expect(signedOut.headers["location"]).toContain("/login?returnTo=");

    // Signed in as ada: the consent page, which can't be framed.
    const page = await agent.get(`/relay/approve?code=${user_code}`).set("Cookie", "user=ada");
    expect(page.status).toBe(200);
    expect(page.headers["x-frame-options"]).toBe("DENY");
    expect(page.text).toContain("List your notes");
    const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)?.[1] ?? "";

    const approved = await agent
      .post("/relay/approve")
      .set("Cookie", "user=ada")
      .type("form")
      .send(`code=${user_code}&csrf=${encodeURIComponent(csrf)}&decision=approve&scope=list_notes`);
    expect(approved.text).toContain("Connected");

    const tokenRes = await agent.post("/relay/connect/token").send({ device_code });
    const token = tokenRes.body.access_token as string;
    expect(tokenRes.body).toMatchObject({ token_type: "Bearer", scope: "list_notes" });

    const listed = await agent.post("/relay/act/list_notes").set("Authorization", `Bearer ${token}`).send({});
    expect(listed.body).toEqual({ notes: ["buy milk"] });

    // Not granted, so refused — and without a token nothing works at all.
    const add = await agent.post("/relay/act/add_note").set("Authorization", `Bearer ${token}`).send({ text: "x" });
    expect(add.status).toBe(403);
    expect((await agent.post("/relay/act/list_notes").send({})).status).toBe(401);

    // Ada sees the connection and revokes it.
    const conns = await agent.get("/relay/connections").set("Cookie", "user=ada");
    const id = conns.body.connections[0].id as string;
    await agent.post(`/relay/connections/${id}/revoke`).set("Cookie", "user=ada").send({});
    const after = await agent.post("/relay/act/list_notes").set("Authorization", `Bearer ${token}`).send({});
    expect(after.status).toBe(401);
  });

  it("refuses to start without identify", () => {
    expect(() => middleware({ appName: "x", signingKey: KEY, connect: {} })).toThrow(/identify/);
  });
});
