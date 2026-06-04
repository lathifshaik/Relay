import type { ActionDef, ActionGraph, BlockListConfig, TokenStore } from "@relay/core";
import {
  RELAY_PROTOCOL_VERSION,
  createBlockList,
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
}

export function createRelayHandler(
  opts: RelayNextOptions,
): (request: NextRequest) => Promise<Response> {
  const blockList = opts.blockList ?? createBlockList();

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
    ...(opts.tokenStore !== undefined && { tokenStore: opts.tokenStore }),
    authDisabled: opts.authDisabled ?? !opts.signingKey,
  };

  return async (request: NextRequest): Promise<Response> => {
    const pathname = request.nextUrl.pathname;
    const method = request.method;
    const token = extractToken(request);

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
      const body = (await safeJson(request)) as { actionId?: unknown } | undefined;
      const actionId = body && typeof body.actionId === "string" ? body.actionId : "";
      return toResponse(await handleValidate(ctx, { token, body }, actionId));
    }

    const actMatch = pathname.match(/^\/relay\/act\/([^/]+)$/);
    if (method === "POST" && actMatch) {
      const actionId = actMatch[1] as string;
      const body = await safeJson(request);
      const unit = actionMap.get(actionId);
      const result = await handleAct(
        ctx,
        { token, body },
        actionId,
        async (action, validatedInputs) => {
          if (!unit) throw new Error(`No handler for action ${action.actionId}`);
          return unit._relayMeta.handler(validatedInputs, { request, params: {} });
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

function toResponse(result: { status: number; body: unknown }): Response {
  return NextResponse.json(result.body, { status: result.status });
}

function extractToken(request: NextRequest): string | undefined {
  const auth = request.headers.get("authorization");
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}
