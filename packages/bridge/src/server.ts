import type { IOField } from "@relay/core";
import { validateInput } from "@relay/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Bridge, type BridgeOptions, type BridgeReply } from "./bridge.js";
import { callMethodOf } from "./execute.js";
import type { BridgeAction, BridgeGraph } from "./types.js";

export interface BridgeServerOptions extends BridgeOptions {
  /** Only expose actions that read (GET). */
  readOnly?: boolean;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const READ_PAGE = "read_page";
const FULL_ARG = "_full";
const FULL_SCHEMA = {
  type: "boolean",
  description: "Return the whole response. By default a repeat read returns only what changed since your last call.",
};

export function exposedActions(graph: BridgeGraph, readOnly = false): BridgeAction[] {
  return graph.actions.filter((a) => a.relayAccess !== "denied" && (!readOnly || a.method === "GET"));
}

export function createBridgeServer(opts: BridgeServerOptions): Server {
  const actions = new Map(exposedActions(opts.graph, opts.readOnly).map((a) => [a.actionId, a]));
  const server = new Server(
    { name: `relay-bridge:${opts.graph.appName}`, version: "0.1.0" },
    { capabilities: { tools: {}, logging: {} } },
  );
  // Each request is reported to the client as a log message too, so what the
  // bridge is reading shows up next to the tool calls.
  const bridge = new Bridge({
    ...opts,
    log: (line) => {
      opts.log?.(line);
      server.sendLoggingMessage({ level: "info", logger: "relay-bridge", data: line }).catch(() => undefined);
    },
  });

  const tools: Tool[] = [
    ...[...actions.values()].map((a) => ({
      name: a.actionId,
      description: [a.label, a.description].filter(Boolean).join(". "),
      inputSchema: withFull(objectSchema(a.inputs), callMethodOf(a) === "GET"),
    })),
    {
      name: READ_PAGE,
      description: `Read a page of ${opts.graph.baseUrl} as plain text with its links. Use it to look things up that no other tool covers.`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: 'Path on the site, e.g. "/orders"' },
          [FULL_ARG]: FULL_SCHEMA,
        },
        required: ["path"],
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { [FULL_ARG]: fullArg, ...args } = (req.params.arguments ?? {}) as Record<string, unknown>;
    const full = fullArg === true;
    try {
      if (req.params.name === READ_PAGE) {
        const path = typeof args["path"] === "string" ? args["path"] : "/";
        const url = new URL(path, opts.graph.baseUrl);
        if (url.origin !== new URL(opts.graph.baseUrl).origin) return errorResult("read_page only reads this site");
        return toolResult(await bridge.read(url.toString(), full));
      }
      const action = actions.get(req.params.name);
      if (!action) return errorResult(`Unknown tool: ${req.params.name}`);
      const validation = validateInput(action.inputs, args);
      if (!validation.ok) return errorResult(JSON.stringify(validation.error, null, 2));
      return toolResult(await bridge.act(action, validation.value, full));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}

export async function runBridgeServer(opts: BridgeServerOptions): Promise<void> {
  await createBridgeServer(opts).connect(new StdioServerTransport());
}

function toolResult(result: BridgeReply) {
  // Compact JSON: indentation costs tokens and the agent doesn't need it.
  const text = JSON.stringify(result);
  return { content: [{ type: "text" as const, text }], ...(result.status >= 400 && { isError: true }) };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function withFull(schema: Record<string, unknown>, isRead: boolean): Record<string, unknown> {
  if (!isRead) return schema;
  return { ...schema, properties: { ...(schema["properties"] as object), [FULL_ARG]: FULL_SCHEMA } };
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
