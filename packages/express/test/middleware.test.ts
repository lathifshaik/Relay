import { describe as describeRelay } from "@relay/core";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { middleware } from "../src/middleware.js";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

function buildTodoApp(opts: Parameters<typeof middleware>[0] = { appName: "express-todo-test" }) {
  const app = express();
  app.use(express.json());

  const todos: Todo[] = [];

  const listTodos = describeRelay(
    (req: Request, res: Response) => {
      res.relayRespond({ todos });
    },
    {
      actionId: "list_todos",
      label: "List todos",
      inputs: {},
      returns: { todos: { type: "array", items: { type: "object" } } },
    },
  );

  const createTodo = describeRelay(
    (req: Request, res: Response) => {
      const title = (req.body?.title as string) ?? "";
      if (!title) {
        res.status(400).json({ error: "title required" });
        return;
      }
      const todo: Todo = { id: `t_${todos.length + 1}`, title, done: false };
      todos.push(todo);
      res.status(201).relayRespond(todo);
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
  );

  // Install middleware BEFORE routes so res.relayRespond is patched on
  // every request, including non-/relay paths the user serves.
  app.use(middleware(opts));
  app.get("/todos", listTodos);
  app.post("/todos", createTodo);

  return app;
}

describe("GET /relay/manifest", () => {
  it("returns the Action Graph with discovered routes", async () => {
    const app = buildTodoApp();
    const r = await request(app).get("/relay/manifest");
    expect(r.status).toBe(200);
    expect(r.body.relayVersion).toBe("0.1");
    expect(r.body.appName).toBe("express-todo-test");
    expect(r.body.actions).toHaveLength(2);

    const ids = r.body.actions.map((a: { actionId: string }) => a.actionId).sort();
    expect(ids).toEqual(["create_todo", "list_todos"]);

    const create = r.body.actions.find((a: { actionId: string }) => a.actionId === "create_todo");
    expect(create.method).toBe("POST");
    expect(create.path).toBe("/todos");
    expect(create.inputs.title).toEqual({ type: "string", required: true, min: 1, max: 200 });
  });
});

describe("POST /relay/act/:actionId — happy path", () => {
  it("validates, invokes the original handler, projects output", async () => {
    const app = buildTodoApp();

    const r = await request(app)
      .post("/relay/act/create_todo")
      .send({ inputs: { title: "ship M2" } });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: "t_1", title: "ship M2", done: false });
  });

  it("persists across actions — second list reflects the first create", async () => {
    const app = buildTodoApp();

    await request(app).post("/relay/act/create_todo").send({ inputs: { title: "a" } });
    await request(app).post("/relay/act/create_todo").send({ inputs: { title: "b" } });

    const r = await request(app).post("/relay/act/list_todos").send({});
    expect(r.status).toBe(200);
    expect(r.body.todos).toHaveLength(2);
    expect(r.body.todos[0].title).toBe("a");
  });
});

describe("POST /relay/act/:actionId — failure modes", () => {
  it("returns 400 with structured error for bad input", async () => {
    const app = buildTodoApp();
    const r = await request(app)
      .post("/relay/act/create_todo")
      .send({ inputs: { title: 42 } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("RELAY_VALIDATION_FAILED");
    expect(r.body.field).toBe("title");
  });

  it("returns 404 for unknown action", async () => {
    const app = buildTodoApp();
    const r = await request(app).post("/relay/act/nope").send({});
    expect(r.status).toBe(404);
  });
});

describe("POST /relay/validate", () => {
  it("validates without invoking the handler", async () => {
    const handlerCalls: string[] = [];
    const app = express();
    app.use(express.json());
    const h = describeRelay(
      (_req: Request, res: Response) => {
        handlerCalls.push("called");
        res.relayRespond({ x: 1 });
      },
      { actionId: "do_thing", inputs: { name: { type: "string", required: true } }, returns: {} },
    );
    app.use(middleware({ appName: "x" }));
    app.post("/things", h);

    const r = await request(app)
      .post("/relay/validate")
      .send({ actionId: "do_thing", inputs: { name: "hi" } });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(handlerCalls).toHaveLength(0);
  });
});

describe("GET /relay/state", () => {
  it("delegates to buildState when provided", async () => {
    const app = buildTodoApp({
      appName: "test",
      buildState: () => ({ user: "alice", step: 7 }),
    });
    const r = await request(app).get("/relay/state");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ user: "alice", step: 7 });
  });

  it("returns empty object when no buildState configured", async () => {
    const app = buildTodoApp();
    const r = await request(app).get("/relay/state");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({});
  });
});

describe("Authentication", () => {
  let app: express.Express;
  const SIGNING_KEY = "test-signing-key-32-chars-or-longer";

  beforeEach(() => {
    app = buildTodoApp({ appName: "auth-test", signingKey: SIGNING_KEY });
  });

  it("rejects /relay/manifest without a token", async () => {
    const r = await request(app).get("/relay/manifest");
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("RELAY_UNAUTHENTICATED");
  });

  it("accepts a valid token", async () => {
    const { issueToken } = await import("@relay/core");
    const token = issueToken({
      subject: "agent_1",
      scope: ["*"],
      signingKey: SIGNING_KEY,
    });
    const r = await request(app)
      .get("/relay/manifest")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.actions).toHaveLength(2);
  });

  it("rejects a token outside its scope on /relay/act", async () => {
    const { issueToken } = await import("@relay/core");
    const token = issueToken({
      subject: "agent_1",
      scope: ["list_todos"],
      signingKey: SIGNING_KEY,
    });
    const r = await request(app)
      .post("/relay/act/create_todo")
      .set("Authorization", `Bearer ${token}`)
      .send({ inputs: { title: "x" } });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("RELAY_OUT_OF_SCOPE");
  });
});

describe("Path parameters via /relay/act", () => {
  it("populates req.params from validated inputs for routes with placeholders", async () => {
    const app = express();
    app.use(express.json());
    app.use(middleware({ appName: "params-test" }));

    const seen = { id: "" };
    const updater = describeRelay(
      (req: Request, res: Response) => {
        seen.id = req.params.id ?? "";
        res.relayRespond({ id: req.params.id, ok: true });
      },
      {
        actionId: "update_todo",
        inputs: {
          id: { type: "string", required: true },
          title: { type: "string" },
        },
        returns: { id: { type: "string" }, ok: { type: "boolean" } },
      },
    );
    app.patch("/todos/:id", updater);

    const r = await request(app)
      .post("/relay/act/update_todo")
      .send({ inputs: { id: "t_42", title: "renamed" } });
    expect(r.status).toBe(200);
    expect(seen.id).toBe("t_42");
    expect(r.body).toEqual({ id: "t_42", ok: true });
  });
});

describe("Non-relay paths pass through untouched", () => {
  it("normal Express routes still work", async () => {
    const app = buildTodoApp();
    const r = await request(app).get("/todos");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ todos: [] });
  });
});
