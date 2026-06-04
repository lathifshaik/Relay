import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  Callout,
  DocHeader,
  H2,
  InlineCode,
  P,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = { title: "Fastify · Relay docs" };

const INSTALL = `npm install @relay/core @relay/fastify`;

const SETUP = `import Fastify from "fastify";
import { relayPlugin, describe } from "@relay/fastify";

const app = Fastify({ logger: true });

await app.register(relayPlugin, {
  appName: "todo",
  appVersion: "1.0.0",
});

app.post(
  "/todos",
  describe(
    async (req, reply) => {
      const todo = { id: \`t_\${Date.now()}\`, title: (req.body as any).title };
      return reply.status(201).send(todo);
    },
    {
      actionId: "create_todo",
      label: "Create a todo",
      inputs: { title: { type: "string", required: true, min: 1, max: 200 } },
      returns: {
        id: { type: "string" },
        title: { type: "string" },
      },
    },
  ),
);

await app.listen({ port: 3000 });`;

export default function FastifyDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Frameworks"
        title="Fastify"
        lead="@relay/fastify uses Fastify's onRoute hook to discover annotated routes, and fastify.inject to invoke handlers from /relay/act — no synthetic req/res shimming required."
      />

      <H2 id="install">Install</H2>
      <div className="mt-4">
        <CodeBlock language="sh" code={INSTALL} />
      </div>

      <H2 id="setup">Setup</H2>
      <P>
        Register the plugin. The <InlineCode>onRoute</InlineCode> hook fires for every
        subsequent route, so register Relay <em>before</em> defining your routes.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={SETUP} highlightLines={[6, 7, 8, 9]} />
      </div>

      <Callout kind="note" title="reply.relayRespond">
        Fastify uses Reply objects, not res. <InlineCode>reply.relayRespond(data)</InlineCode>{" "}
        is decorated onto every reply as an alias for{" "}
        <InlineCode>reply.send(data)</InlineCode> — same data, same projection through
        the schema.
      </Callout>

      <H2 id="invocation">How action invocation works</H2>
      <P>
        When an agent hits <InlineCode>/relay/act/:actionId</InlineCode>, the plugin uses
        Fastify's built-in <InlineCode>fastify.inject()</InlineCode> to make an internal
        HTTP-like request against the original route. The response body is then projected
        through the action's <InlineCode>returns</InlineCode> schema. This means your
        existing route handler runs exactly as it would for a real request — including
        plugins, hooks, and validation.
      </P>

      <H2 id="head-shadow">HEAD routes</H2>
      <P>
        Fastify auto-registers a HEAD route alongside every GET. Relay's route scanner
        deduplicates these by <InlineCode>actionId</InlineCode>, so a single GET action
        won't appear twice in the manifest.
      </P>

      <PageNav pathname="/docs/fastify" />
    </>
  );
}
