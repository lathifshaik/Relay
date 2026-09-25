import type { IOField } from "@relay/core";
import { validateInput } from "@relay/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { type ActionResult, readPage, runAction } from "./execute.js";
import type { Session } from "./session.js";
import type { BridgeAction, BridgeGraph } from "./types.js";

export interface BridgeServerOptions {
  session: Session;
  graph: BridgeGraph;
  /** Only expose actions that read (GET). */
  readOnly?: boolean;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const READ_PAGE = "read_page";

export function exposedActions(graph: BridgeGraph, readOnly = false): BridgeAction[] {
  return graph.actions.filter((a) => a.relayAccess !== "denied" && (!readOnly || a.method === "GET"));
}

export function createBridgeServer(opts: BridgeServerOptions): Server {
  const actions = new Map(exposedActions(opts.graph, opts.readOnly).map((a) => [a.actionId, a]));
  const server = new Server({ name: `relay-bridge:${opts.graph.appName}`, version: "0.1.0" }, { capabilities: { tools: {} } });

  const tools: Tool[] = [
    ...[...actions.values()].map((a) => ({
      name: a.actionId,
      description: [a.label, a.description].filter(Boolean).join(". "),
      inputSchema: objectSchema(a.inputs),
    })),
    {
      name: READ_PAGE,
      description: `Read a page of ${opts.graph.baseUrl} as plain text with its links. Use it to look things up that no other tool covers.`,
      inputSchema: {
        type: "object",
        properties: { path: { type: "string", description: 'Path on the site, e.g. "/orders"' } },
        required: ["path"],
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (req.params.name === READ_PAGE) {
        const path = typeof args["path"] === "string" ? args["path"] : "/";
        const url = new URL(path, opts.graph.baseUrl);
        if (url.origin !== new URL(opts.graph.baseUrl).origin) return errorResult("read_page only reads this site");
        return toolResult(await readPage(opts.session, url.toString()));
      }
      const action = actions.get(req.params.name);
      if (!action) return errorResult(`Unknown tool: ${req.params.name}`);
      const validation = validateInput(action.inputs, args);
      if (!validation.ok) return errorResult(JSON.stringify(validation.error, null, 2));
      return toolResult(await runAction(opts.session, action, validation.value));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}

export async function runBridgeServer(opts: BridgeServerOptions): Promise<void> {
  await createBridgeServer(opts).connect(new StdioServerTransport());
}

function toolResult(result: ActionResult) {
  const text = JSON.stringify({ status: result.status, body: result.body }, null, 2);
  return { content: [{ type: "text" as const, text }], ...(result.status >= 400 && { isError: true }) };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function objectSchema(fields: Record<string, IOField>): Record<string, unknown> {
  const required = Object.entries(fields).filter(([, f]) => f.required).map(([k]) => k);
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, jsonSchema(f)])),
    ...(required.length > 0 && { required }),
  };
}

function jsonSchema(f: IOField): Record<string, unknown> {
  const base = f.description ? { description: f.description } : {};
  switch (f.type) {
    case "enum":
      return { type: "string", enum: f.enum ?? [], ...base };
    case "array":
      return { type: "array", ...(f.items && { items: jsonSchema(f.items) }), ...base };
    case "object":
      return f.properties ? { ...objectSchema(f.properties), ...base } : { type: "object", ...base };
    case "string":
      return {
        type: "string",
        ...(f.min !== undefined && { minLength: f.min }),
        ...(f.max !== undefined && { maxLength: f.max }),
        ...base,
      };
    default:
      return {
        type: f.type,
        ...(f.min !== undefined && { minimum: f.min }),
        ...(f.max !== undefined && { maximum: f.max }),
        ...base,
      };
  }
}
