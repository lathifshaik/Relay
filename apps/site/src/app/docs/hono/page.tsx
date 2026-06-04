import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  Callout,
  DocHeader,
  H2,
  InlineCode,
  P,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = { title: "Hono · Relay docs" };

const INSTALL = `npm install @relay/core @relay/hono`;

const SETUP = `import { Hono } from "hono";
import { mountRelay, describe } from "@relay/hono";

const app = new Hono();

app.post(
  "/todos",
  describe(
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const todo = { id: \`t_\${Date.now()}\`, title: body.title };
      return c.json(todo, 201);
    },
    {
      actionId: "create_todo",
      inputs: { title: { type: "string", required: true, min: 1 } },
      returns: { id: { type: "string" }, title: { type: "string" } },
    },
  ),
);

// Mount Relay AFTER registering your routes, so the route scanner sees them.
mountRelay(app, { appName: "todo", appVersion: "1.0.0" });

export default app;`;

export default function HonoDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Frameworks"
        title="Hono"
        lead="mountRelay(app, opts) walks app.routes, finds describe-annotated handlers, and attaches /relay/* routes to the same app instance."
      />

      <H2 id="install">Install</H2>
      <div className="mt-4">
        <CodeBlock language="sh" code={INSTALL} />
      </div>

      <H2 id="setup">Setup</H2>
      <P>
        Register your routes first, then call <InlineCode>mountRelay(app, opts)</InlineCode>{" "}
        to attach the Relay endpoints. The opposite of the Express pattern — Hono doesn't
        need to mutate a response object, so order is reversed.
      </P>
      <div className="mt-4">
        <CodeBlock filename="app.ts" language="ts" code={SETUP} highlightLines={[20, 21]} />
      </div>

      <Callout kind="info" title="Why the order?">
        Hono's <InlineCode>mountRelay</InlineCode> reads <InlineCode>app.routes</InlineCode>{" "}
        synchronously when it's called. Anything registered after won't be in the
        manifest until you call mountRelay again or restart the app.
      </Callout>

      <H2 id="invocation">How action invocation works</H2>
      <P>
        When an agent calls <InlineCode>/relay/act/:actionId</InlineCode>, Relay
        re-dispatches through <InlineCode>app.fetch(new Request(...))</InlineCode> — the
        same fetch handler that powers Hono's runtime portability (Node, Bun, Workers,
        Deno). The original handler runs through the standard pipeline and its JSON
        response is projected through the action's <InlineCode>returns</InlineCode>{" "}
        schema before reaching the agent.
      </P>

      <H2 id="runtimes">Runtime compatibility</H2>
      <P>
        @relay/hono works on every Hono-supported runtime: Node, Bun, Cloudflare
        Workers, Deno, AWS Lambda. The adapter uses only standard Web APIs (Request,
        Response, fetch).
      </P>

      <PageNav pathname="/docs/hono" />
    </>
  );
}
