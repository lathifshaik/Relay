import type { IOField } from "@relay/core";
import { validateInput } from "@relay/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Bridge, type BridgeOptions, type BridgeReply } from "./bridge.js";
import { type ConfirmPolicy, Confirmations, needsConfirmation } from "./confirm.js";
import { callMethodOf } from "./execute.js";
import type { BridgeAction, BridgeGraph } from "./types.js";

export interface BridgeServerOptions extends BridgeOptions {
  /** Only expose actions that read (GET). */
  readOnly?: boolean;
  /** Which actions need a confirmed second call. Defaults to `risky`. */
  confirm?: ConfirmPolicy;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
}

const READ_PAGE = "read_page";
const FULL_ARG = "_full";
const CONFIRM_ARG = "_confirm";
const CONFIRM_SCHEMA = {
  type: "string",
  description: "Confirmation code from a previous call. Only pass it after the user has agreed.",
};
const FULL_SCHEMA = {
  type: "boolean",
  description: "Return the whole response. By default a repeat read returns only what changed since your last call.",
};

export function exposedActions(graph: BridgeGraph, readOnly = false): BridgeAction[] {
  return graph.actions.filter(
    (a) => a.relayAccess !== "denied" && (!readOnly || (a.risk ?? riskOfMethod(a)) === "read"),
  );
}

function riskOfMethod(a: BridgeAction): "read" | "write" {
  return callMethodOf(a) === "GET" ? "read" : "write";
}

/** An MCP server for one site whose tools can be replaced while it runs. */
export type BridgeMcpServer = Server & {
  /** Swaps in a newly discovered map and tells the client the tool list changed. */
  setGraph(graph: BridgeGraph): void;
};

export function createBridgeServer(opts: BridgeServerOptions): BridgeMcpServer {
  let actions = new Map<string, BridgeAction>();
  const server = new Server(
    { name: `relay-bridge:${opts.graph.appName}`, version: "0.1.0" },
    { capabilities: { tools: { listChanged: true }, logging: {} } },
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

  const policy = opts.confirm ?? "risky";
  const confirmations = new Confirmations();

  let tools: Tool[] = [];
  const build = (graph: BridgeGraph) => {
    actions = new Map(exposedActions(graph, opts.readOnly).map((a) => [a.actionId, a]));
    tools = [
      ...[...actions.values()].map((a): Tool => {
        const risk = a.risk ?? riskOfMethod(a);
        const confirm = needsConfirmation(risk, policy);
        let schema = objectSchema(a.inputs);
        if (callMethodOf(a) === "GET") schema = withArg(schema, FULL_ARG, FULL_SCHEMA);
        if (confirm) schema = withArg(schema, CONFIRM_ARG, CONFIRM_SCHEMA);
        return {
          name: a.actionId,
          description: [confirm ? "⚠ Needs the user's confirmation." : "", a.label, a.description]
            .filter(Boolean)
            .join(" "),
          inputSchema: schema,
          // Standard MCP hints, so the client can ask the user before risky calls.
          annotations: {
            title: a.label,
            readOnlyHint: risk === "read",
            destructiveHint: risk === "destructive" || risk === "external",
            idempotentHint: ["GET", "PUT", "DELETE"].includes(callMethodOf(a)),
            openWorldHint: risk === "external",
          },
        };
      }),
      {
        name: READ_PAGE,
        description: `Read a page of ${graph.baseUrl} as plain text with its links. Use it to look things up that no other tool covers.`,
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
  };
  build(opts.graph);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const {
      [FULL_ARG]: fullArg,
      [CONFIRM_ARG]: confirmArg,
      ...args
    } = (req.params.arguments ?? {}) as Record<string, unknown>;
    const full = fullArg === true;
    try {
      if (req.params.name === READ_PAGE) {
        const path = typeof args["path"] === "string" ? args["path"] : "/";
        const url = new URL(path, bridge.graph.baseUrl);
        if (url.origin !== new URL(bridge.graph.baseUrl).origin) return errorResult("read_page only reads this site");
        return toolResult(await bridge.read(url.toString(), full));
      }
      const action = actions.get(req.params.name);
      if (!action) return errorResult(`Unknown tool: ${req.params.name}`);
      const validation = validateInput(action.inputs, args);
      if (!validation.ok) return errorResult(JSON.stringify(validation.error));
      if (needsConfirmation(action.risk ?? riskOfMethod(action), policy)) {
        if (!confirmations.redeem(confirmArg, action, validation.value)) {
          const { preview } = confirmations.issue(action, validation.value);
          opts.log?.(`${action.actionId} → waiting for the user's confirmation`);
          return { content: [{ type: "text" as const, text: JSON.stringify(preview) }] };
        }
      }
      return toolResult(await bridge.act(action, validation.value, full));
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  });

  return Object.assign(server, {
    setGraph(graph: BridgeGraph) {
      bridge.graph = graph;
      build(graph);
      server.sendToolListChanged().catch(() => undefined);
    },
  });
}

export async function runBridgeServer(opts: BridgeServerOptions): Promise<BridgeMcpServer> {
  const server = createBridgeServer(opts);
  await server.connect(new StdioServerTransport());
  return server;
}

function toolResult(result: BridgeReply) {
  // A note (e.g. "reply shape changed") rides along with the reply.
  // Compact JSON: indentation costs tokens and the agent doesn't need it.
  const text = JSON.stringify(result);
  return { content: [{ type: "text" as const, text }], ...(result.status >= 400 && { isError: true }) };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function withArg(schema: Record<string, unknown>, name: string, arg: object): Record<string, unknown> {
  return { ...schema, properties: { ...(schema["properties"] as object), [name]: arg } };
}

function objectSchema(fields: Record<string, IOField>): Record<string, unknown> {
  const required = Object.entries(fields)
    .filter(([, f]) => f.required)
    .map(([k]) => k);
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
