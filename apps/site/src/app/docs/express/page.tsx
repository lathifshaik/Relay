import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  Callout,
  DocHeader,
  H2,
  InlineCode,
  LI,
  P,
  UL,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = { title: "Express · Relay docs" };

const INSTALL = `npm install @relay/core @relay/express`;

const SETUP = `import express from "express";
import { middleware, describe } from "@relay/express";

const app = express();
app.use(express.json());

// IMPORTANT: install Relay BEFORE your routes so res.relayRespond is patched.
app.use(middleware({
  appName: "todo",
  appVersion: "1.0.0",
}));

const todos: Array<{ id: string; title: string; done: boolean }> = [];

app.get(
  "/todos",
  describe(
    (_req, res) => res.relayRespond({ todos }),
    {
      actionId: "list_todos",
      label: "List todos",
      inputs: {},
      returns: { todos: { type: "array", items: { type: "object" } } },
    },
  ),
);

app.post(
  "/todos",
  describe(
    (req, res) => {
      const title = String(req.body?.title ?? "");
      const todo = { id: \`t_\${todos.length + 1}\`, title, done: false };
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
  ),
);

app.listen(3000);`;

const PARAMS = `app.patch(
  "/todos/:id",
  describe(
    (req, res) => {
      const todo = todos.find((t) => t.id === req.params.id);
      if (!todo) return res.status(404).json({ error: "not found" });
      if (typeof req.body?.done === "boolean") todo.done = req.body.done;
      res.relayRespond(todo);
    },
    {
      actionId: "update_todo",
      inputs: {
        id: { type: "string", required: true },    // URL param
        done: { type: "boolean" },
      },
      returns: { id: { type: "string" }, done: { type: "boolean" } },
    },
  ),
);`;

const AUTH = `app.use(middleware({
  appName: "todo",
  signingKey: process.env.RELAY_SIGNING_KEY,  // required in production
}));

// Issue tokens to your agents:
import { issueToken } from "@relay/core";
const token = issueToken({
  subject: "agent_1",
  scope: ["create_todo", "list_todos"],   // permitted actionIds, or ["*"]
  ttlSeconds: 3600,
  signingKey: process.env.RELAY_SIGNING_KEY!,
});`;

export default function ExpressDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Frameworks"
        title="Express"
        lead="Drop @relay/express into your Express app and walk away. Routes annotated with describe() show up in the Action Graph; everything else stays invisible to agents."
      />

      <H2 id="install">Install</H2>
      <div className="mt-4">
        <CodeBlock language="sh" code={INSTALL} />
      </div>

      <H2 id="setup">Setup</H2>
      <P>
        The middleware factory takes one config object. Mount it{" "}
        <em>before</em> your routes so it can patch{" "}
        <InlineCode>res.relayRespond</InlineCode> on every response.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={SETUP} highlightLines={[7, 8, 9, 10]} />
      </div>

      <Callout kind="warning" title="Middleware order matters">
        If you register routes before <InlineCode>app.use(middleware(...))</InlineCode>,
        calls to <InlineCode>res.relayRespond()</InlineCode> in those handlers will throw
        — the decorator hasn't been attached yet.
      </Callout>

      <H2 id="url-params">URL parameters</H2>
      <P>
        Declare URL placeholders as inputs in your action schema. When an agent calls{" "}
        <InlineCode>/relay/act/:actionId</InlineCode>, Relay substitutes those values
        into the route path before invoking your handler — so{" "}
        <InlineCode>req.params.id</InlineCode> works the same on both the human and
        agent code paths.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={PARAMS} highlightLines={[12]} />
      </div>

      <H2 id="describe">describe() reference</H2>
      <P>
        Every action defined inline alongside its handler. Required keys:
      </P>
      <UL>
        <LI>
          <InlineCode>actionId</InlineCode> — stable kebab/snake-case identifier (e.g.{" "}
          <InlineCode>create_todo</InlineCode>). What MCP clients pass to{" "}
          <InlineCode>relay_act</InlineCode>.
        </LI>
        <LI>
          <InlineCode>inputs</InlineCode> — map of input names to <InlineCode>IOField</InlineCode>{" "}
          definitions.
        </LI>
        <LI>
          <InlineCode>returns</InlineCode> — fields the agent receives. Anything not declared
          here is stripped by schema projection.
        </LI>
      </UL>
      <P>Optional:</P>
      <UL>
        <LI>
          <InlineCode>label</InlineCode> — short human-readable name.
        </LI>
        <LI>
          <InlineCode>description</InlineCode> — longer prose. Shown to agents to help them pick
          the right action.
        </LI>
        <LI>
          <InlineCode>relayAccess</InlineCode> — <InlineCode>"allowed"</InlineCode> (default),{" "}
          <InlineCode>"denied"</InlineCode>, or <InlineCode>"consent-required"</InlineCode>.
        </LI>
      </UL>

      <H2 id="auth">Auth + tokens</H2>
      <P>
        For local development Relay runs unauthenticated when no{" "}
        <InlineCode>signingKey</InlineCode> is set. In production, sign tokens with an HMAC
        key — same one you set in <InlineCode>middleware()</InlineCode>.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={AUTH} highlightLines={[3, 8]} />
      </div>
      <P>
        Agents authenticate by passing the token in the{" "}
        <InlineCode>Authorization: Bearer ...</InlineCode> header.
      </P>

      <PageNav pathname="/docs/express" />
    </>
  );
}
