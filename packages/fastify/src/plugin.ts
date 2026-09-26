import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
  parseFormBody,
  resolveConnect,
  handleAct,
  handleManifest,
  handleState,
  handleValidate,
  isSuccessStatus,
  methodHasBody,
} from "@relay/core";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { FastifyRouteCollector } from "./route-scanner.js";

export interface RelayFastifyOptions {
  appName: string;
  appVersion?: string;
  signingKey?: string;
  tokenStore?: TokenStore;
  blockList?: BlockListConfig;
  authDisabled?: boolean;
  buildState?: (
    request: FastifyRequest,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Lets people connect agents to their account (see @relay/core connect). Needs `signingKey` and `identify`. */
  connect?: ConnectOptions;
  /** Who is signed in, using your app's own auth. Return their user id. */
  identify?: (request: FastifyRequest) => Promise<string | undefined> | string | undefined;
}

export interface RelayAgent {
  /** The user the agent acts for. */
  subject: string;
  scope: readonly string[];
}

declare module "fastify" {
  interface FastifyReply {
    relayRespond(data: unknown): FastifyReply;
  }
  interface FastifyRequest {
    /** Set when an agent calls this route through /relay/act: who it acts for. */
    relayAgent: RelayAgent | null;
  }
}

const AGENT_HEADER = "x-relay-agent";

const plugin: FastifyPluginAsync<RelayFastifyOptions> = async (fastify, opts) => {
  const collector = new FastifyRouteCollector();
  collector.attach(fastify);

  const blockList = opts.blockList ?? createBlockList();
  const tokenStore = opts.tokenStore ?? (opts.connect ? new MemoryTokenStore() : undefined);
  const connect = resolveConnect(opts.connect, opts.signingKey, tokenStore);
  if (opts.connect && !connect) throw new Error("@relay/fastify: `connect` needs a signingKey");
  if (connect && !opts.identify) throw new Error("@relay/fastify: `connect` needs `identify` to know who is approving");

  // Who an agent acts for travels to replayed routes in a header signed with a
  // key that only exists in this process; the header is stripped from every
  // incoming request, so it can't be supplied from outside.
  const agentKey = randomBytes(32);
  fastify.decorateRequest("relayAgent", null);
  fastify.addHook("onRequest", async (request) => {
    const header = request.headers[AGENT_HEADER];
    delete request.headers[AGENT_HEADER];
    if (typeof header === "string") request.relayAgent = openAgentHeader(header, agentKey) ?? null;
  });

  // The consent page posts a plain HTML form.
  if (connect && !fastify.hasContentTypeParser("application/x-www-form-urlencoded")) {
    fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
      done(null, parseFormBody(body as string));
    });
  }

  // Convenience alias for reply.send — keeps the dev-facing API consistent across adapters.
  fastify.decorateReply("relayRespond", function (this: FastifyReply, data: unknown) {
    return this.send(data);
  });

  let cachedGraph: ActionGraph | undefined;
  const buildGraph = (): ActionGraph => {
    if (cachedGraph) return cachedGraph;
    cachedGraph = {
      relayVersion: RELAY_PROTOCOL_VERSION,
      appName: opts.appName,
      ...(opts.appVersion !== undefined && { appVersion: opts.appVersion }),
      generatedAt: new Date().toISOString(),
      actions: collector.actions.map((d) => d.action),
    };
    return cachedGraph;
  };

  const buildCtx = (): EmitterContext => ({
    graph: buildGraph(),
    blockList,
    ...(opts.signingKey !== undefined && { signingKey: opts.signingKey }),
    ...(tokenStore !== undefined && { tokenStore }),
    authDisabled: opts.authDisabled ?? !opts.signingKey,
  });

  const connectRoute = async (request: FastifyRequest, reply: FastifyReply) => {
    const url = new URL(request.url, `${request.protocol}://${request.host}`);
    const result = await handleConnectRoute(buildCtx(), connect, {
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: request.body ?? {},
      contentType: request.headers["content-type"] ?? "",
      origin: url.origin,
      identify: async () => (opts.identify ? opts.identify(request) : undefined),
    });
    if (!result) return reply.callNotFound();
    return sendResult(reply, result);
  };
  fastify.get("/.well-known/relay.json", connectRoute);
  fastify.post("/relay/connect", connectRoute);
  fastify.post("/relay/connect/token", connectRoute);
  fastify.route({ method: ["GET", "POST"], url: "/relay/approve", handler: connectRoute });
  fastify.get("/relay/connections", connectRoute);
  fastify.post("/relay/connections/:id/revoke", connectRoute);

  fastify.get("/relay/manifest", async (request, reply) => {
    const result = await handleManifest(buildCtx(), { token: extractToken(request) });
    return reply.status(result.status).send(result.body);
  });

  fastify.get("/relay/state", async (request, reply) => {
    const result = await handleState(buildCtx(), { token: extractToken(request) }, () =>
      opts.buildState ? opts.buildState(request) : {},
    );
    return reply.status(result.status).send(result.body);
  });

  fastify.post("/relay/validate", async (request, reply) => {
    const body = (request.body ?? {}) as { actionId?: unknown };
    const actionId = typeof body.actionId === "string" ? body.actionId : "";
    const result = await handleValidate(
      buildCtx(),
      { token: extractToken(request), body: request.body },
      actionId,
    );
    return reply.status(result.status).send(result.body);
  });

  fastify.post<{ Params: { actionId: string } }>(
    "/relay/act/:actionId",
    async (request, reply) => {
      const { actionId } = request.params;

      const result = await handleAct(
        buildCtx(),
        { token: extractToken(request), body: request.body },
        actionId,
        async (action, validatedInputs, context) =>
          invokeViaInject(
            fastify,
            collector,
            action.actionId,
            validatedInputs,
            context.claims
              ? sealAgentHeader({ subject: context.claims.sub, scope: context.claims.scope }, agentKey)
              : undefined,
          ),
      );
      return reply.status(result.status).send(result.body);
    },
  );
};

// Make this plugin un-encapsulated so its onRoute hook captures user routes added at the top level.
(plugin as unknown as { [k: symbol]: boolean })[Symbol.for("skip-override")] = true;

export const relayPlugin = plugin;

function extractToken(request: FastifyRequest): string | undefined {
  const auth = request.headers["authorization"] ?? request.headers["Authorization" as keyof typeof request.headers];
  if (typeof auth !== "string") return undefined;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : undefined;
}

async function invokeViaInject(
  fastify: FastifyInstance,
  collector: FastifyRouteCollector,
  actionId: string,
  validatedInputs: Record<string, unknown>,
  agentHeader: string | undefined,
): Promise<unknown> {
  const found = collector.actions.find((d) => d.action.actionId === actionId);
  if (!found) throw new Error(`No route for action ${actionId}`);

  const method = found.action.method;
  const url = buildRouteUrl(found.routePath, method, validatedInputs);

  const headers: Record<string, string> = {};
  if (agentHeader) headers[AGENT_HEADER] = agentHeader;
  if (methodHasBody(method)) headers["content-type"] = "application/json";
  const injected = await fastify.inject({
    method,
    url,
    headers,
    ...(methodHasBody(method) && { payload: validatedInputs }),
  });

  if (!isSuccessStatus(injected.statusCode)) throw new RelayUpstreamError(injected.statusCode);
  if (!injected.body || injected.body.length === 0) return undefined;
  try {
    return JSON.parse(injected.body);
  } catch {
    return injected.body;
  }
}

function sendResult(reply: FastifyReply, result: RelayResponse): FastifyReply {
  reply.headers(result.headers ?? {});
  if (result.status >= 300 && result.status < 400 && result.headers?.["location"]) {
    return reply.status(result.status).send();
  }
  if (result.html !== undefined) return reply.status(result.status).type("text/html; charset=utf-8").send(result.html);
  return reply.status(result.status).send(result.body);
}

function sealAgentHeader(agent: RelayAgent, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(agent)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

function openAgentHeader(header: string, key: Buffer): RelayAgent | undefined {
  const [payload = "", sig = ""] = header.split(".");
  const expected = Buffer.from(createHmac("sha256", key).update(payload).digest("base64url"));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RelayAgent;
  } catch {
    return undefined;
  }
}
