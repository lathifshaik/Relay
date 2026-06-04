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

export const metadata = { title: "MCP server · Relay docs" };

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "@relay/mcp"]
    }
  }
}`;

const WITH_TOKEN = `{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "@relay/mcp", "--token", "eyJhbGc..."]
    }
  }
}`;

const ENV_TOKEN = `{
  "mcpServers": {
    "relay": {
      "command": "npx",
      "args": ["-y", "@relay/mcp"],
      "env": { "RELAY_TOKEN": "eyJhbGc..." }
    }
  }
}`;

const TOOLS_EXAMPLE = `// What Claude sees after loading @relay/mcp:

relay_manifest({ url: "http://localhost:3000" })
  → ActionGraph (200-800 tokens of typed JSON)

relay_act({
  url: "http://localhost:3000",
  actionId: "create_todo",
  inputs: { title: "ship docs" }
})
  → Schema-projected response

relay_validate({
  url: "http://localhost:3000",
  actionId: "create_todo",
  inputs: { title: "" }
})
  → Structured RELAY_VALIDATION_FAILED, no handler invocation

relay_state({ url: "http://localhost:3000" })
  → Current session context for multi-step workflows`;

export default function McpDocs() {
  return (
    <>
      <DocHeader
        eyebrow="MCP"
        title="MCP server setup"
        lead="@relay/mcp is an MCP server that exposes Relay's protocol as four native tools — relay_manifest, relay_act, relay_validate, relay_state. Drop one config block in, point Claude at any Relay-enabled URL."
      />

      <H2 id="install">Add it to Claude Desktop</H2>
      <P>
        Open <InlineCode>~/Library/Application Support/Claude/claude_desktop_config.json</InlineCode>{" "}
        (macOS) or the equivalent on Windows/Linux, and add the <InlineCode>relay</InlineCode>{" "}
        server:
      </P>
      <div className="mt-4">
        <CodeBlock filename="claude_desktop_config.json" language="json" code={CLAUDE_CONFIG} />
      </div>
      <P>
        Restart Claude Desktop. The four <InlineCode>relay_*</InlineCode> tools will
        appear in the tool list.
      </P>

      <Callout kind="info" title="Other MCP clients">
        Same config shape works for Cursor, Windsurf, Continue, and any other MCP-aware
        agent. The transport is stdio-only in v0.1; SSE/HTTP transport is on the v0.2
        roadmap.
      </Callout>

      <H2 id="tokens">Authenticated mode</H2>
      <P>
        For production targets running with a <InlineCode>signingKey</InlineCode>, the
        MCP server needs the token. Pass it via CLI:
      </P>
      <div className="mt-4">
        <CodeBlock filename="claude_desktop_config.json" language="json" code={WITH_TOKEN} />
      </div>
      <P>Or via env var:</P>
      <div className="mt-4">
        <CodeBlock filename="claude_desktop_config.json" language="json" code={ENV_TOKEN} />
      </div>

      <H2 id="tools">The four tools</H2>
      <div className="mt-4">
        <CodeBlock filename="tools" language="ts" code={TOOLS_EXAMPLE} />
      </div>

      <H2 id="workflow">Recommended agent workflow</H2>
      <UL>
        <LI>
          Always call <InlineCode>relay_manifest</InlineCode> first. The graph is your
          read-only contract; you only need to fetch it once per session.
        </LI>
        <LI>
          When unsure about input shape, call <InlineCode>relay_validate</InlineCode> — it
          mirrors all of <InlineCode>relay_act</InlineCode>'s validation without
          invoking the handler.
        </LI>
        <LI>
          For multi-step workflows, read <InlineCode>relay_state</InlineCode> between
          actions to keep up with session changes.
        </LI>
      </UL>

      <H2 id="local-dev">Local development</H2>
      <P>
        If you're hacking on Relay itself, point the MCP server at your local build:
      </P>
      <div className="mt-4">
        <CodeBlock
          filename="claude_desktop_config.json"
          language="json"
          code={`{
  "mcpServers": {
    "relay": {
      "command": "node",
      "args": ["/Users/you/workspace/Relay/packages/mcp/dist/bin.js"]
    }
  }
}`}
        />
      </div>

      <PageNav pathname="/docs/mcp" />
    </>
  );
}
