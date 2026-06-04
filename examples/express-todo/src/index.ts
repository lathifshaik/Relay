import { describe as relayDescribe, middleware as relay } from "@relay/express";
import express from "express";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

const todos: Todo[] = [];

const app = express();
app.use(express.json());
app.use(
  relay({
    appName: "express-todo",
    appVersion: "0.1.0",
    // Dev mode: no token required. Set RELAY_SIGNING_KEY in production.
    ...(process.env.RELAY_SIGNING_KEY && { signingKey: process.env.RELAY_SIGNING_KEY }),
  }),
);

app.get(
  "/todos",
  relayDescribe(
    (_req, res) => {
      res.relayRespond({ todos });
    },
    {
      actionId: "list_todos",
      label: "List all todos",
      description: "Returns every todo in the in-memory store.",
      inputs: {},
      returns: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              done: { type: "boolean" },
            },
          },
        },
      },
    },
  ),
);

app.post(
  "/todos",
  relayDescribe(
    (req, res) => {
      const title = typeof req.body?.title === "string" ? req.body.title : "";
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
      description: "Adds a new todo to the list.",
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
    (req, res) => {
      const todo = todos.find((t) => t.id === req.params.id);
      if (!todo) {
        res.status(404).json({ error: "not found" });
        return;
      }
      if (typeof req.body?.done === "boolean") todo.done = req.body.done;
      if (typeof req.body?.title === "string") todo.title = req.body.title;
      res.relayRespond(todo);
    },
    {
      actionId: "update_todo",
      label: "Update a todo",
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

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`express-todo listening on http://localhost:${port}`);
  console.log(`  GET  http://localhost:${port}/relay/manifest`);
  console.log(`  POST http://localhost:${port}/relay/act/create_todo  body: { "inputs": { "title": "..." } }`);
});
