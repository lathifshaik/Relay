import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  Callout,
  DocHeader,
  H2,
  H3,
  InlineCode,
  LI,
  P,
  StepList,
  UL,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = {
  title: "Docs · Relay",
  description: "Quickstart and reference for the Relay protocol.",
};

const EXPRESS_QUICKSTART = `import express from "express";
import { middleware, describe } from "@relay/express";

const app = express();
app.use(express.json());
app.use(middleware({ appName: "todo" }));

app.post(
  "/todos",
  describe(
    (req, res) => {
      const todo = { id: \`t_\${Date.now()}\`, title: req.body.title };
      res.relayRespond(todo);
    },
    {
      actionId: "create_todo",
      inputs: { title: { type: "string", required: true, min: 1 } },
      returns: { id: { type: "string" }, title: { type: "string" } },
    },
  ),
);

app.listen(3000);`;

const VERIFY = `# Manifest — Relay's typed action graph
$ curl http://localhost:3000/relay/manifest

# Call an action
$ curl -X POST http://localhost:3000/relay/act/create_todo \\
    -H "Content-Type: application/json" \\
    -d '{"inputs":{"title":"ship docs"}}'`;

export default function DocsOverview() {
  return (
    <>
      <DocHeader
        eyebrow="Getting Started"
        title="Welcome to Relay"
        lead="Drop-in middleware that auto-generates an MCP-compatible action interface from your existing Node.js routes. One install. Same handlers. Your app becomes agent-readable."
      />

      <H2 id="what-is-relay">What is Relay?</H2>
      <P>
        Relay is a thin protocol layer that sits behind your Express, Next.js, Fastify,
        or Hono routes. It introspects what your app can do and exposes a typed,
        machine-readable interface at four standard endpoints:
      </P>
      <UL>
        <LI>
          <InlineCode>GET /relay/manifest</InlineCode> — the full typed Action Graph.
        </LI>
        <LI>
          <InlineCode>POST /relay/act/:actionId</InlineCode> — execute a validated action.
        </LI>
        <LI>
          <InlineCode>POST /relay/validate</InlineCode> — dry-run an action call.
        </LI>
        <LI>
          <InlineCode>GET /relay/state</InlineCode> — session context for multi-step
          workflows.
        </LI>
      </UL>
      <P>
        Any MCP client — Claude, Cursor, Windsurf — can drive your app via{" "}
        <InlineCode>npx @relay/mcp</InlineCode>, which exposes Relay's protocol as native
        MCP tools.
      </P>

      <Callout kind="info" title="The pitch in one line">
        Writing an MCP server by hand takes 2–5 days per app. Relay does it in 5 minutes
        with zero configuration.
      </Callout>

      <H2 id="quickstart">Quickstart</H2>
      <P>Here's the canonical Express setup. The same shape applies to every adapter.</P>

      <StepList
        steps={[
          {
            title: "Install the core + your adapter",
            body: (
              <pre className="mt-3 inline-block rounded-md bg-[var(--color-bg-elev)] px-3 py-2 font-mono text-[13px] text-[var(--color-fg)]">
                npm install @relay/core @relay/express
              </pre>
            ),
          },
          {
            title: "Mount the middleware before your routes",
            body: (
              <span>
                The middleware needs to patch <InlineCode>res.relayRespond</InlineCode>{" "}
                before your handlers run.
              </span>
            ),
          },
          {
            title: "Annotate routes you want agents to see",
            body: (
              <span>
                Wrap each handler with{" "}
                <InlineCode>describe(handler, &lbrace; actionId, inputs, returns &rbrace;)</InlineCode>
                . Anything you don't annotate stays invisible to agents.
              </span>
            ),
          },
        ]}
      />

      <div className="mt-8">
        <CodeBlock
          filename="server.ts"
          language="ts"
          code={EXPRESS_QUICKSTART}
          highlightLines={[2, 6, 10]}
        />
      </div>

      <H3 id="verify">Verify it works</H3>
      <P>
        With the server running on <InlineCode>:3000</InlineCode>, curl the protocol
        endpoints directly.
      </P>
      <div className="mt-4">
        <CodeBlock filename="terminal" language="sh" code={VERIFY} />
      </div>

      <H2 id="point-claude">Point Claude at it</H2>
      <P>
        Drop this into your Claude Desktop config (
        <InlineCode>~/Library/Application Support/Claude/claude_desktop_config.json</InlineCode>
        ):
      </P>
      <div className="mt-4">
        <CodeBlock
          filename="claude_desktop_config.json"
          language="json"
          code={`{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "@relay/mcp"]
    }
  }
}`}
        />
      </div>
      <P>
        Claude now sees four tools: <InlineCode>relay_manifest</InlineCode>,{" "}
        <InlineCode>relay_act</InlineCode>, <InlineCode>relay_validate</InlineCode>, and{" "}
        <InlineCode>relay_state</InlineCode>. Ask it to drive your localhost app and it
        will read the manifest first, then call typed actions instead of scraping the
        DOM.
      </P>

      <H2 id="whats-next">What's next</H2>
      <UL>
        <LI>
          Pick your framework — <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/express">Express</a>,{" "}
          <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/next">Next.js</a>,{" "}
          <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/fastify">Fastify</a>, or{" "}
          <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/hono">Hono</a>.
        </LI>
        <LI>
          Read the <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/protocol">Action Graph spec</a> to
          see what's in the manifest.
        </LI>
        <LI>
          Lock down sensitive routes — see <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/security">Security</a> and{" "}
          <a className="text-[var(--color-accent-bright)] underline-offset-4 hover:underline" href="/docs/consent">Consent</a>.
        </LI>
      </UL>

      <PageNav pathname="/docs" />
    </>
  );
}
