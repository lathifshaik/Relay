import type { ActionDef, ActionGraph, BlockListConfig, TokenStore } from "@relay/core";
import {
  RELAY_PROTOCOL_VERSION,
  RelayUpstreamError,
  createBlockList,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
  isSuccessStatus,
} from "@relay/core";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { type DiscoveredAction, scanExpressRoutes } from "./route-scanner.js";

export interface RelayMiddlewareOptions {
  appName: string;
  appVersion?: string;
  signingKey?: string;
  tokenStore?: TokenStore;
  blockList?: BlockListConfig;
  authDisabled?: boolean;
  buildState?: (req: Request) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** How long /relay/act waits for a handler to respond. Defaults to 30s. */
  handlerTimeoutMs?: number;
}

const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;

interface RelayLocal {
  isAgent: boolean;
  captured?: { data: unknown };
}

// Augment Express's global Request/Response so users get res.relayRespond / req.relay
// typed in their handlers. @types/express exposes the Express namespace globally.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      relay?: RelayLocal;
    }
    interface Response {
      relayRespond(data: unknown): Response;
    }
  }
}

type RelayReq = Request & { relay?: RelayLocal };
type RelayRes = Response & { relayRespond: (data: unknown) => Response };

export function middleware(opts: RelayMiddlewareOptions): RequestHandler {
  let scanned: DiscoveredAction[] | undefined;
  let cachedGraph: ActionGraph | undefined;
  let handlersById: Map<string, DiscoveredAction["handler"]> | undefined;

  const blockList = opts.blockList ?? createBlockList();

  function ensureScanned(req: Request): {
    graph: ActionGraph;
    handlers: Map<string, DiscoveredAction["handler"]>;
  } {
    if (scanned && cachedGraph && handlersById) {
      return { graph: cachedGraph, handlers: handlersById };
    }
    scanned = scanExpressRoutes(req.app as unknown as Parameters<typeof scanExpressRoutes>[0]);
    const actions: ActionDef[] = scanned.map((d) => d.action);
    cachedGraph = {
      relayVersion: RELAY_PROTOCOL_VERSION,
      appName: opts.appName,
      ...(opts.appVersion !== undefined && { appVersion: opts.appVersion }),
      generatedAt: new Date().toISOString(),
      actions,
    };
    handlersById = new Map(scanned.map((d) => [d.action.actionId, d.handler]));
    return { graph: cachedGraph, handlers: handlersById };
  }

  function buildContext(req: Request): Parameters<typeof handleManifest>[0] {
    const { graph } = ensureScanned(req);
    return {
      graph,
      blockList,
      ...(opts.signingKey !== undefined && { signingKey: opts.signingKey }),
      ...(opts.tokenStore !== undefined && { tokenStore: opts.tokenStore }),
      authDisabled: opts.authDisabled ?? !opts.signingKey,
    };
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const relayRes = res as RelayRes;
    const relayReq = req as RelayReq;

    // Patch relayRespond once per response.
    if (typeof relayRes.relayRespond !== "function") {
      relayRes.relayRespond = function (data: unknown) {
        if (relayReq.relay?.isAgent) {
          relayReq.relay.captured = { data };
          return res;
        }
        return res.json(data);
      };
    }

    if (!req.path.startsWith("/relay")) return next();

    const token = extractToken(req);

    try {
      if (req.method === "GET" && req.path === "/relay/manifest") {
        const result = await handleManifest(buildContext(req), { token });
        return send(res, result);
      }

      if (req.method === "GET" && req.path === "/relay/state") {
        const result = await handleState(
          buildContext(req),
          { token },
          () => (opts.buildState ? opts.buildState(req) : {}),
        );
        return send(res, result);
      }

      if (req.method === "POST" && req.path === "/relay/validate") {
        const body = (req.body ?? {}) as { actionId?: unknown };
        const actionId = typeof body.actionId === "string" ? body.actionId : "";
        const result = await handleValidate(buildContext(req), { token, body: req.body }, actionId);
        return send(res, result);
      }

      const actMatch = req.path.match(/^\/relay\/act\/([^/]+)$/);
      if (req.method === "POST" && actMatch) {
        const actionId = actMatch[1] as string;
        const { handlers } = ensureScanned(req);
        const handler = handlers.get(actionId);

        const result = await handleAct(
          buildContext(req),
          { token, body: req.body },
          actionId,
          async (action, validatedInputs) => {
            if (!handler) throw new Error(`No handler for action ${action.actionId}`);
            return invokeOriginalHandler(
              handler,
              req,
              res,
              validatedInputs,
              action.path,
              opts.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
            );
          },
        );
        return send(res, result);
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function send(res: Response, result: { status: number; body: unknown }): void {
  res.status(result.status).json(result.body);
}

function extractToken(req: Request): string | undefined {
  const auth = req.header("authorization") ?? req.header("Authorization");
  if (!auth) return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

async function invokeOriginalHandler(
  handler: RequestHandler,
  originalReq: Request,
  originalRes: Response,
  validatedInputs: Record<string, unknown>,
  routePath: string,
  timeoutMs: number,
): Promise<unknown> {
  const relayLocal: RelayLocal = { isAgent: true };

  const fakeReq = Object.create(originalReq) as RelayReq;
  fakeReq.body = validatedInputs;
  fakeReq.params = extractPathParams(routePath, validatedInputs) as Request["params"];
  fakeReq.query = {} as Request["query"];
  fakeReq.relay = relayLocal;

  // Settle when the handler responds, calls next(), or its promise settles —
  // whichever comes first. Callback-style handlers respond later, so a sync
  // return alone is not a signal that the handler is done.
  const status = await new Promise<number>((resolve, reject) => {
    let settled = false;
    const finish = (err?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(fakeRes.statusCode);
    };
    const timer = setTimeout(
      () => finish(new Error(`Relay: handler did not respond within ${timeoutMs}ms`)),
      timeoutMs,
    );
    const fakeRes = createCapturingResponse(originalRes, relayLocal, () => finish());

    try {
      const ret: unknown = handler(fakeReq, fakeRes, (err?: unknown) => finish(err));
      if (isPromiseLike(ret)) {
        (ret as Promise<unknown>).then(
          () => {
            if (relayLocal.captured) finish();
          },
          (err: unknown) => finish(err ?? new Error("Handler rejected")),
        );
      }
    } catch (err) {
      finish(err);
    }
  });

  if (!isSuccessStatus(status)) throw new RelayUpstreamError(status);
  return relayLocal.captured?.data;
}

function isPromiseLike(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function extractPathParams(
  routePath: string,
  inputs: Record<string, unknown>,
): Record<string, string> {
  const params: Record<string, string> = {};
  const placeholders = routePath.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g);
  for (const m of placeholders) {
    const name = m[1] as string;
    const value = inputs[name];
    if (typeof value === "string") params[name] = value;
    else if (typeof value === "number") params[name] = String(value);
  }
  return params;
}

interface CapturingResponse extends Response {
  statusCode: number;
}

function createCapturingResponse(
  originalRes: Response,
  relayLocal: RelayLocal,
  onRespond: () => void,
): CapturingResponse {
  // The capturing response is a synthetic stand-in passed only to user handlers
  // during /relay/act invocation. Express's Response shape is huge — overriding
  // every method with type-perfect signatures bloats the code for no gain.
  // Cast through `unknown` once at the boundary.
  const fake = Object.create(originalRes) as Record<string, unknown>;
  const capture = (data: unknown) => {
    relayLocal.captured = { data };
    onRespond();
    return fake;
  };
  fake["statusCode"] = 200;
  fake["status"] = (code: number) => {
    fake["statusCode"] = code;
    return fake;
  };
  fake["sendStatus"] = (code: number) => {
    fake["statusCode"] = code;
    return capture(undefined);
  };
  fake["json"] = capture;
  fake["send"] = capture;
  fake["end"] = (data?: unknown) => capture(typeof data === "function" ? undefined : data);
  fake["relayRespond"] = capture;
  fake["setHeader"] = () => fake;
  fake["set"] = () => fake;
  fake["header"] = () => fake;
  fake["type"] = () => fake;
  return fake as unknown as CapturingResponse;
}
