import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RelayClient, type RelayClientOptions } from "./client.js";
import { TOOL_DEFINITIONS, callTool } from "./tools.js";

export interface CreateServerOptions {
  token?: string;
  fetchImpl?: RelayClientOptions["fetchImpl"];
}

export function createServer(opts: CreateServerOptions = {}): Server {
  const server = new Server(
    { name: "@relay/mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const clientOpts: RelayClientOptions = {};
  if (opts.token !== undefined) clientOpts.token = opts.token;
  if (opts.fetchImpl !== undefined) clientOpts.fetchImpl = opts.fetchImpl;
  const client = new RelayClient(clientOpts);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS as unknown as Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      // ToolResult shape (content + isError) matches the MCP "tools/call" result.
      // SDK's request-handler signature is a wider union; cast at the boundary.
      const result = await callTool(client, name, args);
      return result as unknown as Record<string, unknown>;
    } catch (err) {
      return {
        content: [
          { type: "text", text: err instanceof Error ? err.message : String(err) },
        ],
        isError: true,
      } as unknown as Record<string, unknown>;
    }
  });

  return server;
}

export async function runServer(opts: CreateServerOptions = {}): Promise<void> {
  const server = createServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
