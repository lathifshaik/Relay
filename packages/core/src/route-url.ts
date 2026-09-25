const PLACEHOLDER = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Builds the URL an adapter replays an action against. `:param` placeholders
 * are filled from the inputs. For methods that carry no body (GET, HEAD,
 * DELETE) the remaining inputs go into the query string so the route still
 * sees them; for the rest they belong in the body and the query is left empty.
 */
export function buildRouteUrl(
  routePath: string,
  method: string,
  inputs: Record<string, unknown>,
): string {
  const used = new Set<string>();
  const path = routePath.replace(PLACEHOLDER, (match, name: string) => {
    const value = inputs[name];
    if (typeof value === "string" || typeof value === "number") {
      used.add(name);
      return encodeURIComponent(String(value));
    }
    return match;
  });

  if (methodHasBody(method)) return path;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(inputs)) {
    if (used.has(key) || value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, toQueryValue(item));
    } else {
      query.append(key, toQueryValue(value));
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function methodHasBody(method: string): boolean {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "DELETE";
}

function toQueryValue(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}
