import type { IOField } from "./action-graph.js";
import { sanitiseValue } from "./sanitiser.js";

/**
 * Keeps only the fields the `returns` schema declares, recursing into objects
 * with `properties` and arrays with `items`, then redacts secrets. Anything the
 * schema does not mention (e.g. a nested `passwordHash`) never reaches the agent.
 */
export function projectOutput(
  schema: Record<string, IOField>,
  output: unknown,
): Record<string, unknown> {
  if (!isPlainObject(output)) return {};
  return sanitiseValue(projectProperties(schema, output)) as Record<string, unknown>;
}

function projectProperties(
  schema: Record<string, IOField>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      projected[key] = projectField(field, data[key]);
    }
  }
  return projected;
}

function projectField(field: IOField, value: unknown): unknown {
  if (field.type === "object" && field.properties && isPlainObject(value)) {
    return projectProperties(field.properties, value);
  }
  if (field.type === "array" && field.items && Array.isArray(value)) {
    const items = field.items;
    return value.map((v) => projectField(items, v));
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
