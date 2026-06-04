import type { RelayCallResult, RelayClient } from "./client.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

const URL_PROP = {
  type: "string",
  description: "Base URL of the Relay-enabled app (no trailing /relay path), e.g. http://localhost:3000",
} as const;

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "relay_manifest",
    description:
      "Fetch the Relay Action Graph for a Relay-enabled URL. Returns the typed list of actions the app exposes — actionId, method, path, inputs schema, returns schema. Read this first before calling any other tool.",
    inputSchema: {
      type: "object",
      properties: { url: URL_PROP },
      required: ["url"],
    },
  },
  {
    name: "relay_act",
    description:
      "Execute a Relay action against the given URL with validated inputs. Inputs must match the action's input schema from relay_manifest. Returns the schema-projected output of the action.",
    inputSchema: {
      type: "object",
      properties: {
        url: URL_PROP,
        actionId: {
          type: "string",
          description: "The actionId from the manifest, e.g. 'create_todo'.",
        },
        inputs: {
          type: "object",
          description: "Inputs object matching the action's input schema.",
          additionalProperties: true,
        },
      },
      required: ["url", "actionId", "inputs"],
    },
  },
  {
    name: "relay_validate",
    description:
      "Dry-run an action call. Validates the inputs against the action's schema without invoking the handler. Returns ok:true if valid, or a structured RELAY_VALIDATION_FAILED error if not. Use this when you're uncertain about an input shape.",
    inputSchema: {
      type: "object",
      properties: {
        url: URL_PROP,
        actionId: { type: "string" },
        inputs: { type: "object", additionalProperties: true },
      },
      required: ["url", "actionId", "inputs"],
    },
  },
  {
    name: "relay_state",
    description:
      "Fetch the current session context for the Relay-enabled URL — user, workflow step, recent actions. Use during long workflows to avoid re-discovering state.",
    inputSchema: {
      type: "object",
      properties: { url: URL_PROP },
      required: ["url"],
    },
  },
] as const;

export async function callTool(
  client: RelayClient,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "relay_manifest":
      return formatResult(await client.getManifest(requireString(args, "url")));

    case "relay_state":
      return formatResult(await client.getState(requireString(args, "url")));

    case "relay_act":
      return formatResult(
        await client.act(
          requireString(args, "url"),
          requireString(args, "actionId"),
          requireObject(args, "inputs"),
        ),
      );

    case "relay_validate":
      return formatResult(
        await client.validate(
          requireString(args, "url"),
          requireString(args, "actionId"),
          requireObject(args, "inputs"),
        ),
      );

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

function formatResult(result: RelayCallResult): ToolResult {
  const text = typeof result.body === "string"
    ? result.body
    : JSON.stringify(result.body, null, 2);
  const out: ToolResult = { content: [{ type: "text", text }] };
  if (result.status >= 400) out.isError = true;
  return out;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Argument "${key}" must be a non-empty string`);
  }
  return value;
}

function requireObject(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Argument "${key}" must be an object`);
  }
  return value as Record<string, unknown>;
}
