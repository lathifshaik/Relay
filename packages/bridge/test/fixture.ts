import express from "express";
import type { AddressInfo } from "node:net";

/**
 * A small web app with no Relay middleware and no OpenAPI spec: an HTML page
 * with a script that calls its JSON API, a contact form with a CSRF field,
 * a logout link and an admin page. The API requires a session cookie.
 */
export async function startFixtureApp(): Promise<{ baseUrl: string; state: FixtureState; close: () => Promise<void> }> {
  const state: FixtureState = { orders: [{ id: 1, title: "Shoes", qty: 1 }], messages: [], loggedOut: false };
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  const authed = (req: express.Request) => (req.headers.cookie ?? "").includes("sid=abc");

  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html><html><head><title>Shop</title>
      <script src="/static/app.js"></script></head>
      <body><main><h1>Welcome to Shop</h1>
      <a href="/contact">Contact</a> <a href="/logout">Log out</a> <a href="/admin">Admin</a>
      <script>fetch("/api/profile")</script></main></body></html>`);
  });
  app.get("/static/app.js", (_req, res) => {
    res.type("js").send(
      'async function list(){return fetch("/api/orders")}' +
        "function one(id){return fetch(`/api/orders/${id}`)}" +
        'function add(t,q){return fetch("/api/orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:t,qty:q})})}',
    );
  });
  app.get("/contact", (_req, res) => {
    res.type("html").send(`<html><body><section><h2>Contact us</h2>
      <form method="post" action="/contact">
        <input type="hidden" name="csrf" value="tok123">
        <label for="m">Message</label><input id="m" name="message" required>
        <select name="topic"><option value="sales">Sales</option><option value="help">Help</option></select>
        <button type="submit">Send</button>
      </form></section></body></html>`);
  });
  app.post("/contact", (req, res) => {
    if (req.body.csrf !== "tok123") return res.status(403).send("bad csrf");
    state.messages.push({ message: req.body.message, topic: req.body.topic });
    res.type("html").send("<html><body><p>Thanks, we got your message.</p></body></html>");
  });
  app.get("/logout", (_req, res) => {
    state.loggedOut = true;
    res.send("bye");
  });
  app.get("/admin", (_req, res) => res.type("html").send('<form><input name="danger"></form>'));
  app.get("/api/profile", (req, res) => (authed(req) ? res.json({ name: "Ada" }) : res.status(401).json({})));
  app.get("/api/orders", (req, res) => (authed(req) ? res.json({ orders: state.orders }) : res.status(401).json({})));
  app.get("/api/orders/:id", (req, res) => {
    const order = state.orders.find((o) => String(o.id) === req.params.id);
    return order ? res.json(order) : res.status(404).json({ error: "not found" });
  });
  app.post("/api/orders", (req, res) => {
    if (!authed(req)) return res.status(401).json({});
    const order = { id: state.orders.length + 1, title: req.body.title, qty: Number(req.body.qty), secret: "sk_live_abcdefghijklmnopqrstuv" };
    state.orders.push(order);
    return res.status(201).json(order);
  });

  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export interface FixtureState {
  orders: Array<{ id: number; title: string; qty: number; secret?: string }>;
  messages: Array<{ message: string; topic: string }>;
  loggedOut: boolean;
}
