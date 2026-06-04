import { describe as relayDescribe, issueToken } from "@relay/core";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountRelay } from "../src/mount.js";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

function buildTodoApp(opts: Parameters<typeof mountRelay>[1] = { appName: "hono-todo" }) {
  const todos: Todo[] = [];
  const app = new Hono();

  app.get(
    "/todos",
    relayDescribe(
      (c) => c.json({ todos }),
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
      async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const title = String(body?.title ?? "");
        if (!title) return c.json({ error: "title required" }, 400);
        const todo: Todo = { id: `t_${todos.length + 1}`, title, done: false };
        todos.push(todo);
        return c.json(todo, 201);
      },
      {
        actionId: "create_todo",
        inputs: { title: { type: "string", required: true, min: 1, max: 200 } },
        returns: {
          id: { type: "string" },
          title: { type: "string" },
          done: { type: "boolean" },
        },
      },
    ),
  );

  app.patch(
    "/todos/:id",
    relayDescribe(
      async (c) => {
        const id = c.req.param("id");
        const todo = todos.find((t) => t.id === id);
        if (!todo) return c.json({ error: "not found" }, 404);
        const body = (await c.req.json().catch(() => ({}))) as {
          done?: boolean;
          title?: string;
        };
        if (typeof body.done === "boolean") todo.done = body.done;
        if (typeof body.title === "string") todo.title = body.title;
        return c.json(todo);
      },
      {
        actionId: "update_todo",
        inputs: {
          id: { type: "string", required: true },
          title: { type: "string" },
          done: { type: "boolean" },
        },
        returns: {
          id: { type: "string" },
          title: { type: "string" },
          done: { type: "boolean" },
        },
      },
    ),
  );

  mountRelay(app, opts);
  return { app, todos };
}

async function fetchJson(
  app: Hono,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // raw text
  }
  return { status: res.status, body };
}

describe("GET /relay/manifest", () => {
  it("discovers annotated routes via app.routes", async () => {
    const { app } = buildTodoApp();
    const r = await fetchJson(app, "/relay/manifest");
    expect(r.status).toBe(200);
    const body = r.body as { actions: Array<{ actionId: string }>; appName: string };
    expect(body.appName).toBe("hono-todo");
    const ids = body.actions.map((a) => a.actionId).sort();
    expect(ids).toEqual(["create_todo", "list_todos", "update_todo"]);
  });
});

describe("POST /relay/act/:actionId", () => {
  it("validates and invokes the original handler via app.fetch", async () => {
    const { app, todos } = buildTodoApp();
    const r = await fetchJson(app, "/relay/act/create_todo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { title: "hono" } }),
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: "t_1", title: "hono", done: false });
    expect(todos).toHaveLength(1);
  });

  it("substitutes URL params from validated inputs", async () => {
    const { app } = buildTodoApp();
    await fetchJson(app, "/relay/act/create_todo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { title: "first" } }),
    });
    const r = await fetchJson(app, "/relay/act/update_todo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { id: "t_1", done: true } }),
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: "t_1", title: "first", done: true });
  });

  it("returns 400 RELAY_VALIDATION_FAILED for bad input", async () => {
    const { app } = buildTodoApp();
    const r = await fetchJson(app, "/relay/act/create_todo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs: { title: "" } }),
    });
    expect(r.status).toBe(400);
    const body = r.body as { error: string; field: string };
    expect(body.error).toBe("RELAY_VALIDATION_FAILED");
    expect(body.field).toBe("title");
  });

  it("returns 404 for unknown action", async () => {
    const { app } = buildTodoApp();
    const r = await fetchJson(app, "/relay/act/nope", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(r.status).toBe(404);
  });
});

describe("POST /relay/validate", () => {
  it("validates without invoking the handler", async () => {
    const { app, todos } = buildTodoApp();
    const before = todos.length;
    const r = await fetchJson(app, "/relay/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actionId: "create_todo", inputs: { title: "x" } }),
    });
    expect(r.status).toBe(200);
    expect((r.body as { ok: boolean }).ok).toBe(true);
    expect(todos.length).toBe(before);
  });
});

describe("GET /relay/state", () => {
  it("delegates to buildState", async () => {
    const { app } = buildTodoApp({
      appName: "x",
      buildState: () => ({ user: "alice", step: 4 }),
    });
    const r = await fetchJson(app, "/relay/state");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ user: "alice", step: 4 });
  });
});

describe("Authentication", () => {
  const KEY = "test-signing-key-32-chars-or-longer";

  it("rejects manifest without a token", async () => {
    const { app } = buildTodoApp({ appName: "auth", signingKey: KEY });
    const r = await fetchJson(app, "/relay/manifest");
    expect(r.status).toBe(401);
  });

  it("accepts a valid token", async () => {
    const { app } = buildTodoApp({ appName: "auth", signingKey: KEY });
    const token = issueToken({ subject: "agent", scope: ["*"], signingKey: KEY });
    const r = await fetchJson(app, "/relay/manifest", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
  });
});

describe("Non-relay routes pass through", () => {
  it("normal Hono routes still work alongside Relay", async () => {
    const { app } = buildTodoApp();
    const r = await fetchJson(app, "/todos");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ todos: [] });
  });
});
