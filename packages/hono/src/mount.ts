import type {
  ActionGraph,
  BlockListConfig,
  ConnectOptions,
  EmitterContext,
  RelayResponse,
  TokenStore,
} from "@relay/core";
import {
  MemoryTokenStore,
  RELAY_PROTOCOL_VERSION,
  RelayUpstreamError,
  buildRouteUrl,
  createBlockList,
  handleConnectRoute,
  resolveConnect,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
  isSuccessStatus,
  methodHasBody,
} from "@relay/core";
import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { type DiscoveredAction, scanHonoRoutes } from "./route-scanner.js";

export interface RelayHonoOptions {
  appName: string;
  appVersion?: string;
  signingKey?: string;
  tokenStore?: TokenStore;
  blockList?: BlockListConfig;
  authDisabled?: boolean;
  buildState?: (c: Context) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Lets people connect agents to their account (see @relay/core connect). Needs `signingKey` and `identify`. */
  connect?: ConnectOptions;
  /** Who is signed in, using your app's own auth. Return their user id. */
  identify?: (c: Context) => Promise<string | undefined> | string | undefined;
}

export interface RelayAgent {
  /** The user the agent acts for. */
  subject: string;
  scope: readonly string[];
}

// Replayed requests are created here, so a WeakMap keyed by them can't be forged from outside.
const agents = new WeakMap<Request, RelayAgent>();

/** Inside a route handler: the agent calling it through /relay/act, if any, and who it acts for. */
export function getRelayAgent(c: Context): RelayAgent | undefined {
  return agents.get(c.req.raw);
}

/**
 * Attaches `/relay/manifest`, `/relay/act/:actionId`, `/relay/validate` and `/relay/state`
 * to a Hono application. Call AFTER your annotated routes are registered so they're
 * picked up by the route scanner.
 */
export function mountRelay(app: Hono, opts: RelayHonoOptions): Hono {
  const blockList = opts.blockList ?? createBlockList();
  const tokenStore = opts.tokenStore ?? (opts.connect ? new MemoryTokenStore() : undefined);
  const connect = resolveConnect(opts.connect, opts.signingKey, tokenStore);
  if (opts.connect && !connect) throw new Error("@relay/hono: `connect` needs a signingKey");
  if (connect && !opts.identify) throw new Error("@relay/hono: `connect` needs `identify` to know who is approving");

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
      ...(tokenStore !== undefined && { tokenStore }),
      authDisabled: opts.authDisabled ?? !opts.signingKey,
    };
  };

  const connectRoute = async (c: Context) => {
    const contentType = c.req.header("content-type") ?? "";
    let body: unknown = {};
    if (c.req.method === "POST") {
      body = contentType.includes("application/x-www-form-urlencoded")
        ? await c.req.parseBody({ all: true })
        : await safeJson(c);
    }
    const result = await handleConnectRoute(buildCtx(), connect, {
      method: c.req.method,
      path: c.req.path,
      query: c.req.query(),
      body,
      contentType,
      origin: new URL(c.req.url).origin,
      identify: async () => (opts.identify ? opts.identify(c) : undefined),
    });
    return result ? toHonoResponse(c, result) : c.notFound();
  };
  app.get("/.well-known/relay.json", connectRoute);
  app.post("/relay/connect", connectRoute);
  app.post("/relay/connect/token", connectRoute);
  app.on(["GET", "POST"], "/relay/approve", connectRoute);
  app.get("/relay/connections", connectRoute);
  app.post("/relay/connections/:id/revoke", connectRoute);

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
      async (action, validatedInputs, context) => {
        const found = actions.find((d) => d.action.actionId === action.actionId);
        if (!found) throw new Error(`No route for ${action.actionId}`);
        const agent = context.claims ? { subject: context.claims.sub, scope: context.claims.scope } : undefined;
        return invokeViaFetch(app, c, found.routePath, action.method, validatedInputs, agent);
      },
    );
    return c.json(result.body as object, statusOf(result));
  });

  return app;
}

function toHonoResponse(c: Context, result: RelayResponse): Response {
  const headers = new Headers(result.headers ?? {});
  if (result.status >= 300 && result.status < 400 && headers.has("location")) {
    return new Response(null, { status: result.status, headers });
  }
  if (result.html !== undefined) {
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(result.html, { status: result.status, headers });
  }
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

function statusOf(result: { status: number }): ContentfulStatusCode {
  return result.status as ContentfulStatusCode;
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
  agent: RelayAgent | undefined,
): Promise<unknown> {
  const url = new URL(buildRouteUrl(routePath, method, validatedInputs), originalCtx.req.url);

  const init: RequestInit = { method };
  if (methodHasBody(method)) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(validatedInputs);
  }
  const request = new Request(url.toString(), init);
  if (agent) agents.set(request, agent);

  const response = await app.fetch(request);
  if (!isSuccessStatus(response.status)) throw new RelayUpstreamError(response.status);
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
