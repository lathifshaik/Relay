import type { IOField } from "./action-graph.js";
import { sanitiseValue } from "./sanitiser.js";

export function projectOutput(
  schema: Record<string, IOField>,
  output: unknown,
): Record<string, unknown> {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return {};
  }
  const data = output as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      projected[key] = data[key];
    }
  }
  return sanitiseValue(projected) as Record<string, unknown>;
}
