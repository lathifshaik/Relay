import type { ActionDef, IOField } from "@relay/core";
import { getAnnotation } from "@relay/core";
import type { RequestHandler } from "express";

type ExpressApp = {
  _router?: { stack: ExpressLayer[] };
  router?: { stack: ExpressLayer[] };
};

interface ExpressLayer {
  route?: ExpressRoute;
}

interface ExpressRoute {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: RequestHandler }>;
}

export interface DiscoveredAction {
  action: ActionDef;
  handler: RequestHandler;
}

export function scanExpressRoutes(app: ExpressApp): DiscoveredAction[] {
  // Express 5 dropped the underscore; try both.
  const stack = app._router?.stack ?? app.router?.stack ?? [];
  const discovered: DiscoveredAction[] = [];

  for (const layer of stack) {
    if (!layer.route) continue;
    const route = layer.route;
    const methods = Object.keys(route.methods).filter((m) => route.methods[m]);

    for (const method of methods) {
      for (const handlerLayer of route.stack) {
        const handler = handlerLayer.handle;
        const annotation = getAnnotation(handler);
        if (!annotation) continue;

        const upperMethod = method.toUpperCase() as ActionDef["method"];
        const inputs: Record<string, IOField> = annotation.inputs ?? {};
        const returns: Record<string, IOField> = annotation.returns ?? {};

        const action: ActionDef = {
          actionId: annotation.actionId ?? defaultActionId(method, route.path),
          method: upperMethod,
          path: route.path,
          label: annotation.label ?? `${upperMethod} ${route.path}`,
          inputs,
          returns,
          relayAccess: annotation.relayAccess ?? "allowed",
          ...(annotation.description !== undefined && { description: annotation.description }),
          ...(annotation.consentScope !== undefined && { consentScope: annotation.consentScope }),
          ...(annotation.tags !== undefined && { tags: annotation.tags }),
        };

        discovered.push({ action, handler });
      }
    }
  }

  return dedupe(discovered);
}

function dedupe(actions: DiscoveredAction[]): DiscoveredAction[] {
  const seen = new Map<string, DiscoveredAction>();
  for (const a of actions) {
    seen.set(a.action.actionId, a);
  }
  return [...seen.values()];
}

function defaultActionId(method: string, path: string): string {
  return `${method.toLowerCase()}_${path
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/:/g, "")
    .replace(/[^a-z0-9_]/gi, "_")
    .toLowerCase()}`;
}
