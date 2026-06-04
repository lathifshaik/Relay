import type { ActionDef, ActionGraph, BlockListConfig, TokenStore } from "@relay/core";
import {
  RELAY_PROTOCOL_VERSION,
  createBlockList,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
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
}

interface RelayLocal {
  isAgent: boolean;
  captured?: { data: unknown };
}

// Augment Express's global Request/Response so users get res.relayRespond / req.relay
// typed in their handlers. @types/express exposes the Express namespace globally.
// eslint-disable-next-line @typescript-eslint/no-namespace
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
            return invokeOriginalHandler(handler, req, res, validatedInputs, action.path);
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
): Promise<unknown> {
  const relayLocal: RelayLocal = { isAgent: true };

  const fakeReq = Object.create(originalReq) as RelayReq;
  fakeReq.body = validatedInputs;
  fakeReq.params = extractPathParams(routePath, validatedInputs) as Request["params"];
  fakeReq.query = {} as Request["query"];
  fakeReq.relay = relayLocal;

  const fakeRes = createCapturingResponse(originalRes, relayLocal);

  await new Promise<void>((resolve, reject) => {
    try {
      const ret: unknown = handler(fakeReq, fakeRes, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
      if (isPromiseLike(ret)) {
        (ret as Promise<unknown>).then(() => resolve(), reject);
      }
      // If handler is sync and called relayRespond, resolve next tick.
      queueMicrotask(() => resolve());
    } catch (err) {
      reject(err);
    }
  });

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

function createCapturingResponse(originalRes: Response, relayLocal: RelayLocal): Response {
  // The capturing response is a synthetic stand-in passed only to user handlers
  // during /relay/act invocation. Express's Response shape is huge — overriding
  // every method with type-perfect signatures bloats the code for no gain.
  // Cast through `unknown` once at the boundary.
  const fake = Object.create(originalRes) as Record<string, unknown>;
  fake["status"] = (_code: number) => fake;
  fake["json"] = (data: unknown) => {
    relayLocal.captured = { data };
    return fake;
  };
  fake["send"] = (data: unknown) => {
    relayLocal.captured = { data };
    return fake;
  };
  fake["relayRespond"] = (data: unknown) => {
    relayLocal.captured = { data };
    return fake;
  };
  fake["setHeader"] = () => fake;
  return fake as unknown as Response;
}
