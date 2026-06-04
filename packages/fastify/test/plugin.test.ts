import { describe as relayDescribe, issueToken } from "@relay/core";
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { relayPlugin } from "../src/index.js";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

async function buildTodoApp(opts: Parameters<typeof relayPlugin>[1] = { appName: "fastify-todo" }) {
  const app = Fastify({ logger: false });
  const todos: Todo[] = [];

  await app.register(relayPlugin, opts);

  app.get(
    "/todos",
    relayDescribe(
      async (_req, reply) => reply.send({ todos }),
      {
        actionId: "list_todos",
        label: "List todos",
        inputs: {},
        returns: { todos: { type: "array", items: { type: "object" } } },
      },
    ),
  );

  app.post<{ Body: { title?: string } }>(
    "/todos",
    relayDescribe(
      async (req, reply) => {
        const title = String(req.body?.title ?? "");
        if (!title) return reply.code(400).send({ error: "title required" });
        const todo: Todo = { id: `t_${todos.length + 1}`, title, done: false };
        todos.push(todo);
        return reply.code(201).send(todo);
      },
      {
        actionId: "create_todo",
        label: "Create a todo",
        inputs: { title: { type: "string", required: true, min: 1, max: 200 } },
        returns: {
          id: { type: "string" },
          title: { type: "string" },
          done: { type: "boolean" },
        },
      },
    ),
  );

  app.patch<{ Params: { id: string }; Body: { done?: boolean; title?: string } }>(
    "/todos/:id",
    relayDescribe(
      async (req, reply) => {
        const todo = todos.find((t) => t.id === req.params.id);
        if (!todo) return reply.code(404).send({ error: "not found" });
        if (typeof req.body?.done === "boolean") todo.done = req.body.done;
        if (typeof req.body?.title === "string") todo.title = req.body.title;
        return reply.send(todo);
      },
      {
        actionId: "update_todo",
        label: "Update todo",
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

  await app.ready();
  return { app, todos };
}

describe("GET /relay/manifest", () => {
  it("returns the Action Graph for routes discovered via onRoute hook", async () => {
    const { app } = await buildTodoApp();
    const r = await app.inject({ method: "GET", url: "/relay/manifest" });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.relayVersion).toBe("0.1");
    expect(body.appName).toBe("fastify-todo");
    const ids = body.actions.map((a: { actionId: string }) => a.actionId).sort();
    expect(ids).toEqual(["create_todo", "list_todos", "update_todo"]);
    await app.close();
  });
});

describe("POST /relay/act/:actionId — happy path", () => {
  it("validates, runs the handler via inject, projects output", async () => {
    const { app, todos } = await buildTodoApp();
    const r = await app.inject({
      method: "POST",
      url: "/relay/act/create_todo",
      payload: { inputs: { title: "fastify ftw" } },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ id: "t_1", title: "fastify ftw", done: false });
    expect(todos).toHaveLength(1);
    await app.close();
  });

  it("substitutes URL params from validated inputs", async () => {
    const { app } = await buildTodoApp();
    await app.inject({
      method: "POST",
      url: "/relay/act/create_todo",
      payload: { inputs: { title: "first" } },
    });
    const r = await app.inject({
      method: "POST",
      url: "/relay/act/update_todo",
      payload: { inputs: { id: "t_1", done: true } },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ id: "t_1", title: "first", done: true });
    await app.close();
  });
});

describe("POST /relay/act/:actionId — failure modes", () => {
  it("returns 400 RELAY_VALIDATION_FAILED for bad input", async () => {
    const { app } = await buildTodoApp();
    const r = await app.inject({
      method: "POST",
      url: "/relay/act/create_todo",
      payload: { inputs: { title: "" } },
    });
    expect(r.statusCode).toBe(400);
    const body = JSON.parse(r.body);
    expect(body.error).toBe("RELAY_VALIDATION_FAILED");
    expect(body.field).toBe("title");
    await app.close();
  });

  it("returns 404 for unknown action", async () => {
    const { app } = await buildTodoApp();
    const r = await app.inject({
      method: "POST",
      url: "/relay/act/nope",
      payload: {},
    });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /relay/validate", () => {
  it("validates without invoking the handler", async () => {
    const { app, todos } = await buildTodoApp();
    const before = todos.length;
    const r = await app.inject({
      method: "POST",
      url: "/relay/validate",
      payload: { actionId: "create_todo", inputs: { title: "x" } },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).ok).toBe(true);
    expect(todos.length).toBe(before);
    await app.close();
  });
});

describe("GET /relay/state", () => {
  it("delegates to buildState", async () => {
    const { app } = await buildTodoApp({
      appName: "x",
      buildState: () => ({ user: "alice", step: 3 }),
    });
    const r = await app.inject({ method: "GET", url: "/relay/state" });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ user: "alice", step: 3 });
    await app.close();
  });
});

describe("Authentication", () => {
  const KEY = "test-signing-key-32-chars-or-longer";
  let app: Awaited<ReturnType<typeof buildTodoApp>>["app"];

  beforeEach(async () => {
    const built = await buildTodoApp({ appName: "auth-test", signingKey: KEY });
    app = built.app;
  });

  it("rejects manifest without a token", async () => {
    const r = await app.inject({ method: "GET", url: "/relay/manifest" });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a valid token", async () => {
    const token = issueToken({ subject: "agent", scope: ["*"], signingKey: KEY });
    const r = await app.inject({
      method: "GET",
      url: "/relay/manifest",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it("rejects out-of-scope token on /relay/act", async () => {
    const token = issueToken({ subject: "agent", scope: ["list_todos"], signingKey: KEY });
    const r = await app.inject({
      method: "POST",
      url: "/relay/act/create_todo",
      headers: { authorization: `Bearer ${token}` },
      payload: { inputs: { title: "x" } },
    });
    expect(r.statusCode).toBe(403);
    await app.close();
  });
});

describe("Non-relay routes pass through", () => {
  it("normal Fastify routes still work alongside Relay", async () => {
    const { app } = await buildTodoApp();
    const r = await app.inject({ method: "GET", url: "/todos" });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ todos: [] });
    await app.close();
  });
});
