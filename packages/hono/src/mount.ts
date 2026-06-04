import type {
  ActionGraph,
  BlockListConfig,
  EmitterContext,
  TokenStore,
} from "@relay/core";
import {
  RELAY_PROTOCOL_VERSION,
  createBlockList,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
} from "@relay/core";
import type { Context, Hono } from "hono";
import { type DiscoveredAction, scanHonoRoutes } from "./route-scanner.js";

export interface RelayHonoOptions {
  appName: string;
  appVersion?: string;
  signingKey?: string;
  tokenStore?: TokenStore;
  blockList?: BlockListConfig;
  authDisabled?: boolean;
  buildState?: (c: Context) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

/**
 * Attaches `/relay/manifest`, `/relay/act/:actionId`, `/relay/validate` and `/relay/state`
 * to a Hono application. Call AFTER your annotated routes are registered so they're
 * picked up by the route scanner.
 */
export function mountRelay(app: Hono, opts: RelayHonoOptions): Hono {
  const blockList = opts.blockList ?? createBlockList();

  let scanned: DiscoveredAction[] | undefined;
  let cachedGraph: ActionGraph | undefined;

  const ensureScanned = (): {
    actions: DiscoveredAction[];
    graph: ActionGraph;
  } => {
    if (scanned && cachedGraph) return { actions: scanned, graph: cachedGraph };
    scanned = scanHonoRoutes(app);
    cachedGraph = {
      relayVersion: RELAY_PROTOCOL_VERSION,
      appName: opts.appName,
      ...(opts.appVersion !== undefined && { appVersion: opts.appVersion }),
      generatedAt: new Date().toISOString(),
      actions: scanned.map((d) => d.action),
    };
    return { actions: scanned, graph: cachedGraph };
  };

  const buildCtx = (): EmitterContext => {
    const { graph } = ensureScanned();
    return {
      graph,
      blockList,
      ...(opts.signingKey !== undefined && { signingKey: opts.signingKey }),
      ...(opts.tokenStore !== undefined && { tokenStore: opts.tokenStore }),
      authDisabled: opts.authDisabled ?? !opts.signingKey,
    };
  };

  app.get("/relay/manifest", async (c) => {
    const result = await handleManifest(buildCtx(), { token: extractToken(c) });
    return c.json(result.body as object, statusOf(result));
  });

  app.get("/relay/state", async (c) => {
    const result = await handleState(buildCtx(), { token: extractToken(c) }, () =>
      opts.buildState ? opts.buildState(c) : {},
    );
    return c.json(result.body as object, statusOf(result));
  });

  app.post("/relay/validate", async (c) => {
    const body = (await safeJson(c)) as { actionId?: unknown };
    const actionId = body && typeof body.actionId === "string" ? body.actionId : "";
    const result = await handleValidate(
      buildCtx(),
      { token: extractToken(c), body },
      actionId,
    );
    return c.json(result.body as object, statusOf(result));
  });

  app.post("/relay/act/:actionId", async (c) => {
    const actionId = c.req.param("actionId");
    const body = (await safeJson(c)) as Record<string, unknown> | undefined;
    const { actions } = ensureScanned();

    const result = await handleAct(
      buildCtx(),
      { token: extractToken(c), body },
      actionId,
      async (action, validatedInputs) => {
        const found = actions.find((d) => d.action.actionId === action.actionId);
        if (!found) throw new Error(`No route for ${action.actionId}`);
        return invokeViaFetch(app, c, found.routePath, action.method, validatedInputs);
      },
    );
    return c.json(result.body as object, statusOf(result));
  });

  return app;
}

function statusOf(result: { status: number }): 200 | 400 | 401 | 403 | 404 | 500 {
  return result.status as 200 | 400 | 401 | 403 | 404 | 500;
}

function extractToken(c: Context): string | undefined {
  const auth = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

async function safeJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

async function invokeViaFetch(
  app: Hono,
  originalCtx: Context,
  routePath: string,
  method: string,
  validatedInputs: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(originalCtx.req.url);
  url.pathname = substitutePathParams(routePath, validatedInputs);
  url.search = "";

  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (methodAllowsBody(method)) {
    init.body = JSON.stringify(validatedInputs);
  }
  const request = new Request(url.toString(), init);

  const response = await app.fetch(request);
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function methodAllowsBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "DELETE";
}

function substitutePathParams(
  routePath: string,
  inputs: Record<string, unknown>,
): string {
  return routePath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => {
    const value = inputs[name];
    if (typeof value === "string") return encodeURIComponent(value);
    if (typeof value === "number") return String(value);
    return _match;
  });
}
