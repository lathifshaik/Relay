import type { ActionDef, DescribeAnnotation, HttpMethod, IOField } from "@relay/core";
import { getAnnotation } from "@relay/core";
import type { Hono } from "hono";

export interface DiscoveredAction {
  action: ActionDef;
  routePath: string;
}

interface HonoRoute {
  path: string;
  method: string;
  handler: unknown;
}

export function scanHonoRoutes(app: Hono): DiscoveredAction[] {
  const routes = (app as unknown as { routes: HonoRoute[] }).routes ?? [];
  const out: DiscoveredAction[] = [];
  const seen = new Set<string>();

  for (const route of routes) {
    if (typeof route.path !== "string" || route.path.startsWith("/relay")) continue;
    const annotation = getAnnotation(route.handler);
    if (!annotation) continue;

    const action = buildActionDef(route.method, route.path, annotation);
    if (seen.has(action.actionId)) continue;
    seen.add(action.actionId);
    out.push({ action, routePath: route.path });
  }

  return out;
}

function buildActionDef(
  method: string,
  path: string,
  annotation: DescribeAnnotation,
): ActionDef {
  const inputs: Record<string, IOField> = annotation.inputs ?? {};
  const returns: Record<string, IOField> = annotation.returns ?? {};
  const upper = method.toUpperCase() as HttpMethod;
  return {
    actionId: annotation.actionId ?? defaultActionId(method, path),
    method: upper,
    path: honoPathToManifestPath(path),
    label: annotation.label ?? `${upper} ${path}`,
    inputs,
    returns,
    relayAccess: annotation.relayAccess ?? "allowed",
    ...(annotation.description !== undefined && { description: annotation.description }),
    ...(annotation.consentScope !== undefined && { consentScope: annotation.consentScope }),
    ...(annotation.tags !== undefined && { tags: annotation.tags }),
  };
}

/**
 * Hono uses `/:id` path syntax just like Express, so passthrough today.
 * Kept as a function so future Hono regex segments can be normalised here.
 */
function honoPathToManifestPath(path: string): string {
  return path;
}

function defaultActionId(method: string, path: string): string {
  return `${method.toLowerCase()}_${path
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/:/g, "")
    .replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase()}`;
}
