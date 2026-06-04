import type { ActionDef, ActionGraph } from "./action-graph.js";
import type { BlockListConfig } from "./block-list.js";
import { isBlocked } from "./block-list.js";
import { projectOutput } from "./projection.js";
import { sanitiseError } from "./sanitiser.js";
import type { TokenClaims, TokenStore } from "./token.js";
import { hasScope, verifyToken } from "./token.js";
import { validateInput } from "./validator.js";

export interface EmitterContext {
  graph: ActionGraph;
  blockList: BlockListConfig;
  signingKey?: string;
  tokenStore?: TokenStore;
  /**
   * When true, requests without a token are accepted. Convenient for local
   * development and the M2 demo. Production deployments must set signingKey.
   */
  authDisabled?: boolean;
}

export interface RelayRequest {
  token?: string | undefined;
  body?: unknown;
}

export interface RelayResponse {
  status: number;
  body: unknown;
}

export type InvokeOriginalHandler = (
  action: ActionDef,
  validatedInputs: Record<string, unknown>,
) => Promise<unknown> | unknown;

interface AuthOk {
  ok: true;
  claims?: TokenClaims;
}
interface AuthFail {
  ok: false;
  response: RelayResponse;
}

async function authenticate(ctx: EmitterContext, req: RelayRequest): Promise<AuthOk | AuthFail> {
  if (ctx.authDisabled || !ctx.signingKey) return { ok: true };
  if (!req.token) {
    return {
      ok: false,
      response: { status: 401, body: { error: "RELAY_UNAUTHENTICATED", consent_required: false } },
    };
  }
  const result = await verifyToken(req.token, ctx.signingKey, ctx.tokenStore);
  if (!result.ok) {
    return {
      ok: false,
      response: { status: 401, body: { error: "RELAY_TOKEN_INVALID", reason: result.reason } },
    };
  }
  return { ok: true, claims: result.claims };
}

export async function handleManifest(
  ctx: EmitterContext,
  req: RelayRequest,
): Promise<RelayResponse> {
  const auth = await authenticate(ctx, req);
  if (!auth.ok) return auth.response;
  return { status: 200, body: ctx.graph };
}

export async function handleValidate(
  ctx: EmitterContext,
  req: RelayRequest,
  actionId: string,
): Promise<RelayResponse> {
  const auth = await authenticate(ctx, req);
  if (!auth.ok) return auth.response;

  const action = findActionInGraph(ctx.graph, actionId);
  if (!action) return notFound(actionId);

  if (auth.claims && !hasScope(auth.claims, actionId)) return outOfScope(actionId);

  const inputs = extractInputs(req.body);
  const result = validateInput(action.inputs, inputs);
  if (!result.ok) return { status: 400, body: result.error };
  return { status: 200, body: { ok: true, actionId } };
}

export async function handleAct(
  ctx: EmitterContext,
  req: RelayRequest,
  actionId: string,
  invoke: InvokeOriginalHandler,
): Promise<RelayResponse> {
  const auth = await authenticate(ctx, req);
  if (!auth.ok) return auth.response;

  const action = findActionInGraph(ctx.graph, actionId);
  if (!action) return notFound(actionId);

  if (isBlocked(action.path, ctx.blockList) || action.relayAccess === "denied") {
    return { status: 403, body: { error: "RELAY_FORBIDDEN", actionId } };
  }

  if (auth.claims && !hasScope(auth.claims, actionId)) return outOfScope(actionId);

  const inputs = extractInputs(req.body);
  const validation = validateInput(action.inputs, inputs);
  if (!validation.ok) return { status: 400, body: validation.error };

  let captured: unknown;
  try {
    captured = await invoke(action, validation.value);
  } catch (err) {
    return { status: 500, body: sanitiseError(err) };
  }

  return { status: 200, body: projectOutput(action.returns, captured) };
}

export async function handleState(
  ctx: EmitterContext,
  req: RelayRequest,
  buildState: () => Promise<Record<string, unknown>> | Record<string, unknown>,
): Promise<RelayResponse> {
  const auth = await authenticate(ctx, req);
  if (!auth.ok) return auth.response;
  const state = await buildState();
  return { status: 200, body: state };
}

function findActionInGraph(graph: ActionGraph, actionId: string): ActionDef | undefined {
  return graph.actions.find((a) => a.actionId === actionId);
}

function notFound(actionId: string): RelayResponse {
  return { status: 404, body: { error: "RELAY_ACTION_NOT_FOUND", actionId } };
}

function outOfScope(actionId: string): RelayResponse {
  return { status: 403, body: { error: "RELAY_OUT_OF_SCOPE", actionId } };
}

function extractInputs(body: unknown): unknown {
  if (body === null || typeof body !== "object") return {};
  const obj = body as Record<string, unknown>;
  if ("inputs" in obj) return obj["inputs"];
  return obj;
}
