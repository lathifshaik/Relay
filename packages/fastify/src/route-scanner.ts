import type { ActionDef, DescribeAnnotation, HttpMethod, IOField } from "@relay/core";
import { getAnnotation } from "@relay/core";
import type { FastifyInstance, RouteOptions } from "fastify";

export interface DiscoveredAction {
  action: ActionDef;
  routePath: string;
}

export class FastifyRouteCollector {
  readonly actions: DiscoveredAction[] = [];
  private readonly seen = new Set<string>();

  attach(fastify: FastifyInstance): void {
    fastify.addHook("onRoute", (routeOpts: RouteOptions) => {
      // Skip our own /relay/* routes.
      if (typeof routeOpts.url === "string" && routeOpts.url.startsWith("/relay")) return;

      const handler = routeOpts.handler as unknown;
      const annotation = getAnnotation(handler);
      if (!annotation) return;

      const methods = Array.isArray(routeOpts.method) ? routeOpts.method : [routeOpts.method];
      for (const method of methods) {
        // Fastify auto-registers HEAD for every GET route (same handler). Skip the HEAD
        // shadow so the manifest doesn't double-count it.
        if (String(method).toUpperCase() === "HEAD") continue;

        const action = buildActionDef(String(method), routeOpts.url, annotation);
        if (this.seen.has(action.actionId)) continue;
        this.seen.add(action.actionId);
        this.actions.push({ action, routePath: routeOpts.url });
      }
    });
  }
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
    path,
    label: annotation.label ?? `${upper} ${path}`,
    inputs,
    returns,
    relayAccess: annotation.relayAccess ?? "allowed",
    ...(annotation.description !== undefined && { description: annotation.description }),
    ...(annotation.consentScope !== undefined && { consentScope: annotation.consentScope }),
    ...(annotation.tags !== undefined && { tags: annotation.tags }),
  };
}

function defaultActionId(method: string, path: string): string {
  return `${method.toLowerCase()}_${path
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/:/g, "")
    .replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase()}`;
}
