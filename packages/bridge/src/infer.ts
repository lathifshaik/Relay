import type { HttpMethod, IOField } from "@relay/core";

const ID_SEGMENT =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24}|(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,})$/i;

const MAX_SAMPLE_DEPTH = 4;

/**
 * Replaces path segments that look like record ids with named placeholders:
 * `/api/orders/42/items` becomes `/api/orders/:orderId/items`.
 */
export function templatePath(pathname: string): string {
  const used = new Set<string>();
  const segments = pathname.split("/");
  return segments
    .map((segment, i) => {
      if (!segment || !ID_SEGMENT.test(segment)) return segment;
      const base = `${singular(segments[i - 1] ?? "")}Id`.replace(/^Id$/, "id");
      let name = camel(base);
      for (let n = 2; used.has(name); n++) name = `${camel(base)}${n}`;
      used.add(name);
      return `:${name}`;
    })
    .join("/");
}

export function placeholderNames(template: string): string[] {
  return [...template.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string);
}

/** Guesses a Relay field from one observed value. */
export function fieldFromSample(value: unknown, depth = 0): IOField {
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) {
    if (value.length === 0 || depth >= MAX_SAMPLE_DEPTH) return { type: "array" };
    return { type: "array", items: fieldFromSample(value[0], depth + 1) };
  }
  if (value !== null && typeof value === "object") {
    if (depth >= MAX_SAMPLE_DEPTH) return { type: "object" };
    return { type: "object", properties: propertiesFromSample(value as Record<string, unknown>, depth + 1) };
  }
  // null tells us nothing about the type; string is the most forgiving guess.
  return { type: "string" };
}

export function propertiesFromSample(
  sample: Record<string, unknown>,
  depth = 0,
): Record<string, IOField> {
  const out: Record<string, IOField> = {};
  for (const [key, value] of Object.entries(sample)) out[key] = fieldFromSample(value, depth);
  return out;
}

/** The `returns` schema for a response body: objects as-is, anything else under `data`. */
export function returnsFromSample(sample: unknown): Record<string, IOField> {
  if (sample === undefined) return {};
  if (sample !== null && typeof sample === "object" && !Array.isArray(sample)) {
    return propertiesFromSample(sample as Record<string, unknown>);
  }
  return { data: fieldFromSample(sample) };
}

export interface ObservedRequest {
  method: string;
  url: string;
  /** Parsed JSON request body, when there was one. */
  body?: unknown;
}

/** Inputs for an observed API call: path ids, then query params, then JSON body keys. */
export function inputsFromRequest(req: ObservedRequest, template: string): Record<string, IOField> {
  const inputs: Record<string, IOField> = {};
  for (const name of placeholderNames(template)) {
    inputs[name] = { type: "string", required: true, description: "Id taken from the URL path" };
  }
  const url = new URL(req.url);
  for (const key of new Set(url.searchParams.keys())) {
    if (!(key in inputs)) inputs[key] = { type: "string" };
  }
  if (req.body !== null && typeof req.body === "object" && !Array.isArray(req.body)) {
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (!(key in inputs)) inputs[key] = { ...fieldFromSample(value), required: true };
    }
  }
  return inputs;
}

export function apiActionId(method: string, template: string): string {
  const path = template
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/^:/, "by_"))
    .join("_");
  return toolName(`${method.toLowerCase()}_${path || "root"}`);
}

export function normaliseMethod(method: string): HttpMethod | undefined {
  const m = method.toUpperCase();
  return m === "GET" || m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE"
    ? m
    : undefined;
}

/** A name that satisfies MCP's tool-name rule: [a-zA-Z0-9_-]{1,64}. */
export function toolName(raw: string): string {
  const cleaned = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/, "");
  return cleaned || "action";
}

function singular(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/(ss|us)$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

function camel(word: string): string {
  const parts = word.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}
