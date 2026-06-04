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
}

declare module "fastify" {
  interface FastifyReply {
    relayRespond(data: unknown): FastifyReply;
  }
}

const plugin: FastifyPluginAsync<RelayFastifyOptions> = async (fastify, opts) => {
  const collector = new FastifyRouteCollector();
  collector.attach(fastify);

  const blockList = opts.blockList ?? createBlockList();

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
    ...(opts.tokenStore !== undefined && { tokenStore: opts.tokenStore }),
    authDisabled: opts.authDisabled ?? !opts.signingKey,
  });

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
        async (action, validatedInputs) =>
          invokeViaInject(fastify, collector, action.actionId, validatedInputs),
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
): Promise<unknown> {
  const found = collector.actions.find((d) => d.action.actionId === actionId);
  if (!found) throw new Error(`No route for action ${actionId}`);

  const url = substitutePathParams(found.routePath, validatedInputs);
  const method = found.action.method;

  const injected = await fastify.inject({
    method,
    url,
    payload: validatedInputs,
    headers: { "content-type": "application/json" },
  });

  if (!injected.body || injected.body.length === 0) return undefined;
  try {
    return JSON.parse(injected.body);
  } catch {
    return injected.body;
  }
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
