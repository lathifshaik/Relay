import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { ActionDef } from "./action-graph.js";
import { isBlocked } from "./block-list.js";
import type { EmitterContext, RelayResponse } from "./emitter.js";
import type { TokenStore } from "./token.js";
import { mintToken } from "./token.js";

type Awaitable<T> = T | Promise<T>;

/** An agent waiting for a person to approve it (RFC 8628 device authorization). */
export interface PendingConnection {
  deviceCodeHash: string;
  userCode: string;
  agentName: string;
  requestedScope: string[];
  createdAt: number;
  expiresAt: number;
  interval: number;
  lastPolledAt?: number;
  status: "pending" | "approved" | "denied";
  /** Held only until the agent's next poll collects it. */
  issued?: { token: string; expiresIn: number; scope: string[] };
}

/** An approved agent: what it may do, for whom, until when. */
export interface AgentGrant {
  jti: string;
  userId: string;
  agentName: string;
  scope: string[];
  createdAt: number;
  expiresAt: number;
}

/** Where pending requests and grants live. Swap the memory store for a database in production. */
export interface ConnectionStore {
  savePending(p: PendingConnection): Awaitable<void>;
  findPendingByDevice(deviceCodeHash: string): Awaitable<PendingConnection | undefined>;
  findPendingByUserCode(userCode: string): Awaitable<PendingConnection | undefined>;
  deletePending(deviceCodeHash: string): Awaitable<void>;
  saveGrant(g: AgentGrant): Awaitable<void>;
  listGrants(userId: string): Awaitable<AgentGrant[]>;
  findGrant(jti: string): Awaitable<AgentGrant | undefined>;
  deleteGrant(jti: string): Awaitable<void>;
}

export class MemoryConnectionStore implements ConnectionStore {
  private readonly pending = new Map<string, PendingConnection>();
  private readonly grants = new Map<string, AgentGrant>();

  savePending(p: PendingConnection): void {
    this.sweep();
    this.pending.set(p.deviceCodeHash, p);
  }
  findPendingByDevice(hash: string): PendingConnection | undefined {
    return this.pending.get(hash);
  }
  findPendingByUserCode(code: string): PendingConnection | undefined {
    for (const p of this.pending.values()) if (p.userCode === code) return p;
    return undefined;
  }
  deletePending(hash: string): void {
    this.pending.delete(hash);
  }
  saveGrant(g: AgentGrant): void {
    this.grants.set(g.jti, g);
  }
  listGrants(userId: string): AgentGrant[] {
    const now = Date.now();
    return [...this.grants.values()].filter((g) => g.userId === userId && g.expiresAt > now);
  }
  findGrant(jti: string): AgentGrant | undefined {
    return this.grants.get(jti);
  }
  deleteGrant(jti: string): void {
    this.grants.delete(jti);
  }
  private sweep(): void {
    const now = Date.now();
    for (const [k, p] of this.pending) if (p.expiresAt < now) this.pending.delete(k);
  }
}

export interface ConnectOptions {
  /** Where to send a signed-out person from the consent page. Gets the URL to come back to. */
  loginUrl?: string | ((returnTo: string) => string);
  store?: ConnectionStore;
  /** How long an approved agent's token lasts. Defaults to 7 days (max 30). */
  tokenTtlSeconds?: number;
  /** How long a code waits for approval. Defaults to 10 minutes. */
  codeTtlSeconds?: number;
  /** Seconds an agent must wait between polls. Defaults to 5. */
  pollIntervalSeconds?: number;
}

export interface ResolvedConnect {
  signingKey: string;
  tokenStore: TokenStore;
  store: ConnectionStore;
  loginUrl?: ConnectOptions["loginUrl"];
  tokenTtlSeconds: number;
  codeTtlSeconds: number;
  pollIntervalSeconds: number;
}

/** Fills in defaults once, so the store outlives single requests. Needs a signing key and a token store. */
export function resolveConnect(
  opts: ConnectOptions | undefined,
  signingKey: string | undefined,
  tokenStore: TokenStore | undefined,
): ResolvedConnect | undefined {
  if (!opts || !signingKey || !tokenStore) return undefined;
  return {
    signingKey,
    tokenStore,
    store: opts.store ?? new MemoryConnectionStore(),
    ...(opts.loginUrl !== undefined && { loginUrl: opts.loginUrl }),
    tokenTtlSeconds: opts.tokenTtlSeconds ?? 7 * 24 * 60 * 60,
    codeTtlSeconds: opts.codeTtlSeconds ?? 10 * 60,
    pollIntervalSeconds: opts.pollIntervalSeconds ?? 5,
  };
}

export interface ConnectRequest {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  body: unknown;
  contentType?: string;
  /** The site's origin as the person sees it, e.g. https://shop.example.com. */
  origin: string;
  /** Asks the app who is signed in, using its own login. Only called on the consent and connections pages. */
  identify: () => Awaitable<string | undefined>;
}

const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const MAX_AGENT_NAME = 80;

/**
 * Serves the agent-connection routes, or returns undefined for any other path:
 *
 * - `GET  /.well-known/relay.json` — tells agents this site speaks Relay
 * - `POST /relay/connect` — an agent asks to connect; gets a code for the person
 * - `POST /relay/connect/token` — the agent polls until the person decides
 * - `GET  /relay/approve` and `POST /relay/approve` — the consent page
 * - `GET  /relay/connections`, `POST /relay/connections/:id/revoke` — the person's agents
 */
export async function handleConnectRoute(
  ctx: EmitterContext,
  connect: ResolvedConnect | undefined,
  req: ConnectRequest,
): Promise<RelayResponse | undefined> {
  const { method, path } = req;
  if (method === "GET" && path === "/.well-known/relay.json") {
    return {
      status: 200,
      body: {
        agents: "allow",
        relayVersion: ctx.graph.relayVersion,
        manifest: "/relay/manifest",
        ...(connect && { connect: "/relay/connect" }),
      },
    };
  }
  const isConnectPath =
    path === "/relay/connect" ||
    path === "/relay/connect/token" ||
    path === "/relay/approve" ||
    path === "/relay/connections" ||
    /^\/relay\/connections\/[^/]+\/revoke$/.test(path);
  if (!isConnectPath) return undefined;
  if (!connect) return { status: 404, body: { error: "RELAY_CONNECT_DISABLED" } };

  if (method === "POST" && path === "/relay/connect") return startConnection(ctx, connect, req);
  if (method === "POST" && path === "/relay/connect/token") return pollConnection(connect, req);
  if (path === "/relay/approve" && (method === "GET" || method === "POST")) return consent(ctx, connect, req);
  if (method === "GET" && path === "/relay/connections") return listConnections(connect, req);
  const revoke = /^\/relay\/connections\/([^/]+)\/revoke$/.exec(path);
  if (method === "POST" && revoke) return revokeConnection(connect, req, decodeURIComponent(revoke[1] as string));
  return { status: 405, body: { error: "RELAY_METHOD_NOT_ALLOWED" } };
}

/** Actions a person could grant: they exist, aren't denied and aren't on the block list. */
export function grantableActions(ctx: EmitterContext): ActionDef[] {
  return ctx.graph.actions.filter((a) => a.relayAccess !== "denied" && !isBlocked(a.path, ctx.blockList));
}

async function startConnection(ctx: EmitterContext, connect: ResolvedConnect, req: ConnectRequest): Promise<RelayResponse> {
  const body = isRecord(req.body) ? req.body : {};
  const grantable = new Set(grantableActions(ctx).map((a) => a.actionId));
  const asked = Array.isArray(body["scope"]) ? body["scope"].filter((s): s is string => typeof s === "string") : [];
  const scope = asked.length > 0 ? asked.filter((s) => grantable.has(s)) : [...grantable];
  if (scope.length === 0) return { status: 400, body: { error: "invalid_scope" } };

  const deviceCode = randomBytes(32).toString("base64url");
  const userCode = newUserCode();
  const now = Date.now();
  await connect.store.savePending({
    deviceCodeHash: sha256(deviceCode),
    userCode,
    agentName: cleanName(body["agentName"]),
    requestedScope: [...new Set(scope)],
    createdAt: now,
    expiresAt: now + connect.codeTtlSeconds * 1000,
    interval: connect.pollIntervalSeconds,
    status: "pending",
  });

  const verification = `${req.origin}/relay/approve`;
  return {
    status: 200,
    body: {
      device_code: deviceCode,
      user_code: formatUserCode(userCode),
      verification_uri: verification,
      verification_uri_complete: `${verification}?code=${formatUserCode(userCode)}`,
      expires_in: connect.codeTtlSeconds,
      interval: connect.pollIntervalSeconds,
    },
    headers: { "cache-control": "no-store" },
  };
}

async function pollConnection(connect: ResolvedConnect, req: ConnectRequest): Promise<RelayResponse> {
  const body = isRecord(req.body) ? req.body : {};
  const deviceCode = typeof body["device_code"] === "string" ? body["device_code"] : "";
  const pending = deviceCode ? await connect.store.findPendingByDevice(sha256(deviceCode)) : undefined;
  const oauthError = (error: string) => ({ status: 400, body: { error }, headers: { "cache-control": "no-store" } });
  if (!pending) return oauthError("invalid_grant");

  const now = Date.now();
  if (pending.expiresAt < now && pending.status !== "approved") {
    await connect.store.deletePending(pending.deviceCodeHash);
    return oauthError("expired_token");
  }
  if (pending.status === "denied") {
    await connect.store.deletePending(pending.deviceCodeHash);
    return oauthError("access_denied");
  }
  if (pending.status === "approved" && pending.issued) {
    // The token is handed over exactly once.
    await connect.store.deletePending(pending.deviceCodeHash);
    return {
      status: 200,
      body: {
        access_token: pending.issued.token,
        token_type: "Bearer",
        expires_in: pending.issued.expiresIn,
        scope: pending.issued.scope.join(" "),
      },
      headers: { "cache-control": "no-store" },
    };
  }
  if (pending.lastPolledAt !== undefined && now - pending.lastPolledAt < pending.interval * 1000) {
    pending.interval += 5;
    pending.lastPolledAt = now;
    await connect.store.savePending(pending);
    return oauthError("slow_down");
  }
  pending.lastPolledAt = now;
  await connect.store.savePending(pending);
  return oauthError("authorization_pending");
}

async function consent(ctx: EmitterContext, connect: ResolvedConnect, req: ConnectRequest): Promise<RelayResponse> {
  const form = isRecord(req.body) ? req.body : {};
  const rawCode = req.method === "POST" ? String(form["code"] ?? "") : (req.query["code"] ?? "");
  const code = normaliseUserCode(rawCode);
  const userId = await req.identify();

  if (!userId) {
    const back = `/relay/approve${code ? `?code=${formatUserCode(code)}` : ""}`;
    const login = connect.loginUrl;
    if (login) {
      const target = typeof login === "function" ? login(back) : `${login}${login.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(back)}`;
      return { status: 302, body: null, headers: { location: target, "cache-control": "no-store" } };
    }
    return page(401, ctx.graph.appName, "<h1>Sign in first</h1><p>Sign in to this site, then open this link again.</p>");
  }

  if (!code) return page(200, ctx.graph.appName, codeEntryForm());
  const pending = await connect.store.findPendingByUserCode(code);
  if (!pending || pending.status !== "pending" || pending.expiresAt < Date.now()) {
    return page(404, ctx.graph.appName, `<h1>Code not found</h1><p>The code ${esc(formatUserCode(code))} is wrong or has expired. Ask the agent to start again.</p>${codeEntryForm()}`);
  }

  if (req.method === "GET") return page(200, ctx.graph.appName, consentForm(ctx, connect, pending, userId));

  if (!sameToken(String(form["csrf"] ?? ""), csrfToken(connect, code, userId))) {
    return page(403, ctx.graph.appName, "<h1>This form has expired</h1><p>Reload the page and try again.</p>");
  }
  if (form["decision"] !== "approve") {
    pending.status = "denied";
    await connect.store.savePending(pending);
    return page(200, ctx.graph.appName, `<h1>Denied</h1><p>${esc(pending.agentName)} was not connected. You can close this tab.</p>`);
  }

  const chosen = new Set(asList(form["scope"]));
  const granted = pending.requestedScope.filter((s) => chosen.has(s));
  if (granted.length === 0) {
    return page(400, ctx.graph.appName, `<p class="warn">Choose at least one thing the agent may do, or deny it.</p>${consentForm(ctx, connect, pending, userId)}`);
  }

  const { token, claims } = mintToken({
    subject: userId,
    scope: granted,
    ttlSeconds: connect.tokenTtlSeconds,
    signingKey: connect.signingKey,
  });
  await connect.store.saveGrant({
    jti: claims.jti,
    userId,
    agentName: pending.agentName,
    scope: granted,
    createdAt: Date.now(),
    expiresAt: claims.exp * 1000,
  });
  pending.status = "approved";
  pending.issued = { token, expiresIn: claims.exp - claims.iat, scope: granted };
  await connect.store.savePending(pending);
  return page(
    200,
    ctx.graph.appName,
    `<h1>Connected</h1><p>${esc(pending.agentName)} can now do the ${granted.length} thing${granted.length === 1 ? "" : "s"} you allowed, until ${esc(new Date(claims.exp * 1000).toUTCString())}. You can close this tab.</p>`,
  );
}

async function listConnections(connect: ResolvedConnect, req: ConnectRequest): Promise<RelayResponse> {
  const userId = await req.identify();
  if (!userId) return { status: 401, body: { error: "RELAY_SIGN_IN_REQUIRED" } };
  const grants = await connect.store.listGrants(userId);
  return {
    status: 200,
    body: {
      connections: grants.map((g) => ({
        id: g.jti,
        agentName: g.agentName,
        scope: g.scope,
        createdAt: new Date(g.createdAt).toISOString(),
        expiresAt: new Date(g.expiresAt).toISOString(),
      })),
    },
  };
}

async function revokeConnection(connect: ResolvedConnect, req: ConnectRequest, jti: string): Promise<RelayResponse> {
  // A JSON-only endpoint: a cross-site form can't send application/json without a CORS preflight.
  if (!(req.contentType ?? "").includes("application/json")) {
    return { status: 415, body: { error: "RELAY_JSON_REQUIRED" } };
  }
  const userId = await req.identify();
  if (!userId) return { status: 401, body: { error: "RELAY_SIGN_IN_REQUIRED" } };
  const grant = await connect.store.findGrant(jti);
  if (!grant || grant.userId !== userId) return { status: 404, body: { error: "RELAY_CONNECTION_NOT_FOUND" } };
  await connect.tokenStore.revoke(jti);
  await connect.store.deleteGrant(jti);
  return { status: 200, body: { revoked: true, id: jti } };
}

function consentForm(ctx: EmitterContext, connect: ResolvedConnect, pending: PendingConnection, userId: string): string {
  const byId = new Map(ctx.graph.actions.map((a) => [a.actionId, a]));
  const items = pending.requestedScope
    .map((id) => {
      const a = byId.get(id);
      const changes = a && a.method !== "GET";
      return `<li><label><input type="checkbox" name="scope" value="${esc(id)}" checked> ${esc(a?.label ?? id)}${
        changes ? ' <span class="tag">can change data</span>' : ""
      }<br><small>${esc(a ? `${a.method} ${a.path}` : id)}</small></label></li>`;
    })
    .join("");
  const minutes = Math.max(1, Math.round((pending.expiresAt - Date.now()) / 60000));
  return `<h1>Connect an agent?</h1>
<p>An agent calling itself <strong>${esc(pending.agentName)}</strong> <small>(name not verified)</small> wants to act for you on ${esc(ctx.graph.appName)}.</p>
<p class="warn">Only approve if you started connecting this agent yourself, just now. Never approve a code someone sent you.</p>
<form method="post" action="/relay/approve">
<input type="hidden" name="code" value="${esc(formatUserCode(pending.userCode))}">
<input type="hidden" name="csrf" value="${esc(csrfToken(connect, pending.userCode, userId))}">
<p>It may:</p><ul>${items}</ul>
<p><small>Access lasts ${Math.round(connect.tokenTtlSeconds / 86400) || 1} day(s) unless you revoke it. This request expires in ${minutes} min.</small></p>
<button type="submit" name="decision" value="approve">Approve</button>
<button type="submit" name="decision" value="deny" class="secondary">Deny</button>
</form>`;
}

function codeEntryForm(): string {
  return `<h1>Connect an agent</h1><form method="get" action="/relay/approve"><label>Code from the agent<br><input name="code" autocomplete="off" placeholder="XXXX-XXXX"></label> <button type="submit">Continue</button></form>`;
}

function page(status: number, appName: string, content: string): RelayResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect an agent · ${esc(appName)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b;background:#fff}ul{list-style:none;padding:0}li{margin:.6rem 0}small{color:#666}.tag{font-size:.75rem;background:#fff3cd;padding:.1rem .4rem;border-radius:.3rem}.warn{background:#fff3cd;padding:.6rem .8rem;border-radius:.4rem}button{font:inherit;padding:.5rem 1rem;border-radius:.4rem;border:1px solid #1b1b1b;background:#1b1b1b;color:#fff;cursor:pointer}.secondary{background:#fff;color:#1b1b1b}input[name=code]{font:inherit;padding:.4rem;letter-spacing:.1em}@media (prefers-color-scheme:dark){body{background:#141414;color:#eee}small{color:#aaa}.tag,.warn{background:#4a3f1a}button{border-color:#eee;background:#eee;color:#141414}.secondary{background:#141414;color:#eee}}</style></head><body>${content}</body></html>`;
  return {
    status,
    body: null,
    html,
    headers: {
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "x-frame-options": "DENY",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  };
}

function csrfToken(connect: ResolvedConnect, userCode: string, userId: string): string {
  return createHmac("sha256", connect.signingKey).update(`relay-consent:${userCode}:${userId}`).digest("base64url");
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function newUserCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return code;
}

export function normaliseUserCode(input: string): string {
  const code = input.toUpperCase().replace(/[^A-Z]/g, "");
  return code.length === 8 && [...code].every((c) => USER_CODE_ALPHABET.includes(c)) ? code : "";
}

function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_AGENT_NAME) : "";
  return name || "An unnamed agent";
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

/** Parses an `application/x-www-form-urlencoded` body; repeated keys become arrays. */
export function parseFormBody(text: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const existing = out[key];
    out[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return out;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
