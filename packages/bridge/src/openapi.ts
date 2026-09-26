import type { IOField } from "@relay/core";
import { normaliseMethod, toolName } from "./infer.js";
import type { BridgeAction } from "./types.js";

/**
 * Where apps usually serve their OpenAPI / Swagger document. Kept short on
 * purpose: each miss costs the site a full 404 render.
 */
export const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/api/openapi.json", "/v3/api-docs"];

type Json = Record<string, unknown>;
const MAX_REF_DEPTH = 6;

/** Turns an OpenAPI 3 or Swagger 2 document into bridge actions. */
export function actionsFromOpenApi(spec: unknown, specUrl: string): BridgeAction[] {
  if (!isObj(spec) || !isObj(spec["paths"])) return [];
  const base = serverBase(spec, specUrl);
  const actions: BridgeAction[] = [];

  for (const [rawPath, item] of Object.entries(spec["paths"] as Json)) {
    if (!isObj(item)) continue;
    const shared = Array.isArray(item["parameters"]) ? (item["parameters"] as unknown[]) : [];
    for (const [verb, op] of Object.entries(item)) {
      const method = normaliseMethod(verb);
      if (!method || !isObj(op)) continue;

      const path = rawPath.replace(/\{([^}]+)\}/g, ":$1");
      const inputs: Record<string, IOField> = {};
      const params = [...shared, ...(Array.isArray(op["parameters"]) ? (op["parameters"] as unknown[]) : [])];
      for (const p of params.map((x) => deref(spec, x, 0))) {
        if (!isObj(p) || typeof p["name"] !== "string") continue;
        const where = p["in"];
        if (where === "path" || where === "query") {
          inputs[p["name"]] = {
            ...toField(spec, p["schema"] ?? p, 0),
            ...((p["required"] === true || where === "path") && { required: true }),
            ...(typeof p["description"] === "string" && { description: p["description"] }),
          };
        } else if (where === "body") {
          Object.assign(inputs, bodyInputs(spec, p["schema"]));
        }
      }
      const body = jsonContent(deref(spec, op["requestBody"], 0));
      if (body) Object.assign(inputs, bodyInputs(spec, body["schema"]));

      const ok = isObj(op["responses"]) ? ((op["responses"] as Json)["200"] ?? (op["responses"] as Json)["201"]) : undefined;
      const okResponse = deref(spec, ok, 0);
      const okSchema = jsonContent(okResponse)?.["schema"] ?? (isObj(okResponse) ? okResponse["schema"] : undefined);
      const returnsField = okSchema !== undefined ? toField(spec, okSchema, 0) : undefined;

      const summary = typeof op["summary"] === "string" ? op["summary"] : undefined;
      const description = typeof op["description"] === "string" ? op["description"] : undefined;
      const described = description ?? summary;
      actions.push({
        actionId: toolName(typeof op["operationId"] === "string" ? op["operationId"] : `${method}_${path}`),
        method,
        path,
        label: summary ?? `${method} ${path}`,
        ...(described !== undefined && { description: described }),
        inputs,
        returns:
          returnsField?.type === "object" && returnsField.properties
            ? returnsField.properties
            : returnsField
              ? { data: returnsField }
              : {},
        relayAccess: "allowed",
        target: { kind: "api", urlTemplate: `${base}${path}` },
      });
    }
  }
  return actions;
}

function bodyInputs(spec: Json, schema: unknown): Record<string, IOField> {
  const field = toField(spec, schema, 0);
  if (field.type === "object" && field.properties) return field.properties;
  return { body: { ...field, required: true } };
}

function toField(spec: Json, raw: unknown, depth: number): IOField {
  const schema = deref(spec, raw, depth);
  if (!isObj(schema) || depth > MAX_REF_DEPTH) return { type: "string" };
  const combined = (schema["allOf"] ?? schema["oneOf"] ?? schema["anyOf"]) as unknown[] | undefined;
  if (Array.isArray(combined) && combined.length > 0) {
    if (schema["allOf"]) {
      const properties: Record<string, IOField> = {};
      for (const part of combined) Object.assign(properties, toField(spec, part, depth + 1).properties ?? {});
      return { type: "object", properties };
    }
    return toField(spec, combined[0], depth + 1);
  }

  const description = typeof schema["description"] === "string" ? { description: schema["description"] } : {};
  if (Array.isArray(schema["enum"])) {
    return { type: "enum", enum: (schema["enum"] as unknown[]).map(String), ...description };
  }
  const bounds = {
    ...(typeof (schema["minimum"] ?? schema["minLength"]) === "number" && {
      min: (schema["minimum"] ?? schema["minLength"]) as number,
    }),
    ...(typeof (schema["maximum"] ?? schema["maxLength"]) === "number" && {
      max: (schema["maximum"] ?? schema["maxLength"]) as number,
    }),
  };
  switch (schema["type"]) {
    case "integer":
      return { type: "integer", ...bounds, ...description };
    case "number":
      return { type: "number", ...bounds, ...description };
    case "boolean":
      return { type: "boolean", ...description };
    case "array":
      return {
        type: "array",
        ...(schema["items"] !== undefined && { items: toField(spec, schema["items"], depth + 1) }),
        ...description,
      };
    case "object":
    case undefined: {
      if (!isObj(schema["properties"])) {
        return schema["type"] === "object" ? { type: "object", ...description } : { type: "string", ...bounds, ...description };
      }
      const required = new Set(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []);
      const properties: Record<string, IOField> = {};
      for (const [name, sub] of Object.entries(schema["properties"] as Json)) {
        properties[name] = { ...toField(spec, sub, depth + 1), ...(required.has(name) && { required: true }) };
      }
      return { type: "object", properties, ...description };
    }
    default:
      return { type: "string", ...bounds, ...description };
  }
}

function deref(spec: Json, value: unknown, depth: number): unknown {
  let current = value;
  for (let i = depth; i <= MAX_REF_DEPTH && isObj(current) && typeof current["$ref"] === "string"; i++) {
    const ref = current["$ref"] as string;
    if (!ref.startsWith("#/")) return undefined;
    current = ref
      .slice(2)
      .split("/")
      .reduce<unknown>((node, key) => (isObj(node) ? node[key.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined), spec);
  }
  return current;
}

function jsonContent(body: unknown): Json | undefined {
  if (!isObj(body) || !isObj(body["content"])) return undefined;
  const content = body["content"] as Json;
  const key = Object.keys(content).find((k) => k.includes("json")) ?? Object.keys(content)[0];
  const entry = key ? content[key] : undefined;
  return isObj(entry) ? entry : undefined;
}

function serverBase(spec: Json, specUrl: string): string {
  const servers = spec["servers"];
  if (Array.isArray(servers) && isObj(servers[0]) && typeof servers[0]["url"] === "string") {
    return new URL(servers[0]["url"] as string, specUrl).toString().replace(/\/$/, "");
  }
  if (typeof spec["host"] === "string") {
    const scheme = Array.isArray(spec["schemes"]) ? (spec["schemes"] as string[])[0] : new URL(specUrl).protocol.slice(0, -1);
    return `${scheme}://${spec["host"]}${typeof spec["basePath"] === "string" ? spec["basePath"] : ""}`.replace(/\/$/, "");
  }
  return new URL(specUrl).origin + (typeof spec["basePath"] === "string" ? spec["basePath"].replace(/\/$/, "") : "");
}

function isObj(v: unknown): v is Json {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
