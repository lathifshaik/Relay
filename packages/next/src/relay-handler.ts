import type { ActionDef, ActionGraph, BlockListConfig, ConnectOptions, RelayResponse, TokenStore } from "@relay/core";
import {
  MemoryTokenStore,
  RELAY_PROTOCOL_VERSION,
  createBlockList,
  handleConnectRoute,
  parseFormBody,
  resolveConnect,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
} from "@relay/core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ActionRouteHandler } from "./define-action.js";
import { safeJson } from "./input-extraction.js";

export interface RelayNextOptions {
  appName: string;
  appVersion?: string;
  signingKey?: string;
  tokenStore?: TokenStore;
  blockList?: BlockListConfig;
  authDisabled?: boolean;
  actions: ActionRouteHandler<Record<string, unknown>, unknown>[];
  buildState?: (
    request: NextRequest,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /**
   * Lets people connect agents to their account via /relay/connect and a
   * consent page at /relay/approve. Needs `signingKey` and `identify`. To
   * advertise it, also export this handler from app/.well-known/relay.json/route.ts.
   */
  connect?: ConnectOptions;
  /** Who is signed in, using your app's own auth. Return their user id. */
  identify?: (request: NextRequest) => Promise<string | undefined> | string | undefined;
}

export function createRelayHandler(
  opts: RelayNextOptions,
): (request: NextRequest) => Promise<Response> {
  const blockList = opts.blockList ?? createBlockList();
  const tokenStore = opts.tokenStore ?? (opts.connect ? new MemoryTokenStore() : undefined);
  const connect = resolveConnect(opts.connect, opts.signingKey, tokenStore);
  if (opts.connect && !connect) throw new Error("@relay/next: `connect` needs a signingKey");
  if (connect && !opts.identify) throw new Error("@relay/next: `connect` needs `identify` to know who is approving");

  const actionMap = new Map<string, ActionRouteHandler<Record<string, unknown>, unknown>>();
  const graphActions: ActionDef[] = [];

  for (const unit of opts.actions) {
    const meta = unit._relayMeta;
    actionMap.set(meta.actionId, unit);
    const def: ActionDef = {
      actionId: meta.actionId,
      method: meta.method,
      path: meta.path,
      label: meta.label,
      inputs: meta.inputs,
      returns: meta.returns,
      relayAccess: meta.relayAccess ?? "allowed",
      ...(meta.description !== undefined && { description: meta.description }),
    };
    graphActions.push(def);
  }

  const graph: ActionGraph = {
    relayVersion: RELAY_PROTOCOL_VERSION,
    appName: opts.appName,
    ...(opts.appVersion !== undefined && { appVersion: opts.appVersion }),
    generatedAt: new Date().toISOString(),
    actions: graphActions,
  };

  const ctx = {
    graph,
    blockList,
    ...(opts.signingKey !== undefined && { signingKey: opts.signingKey }),
    ...(tokenStore !== undefined && { tokenStore }),
    authDisabled: opts.authDisabled ?? !opts.signingKey,
  };

  return async (request: NextRequest): Promise<Response> => {
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const token = extractToken(request);

    const contentType = request.headers.get("content-type") ?? "";
    // A request body can be read once; every route below shares this copy.
    const requestBody: unknown =
      method === "POST"
        ? contentType.includes("application/x-www-form-urlencoded")
          ? parseFormBody(await request.text())
          : await safeJson(request)
        : undefined;
    const connectResult = await handleConnectRoute(ctx, connect, {
      method,
      path: pathname,
      query: Object.fromEntries(request.nextUrl.searchParams.entries()),
      body: requestBody ?? {},
      contentType,
      origin: request.nextUrl.origin,
      identify: async () => (opts.identify ? opts.identify(request) : undefined),
    });
    if (connectResult) return toResponse(connectResult);

    if (method === "GET" && pathname === "/relay/manifest") {
      return toResponse(await handleManifest(ctx, { token }));
    }

    if (method === "GET" && pathname === "/relay/state") {
      return toResponse(
        await handleState(ctx, { token }, () =>
          opts.buildState ? opts.buildState(request) : {},
        ),
      );
    }

    if (method === "POST" && pathname === "/relay/validate") {
      const body = requestBody as { actionId?: unknown } | undefined;
      const actionId = body && typeof body.actionId === "string" ? body.actionId : "";
      return toResponse(await handleValidate(ctx, { token, body }, actionId));
    }

    const actMatch = pathname.match(/^\/relay\/act\/([^/]+)$/);
    if (method === "POST" && actMatch) {
      const actionId = actMatch[1] as string;
      const body = requestBody;
      const unit = actionMap.get(actionId);
      const result = await handleAct(
        ctx,
        { token, body },
        actionId,
        async (action, validatedInputs, context) => {
          if (!unit) throw new Error(`No handler for action ${action.actionId}`);
          return unit._relayMeta.handler(validatedInputs, {
            request,
            params: {},
            ...(context.claims && { agent: { subject: context.claims.sub, scope: context.claims.scope } }),
          });
        },
      );
      return toResponse(result);
    }

    return NextResponse.json(
      { error: "RELAY_NOT_FOUND", path: pathname },
      { status: 404 },
    );
  };
}

function toResponse(result: RelayResponse): Response {
  const headers = new Headers(result.headers ?? {});
  if (result.status >= 300 && result.status < 400 && headers.has("location")) {
    return new Response(null, { status: result.status, headers });
  }
  if (result.html !== undefined) {
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(result.html, { status: result.status, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}

function extractToken(request: NextRequest): string | undefined {
  const auth = request.headers.get("authorization");
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}
