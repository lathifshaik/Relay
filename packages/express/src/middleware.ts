import type { ActionDef, ActionGraph, BlockListConfig, ConnectOptions, RelayResponse, TokenStore } from "@relay/core";
import {
  MemoryTokenStore,
  RELAY_PROTOCOL_VERSION,
  RelayUpstreamError,
  createBlockList,
  handleConnectRoute,
  parseFormBody,
  resolveConnect,
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
  /**
   * Lets people connect agents to their own account: the agent gets a code,
   * the person approves it on /relay/approve, and the agent receives a token
   * scoped to what they allowed. Needs `signingKey` and `identify`.
   */
  connect?: ConnectOptions;
  /** Who is signed in, using your app's own login (session, cookie, ...). Return their user id. */
  identify?: (req: Request) => Promise<string | undefined> | string | undefined;
}

const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;

interface RelayLocal {
  isAgent: boolean;
  /** The user the agent acts for, when it connected through /relay/connect. */
  subject?: string;
  /** Action ids the agent's token allows. */
  scope?: readonly string[];
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
  // Connecting agents needs revocable tokens, so it brings a token store if none was given.
  const tokenStore = opts.tokenStore ?? (opts.connect ? new MemoryTokenStore() : undefined);
  const connect = resolveConnect(opts.connect, opts.signingKey, tokenStore);
  if (opts.connect && !connect) throw new Error("@relay/express: `connect` needs a signingKey");
  if (connect && !opts.identify) throw new Error("@relay/express: `connect` needs `identify` to know who is approving");

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
      ...(tokenStore !== undefined && { tokenStore }),
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

    if (!req.path.startsWith("/relay") && req.path !== "/.well-known/relay.json") return next();

    const token = extractToken(req);

    try {
      const connectResult = await handleConnectRoute(buildContext(req), connect, {
        method: req.method,
        path: req.path,
        query: Object.fromEntries(
          Object.entries(req.query).map(([k, v]) => [k, typeof v === "string" ? v : undefined]),
        ),
        body: await readBody(req),
        ...(req.get("content-type") !== undefined && { contentType: req.get("content-type") as string }),
        origin: `${req.protocol}://${req.get("host")}`,
        identify: async () => (opts.identify ? opts.identify(req) : undefined),
      });
      if (connectResult) return send(res, connectResult);

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
          async (action, validatedInputs, context) => {
            if (!handler) throw new Error(`No handler for action ${action.actionId}`);
            return invokeOriginalHandler(
              handler,
              req,
              res,
              validatedInputs,
              action.path,
              opts.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS,
              context.claims ? { subject: context.claims.sub, scope: context.claims.scope } : {},
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

function send(res: Response, result: RelayResponse): void {
  for (const [name, value] of Object.entries(result.headers ?? {})) res.setHeader(name, value);
  if (result.status >= 300 && result.status < 400 && result.headers?.["location"]) {
    res.status(result.status).end();
  } else if (result.html !== undefined) {
    res.status(result.status).type("html").send(result.html);
  } else {
    res.status(result.status).json(result.body);
  }
}

/** The request body, parsing form posts (the consent page) if no body parser did. */
async function readBody(req: Request): Promise<unknown> {
  if (req.body !== undefined && !(isEmptyObject(req.body) && req.readable)) return req.body;
  const type = req.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded") || !req.readable) return req.body;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) break;
    chunks.push(chunk as Buffer);
  }
  return parseFormBody(Buffer.concat(chunks).toString("utf8"));
}

function isEmptyObject(v: unknown): boolean {
  return v !== null && typeof v === "object" && Object.keys(v as object).length === 0;
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
  agent: { subject?: string; scope?: readonly string[] },
): Promise<unknown> {
  const relayLocal: RelayLocal = { isAgent: true, ...agent };

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
