import type { ActionGraph, BlockListConfig, IOField } from "@relay/core";
import { RELAY_PROTOCOL_VERSION, isBlocked } from "@relay/core";
import { type HtmlForm, pageLines, parseHtml } from "./html.js";
import { apiActionId, placeholderNames, toolName } from "./infer.js";
import type { LayoutMemory } from "./layout.js";
import { explain } from "./meaning.js";
import { PolicyError, type SitePolicy, loadPolicy } from "./policy.js";
import { SPEC_PATHS, actionsFromOpenApi } from "./openapi.js";
import { type ScannedEndpoint, sameSite, scanJs, scanServerActions } from "./scan-js.js";
import type { Session } from "./session.js";
import type { BridgeAction, BridgeGraph, FormFieldKind, UnresolvedAction } from "./types.js";

export interface DiscoverOptions {
  blockList: BlockListConfig;
  maxPages?: number;
  maxScripts?: number;
  /** Learns the site's page chrome from the pages read while discovering. */
  layout?: LayoutMemory;
  log?: (message: string) => void;
}

export type DiscoverySource = "relay" | "openapi" | "frontend";

export interface DiscoverResult {
  graph: BridgeGraph;
  source: DiscoverySource;
  policy: SitePolicy;
}

const DEFAULT_MAX_PAGES = 15;
const DEFAULT_MAX_SCRIPTS = 30;
const SKIP_LINK = /log\s*-?\s*out|sign\s*-?\s*out|delete|remove|unsubscribe|destroy/i;
const SKIP_EXTENSION = /\.(pdf|zip|png|jpe?g|gif|svg|webp|mp4|mp3|csv|xlsx?|docx?)$/i;
const MAX_SITEMAP_URLS = 500;
const MAX_FAILURES_IN_A_ROW = 3;
// Endpoints that manage the session itself. The bridge owns the session; an agent calling
// these would sign the person out, or into something else.
const SESSION_ENDPOINT =
  /(^|[/_-])(log-?out|sign-?out|log-?in|sign-?in|register|sign-?up|password|reset|verify|otp|2fa|mfa|refresh|oauth|callback|session|token)s?([/_-]|$)/i;
const SKIPPED_FIELD_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file", "password"]);

/**
 * Works out what an app can do, from the most to the least precise source:
 * its Relay manifest, then a published OpenAPI spec, then its frontend (API
 * calls in the JavaScript it ships, and the forms on its pages). Only GET
 * requests are made; nothing is submitted.
 */
export async function discover(
  session: Session,
  startUrl: string,
  opts: DiscoverOptions,
): Promise<DiscoverResult> {
  const start = new URL(startUrl);
  const log = opts.log ?? (() => {});
  const policy = await loadPolicy(session, start.origin);
  if (policy.agents === "deny") {
    throw new PolicyError(
      `${start.hostname} does not allow agents (${policy.source})${policy.message ? `: ${policy.message}` : ""}`,
    );
  }
  const finish = (
    actions: BridgeAction[],
    source: DiscoverySource,
    pages: string[] = [],
    unresolved: UnresolvedAction[] = [],
  ): DiscoverResult => ({
    source,
    policy,
    graph: {
      ...(unresolved.length > 0 && { unresolved }),
      relayVersion: RELAY_PROTOCOL_VERSION,
      appName: start.hostname,
      baseUrl: start.origin,
      generatedAt: new Date().toISOString(),
      pages,
      actions: applyBlockList(dedupe(actions.map((a) => a.risk ? a : explain(a))), opts.blockList),
    },
  });

  const relay = policy.robots.allows("/relay/manifest")
    ? await fetchJson(session, `${start.origin}/relay/manifest`)
    : undefined;
  if (isActionGraph(relay)) {
    log("found a Relay manifest");
    return finish(actionsFromRelay(relay, start.origin), "relay");
  }

  for (const path of SPEC_PATHS) {
    // Probing is crawling: skip spec locations robots.txt rules out.
    if (!policy.robots.allows(path)) continue;
    const spec = await fetchJson(session, `${start.origin}${path}`);
    const actions = spec === undefined ? [] : actionsFromOpenApi(spec, `${start.origin}${path}`);
    if (actions.length > 0) {
      log(`found an OpenAPI spec at ${path}`);
      return finish(actions, "openapi");
    }
  }

  if (policy.agents === "official-only") {
    throw new PolicyError(
      `${start.hostname} only allows agents through its official manifest or API spec, and publishes neither`,
    );
  }
  log("no manifest or spec; reading the frontend");
  return discoverFrontend(session, start, policy, opts, log, finish);
}

async function discoverFrontend(
  session: Session,
  start: URL,
  policy: SitePolicy,
  opts: DiscoverOptions,
  log: (message: string) => void,
  finish: (actions: BridgeAction[], source: DiscoverySource, pages: string[], unresolved: UnresolvedAction[]) => DiscoverResult,
): Promise<DiscoverResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const maxScripts = opts.maxScripts ?? DEFAULT_MAX_SCRIPTS;
  const visited = new Set<string>();
  const queue = [pageKey(start)];
  const scripts = new Set<string>();
  const endpoints: ScannedEndpoint[] = [];
  const actions: BridgeAction[] = [];
  const unresolved: UnresolvedAction[] = [];

  // The sitemap says which pages matter; read those before wandering through links.
  for (const url of await sitemapUrls(session, start, policy)) {
    const key = pageKey(new URL(url));
    if (!queue.includes(key)) queue.push(key);
  }

  const read = new Set<string>();
  const retried = new Set<string>();
  let attempts = 0;
  let failuresInARow = 0;
  while (queue.length > 0 && read.size < maxPages) {
    // A site that keeps failing gets left alone: stop instead of working through the queue.
    if (failuresInARow >= MAX_FAILURES_IN_A_ROW || attempts >= maxPages * 2) {
      log(`stopping the scan: ${failuresInARow >= MAX_FAILURES_IN_A_ROW ? "the site keeps failing" : "page budget used up"}`);
      break;
    }
    const url = queue.shift() as string;
    const pathname = new URL(url).pathname;
    if (visited.has(url) || isBlocked(pathname, opts.blockList)) continue;
    if (!policy.robots.allows(pathname)) {
      log(`skipping ${pathname} (robots.txt)`);
      continue;
    }
    visited.add(url);
    log(`reading ${new URL(url).pathname}`);

    attempts++;
    const res = await session.request(url).catch(() => undefined);
    if (!res || res.status >= 500) failuresInARow++;
    else failuresInARow = 0;
    if (res && [502, 503, 504].includes(res.status)) {
      // The site is struggling: ease off, and give this page one more go at the end.
      session.slowDown();
      log(`${pathname} → ${res.status}; slowing to ${session.requestsPerSecond.toFixed(1)} requests/s`);
      if (!retried.has(url)) {
        retried.add(url);
        visited.delete(url);
        queue.push(url);
      }
      continue;
    }
    if (!res || res.status >= 400 || !res.contentType.includes("html")) continue;
    read.add(url);
    if (new URL(res.url).origin !== start.origin) continue;

    const page = parseHtml(res.text, res.url);
    opts.layout?.observe(res.url, pageLines(page, res.url));
    if (page.csrfToken) session.headers["x-csrf-token"] = page.csrfToken;
    for (const form of page.forms) {
      if (!form.native && !form.hasPassword) {
        // No action or method: JavaScript submits it somewhere. Submitting the HTML
        // form would silently do nothing, so leave it for code reading.
        unresolved.push({
          kind: "js-form",
          name: form.name || `form ${form.index + 1}`,
          where: new URL(res.url).pathname,
          detail: "Submitted by JavaScript; where it goes is in the page's code.",
          fields: form.fields.map((f) => f.name).filter(Boolean),
        });
        continue;
      }
      const action = formAction(form, res.url);
      if (action) actions.push(action);
    }
    for (const source of page.inlineScripts) endpoints.push(...scanJs(source, start.origin));
    for (const src of page.scriptUrls) {
      const script = new URL(src);
      if (sameSite(script.hostname, start.hostname) && (script.origin !== start.origin || policy.robots.allows(script.pathname))) {
        scripts.add(src);
      }
    }
    for (const link of page.links) {
      const target = new URL(link.href);
      if (target.origin !== start.origin || SKIP_EXTENSION.test(target.pathname)) continue;
      if (SKIP_LINK.test(link.text) || SKIP_LINK.test(target.pathname)) continue;
      const next = pageKey(target);
      if (!visited.has(next)) queue.push(next);
    }
  }

  const serverActions = new Map<string, UnresolvedAction>();
  for (const src of [...scripts].slice(0, maxScripts)) {
    const res = await session.request(src).catch(() => undefined);
    if (!res || res.status >= 400) continue;
    endpoints.push(...scanJs(res.text, start.origin));
    for (const sa of scanServerActions(res.text)) {
      serverActions.set(sa.id, {
        kind: "server-action",
        name: sa.name,
        id: sa.id,
        where: new URL(src).pathname,
        detail: "Next.js Server Action; its arguments are defined by the component that calls it.",
      });
    }
  }
  unresolved.push(...serverActions.values());
  log(`scanned ${Math.min(scripts.size, maxScripts)} scripts`);

  for (const e of endpoints) actions.push(endpointAction(e, start.origin));
  return finish(actions, "frontend", [...read].map((k) => new URL(k).pathname), unresolved);
}

function endpointAction(e: ScannedEndpoint, origin: string): BridgeAction {
  const absolute = /^https?:/.test(e.path);
  const path = absolute ? new URL(e.path.replace(/:([A-Za-z_]\w*)/g, "__$1__")).pathname.replace(/__([A-Za-z_]\w*)__/g, ":$1") : e.path;
  const inputs: Record<string, IOField> = {};
  for (const name of placeholderNames(path)) inputs[name] = { type: "string", required: true };
  for (const key of e.queryKeys) inputs[key] ??= { type: "string" };
  for (const key of e.bodyKeys) inputs[key] ??= { type: "string" };
  const accepts = e.method !== "GET" && e.method !== "DELETE" && e.bodyKeys.length === 0;
  if (accepts) inputs["body"] = { type: "object", description: "JSON body; its fields could not be read from the frontend" };

  const action: BridgeAction = {
    actionId: apiActionId(e.method, path),
    method: e.method,
    path,
    label: `${e.method} ${path}`,
    description: `API endpoint called by the app's frontend${e.confident ? "" : " (method guessed)"}.`,
    inputs,
    returns: {},
    relayAccess: "allowed",
    target: { kind: "api", urlTemplate: absolute ? e.path : `${origin}${e.path}` },
  };
  return explain(action, { ...(e.hint && { hint: e.hint }), ...(e.message && { message: e.message }) });
}

function formAction(form: HtmlForm, pageUrl: string): BridgeAction | undefined {
  // Sign-in forms are not exposed as tools.
  if (form.hasPassword) return undefined;

  const inputs: Record<string, IOField> = {};
  const fields: Array<{ name: string; kind: FormFieldKind }> = [];
  for (const f of form.fields) {
    if (SKIPPED_FIELD_TYPES.has(f.type)) continue;
    const description = f.label ? { description: f.label } : {};
    const required = f.required ? { required: true } : {};
    if (f.type === "radio") {
      const existing = inputs[f.name];
      inputs[f.name] = { type: "enum", enum: [...(existing?.enum ?? []), ...f.options], ...required, ...description };
      if (!existing) fields.push({ name: f.name, kind: "radio" });
      continue;
    }
    if (inputs[f.name]) continue;
    let field: IOField;
    let kind: FormFieldKind = "text";
    if (f.tag === "select") {
      field = { type: "enum", enum: f.options };
      kind = "select";
    } else if (f.type === "checkbox") {
      field = { type: "boolean" };
      kind = "checkbox";
    } else if (f.type === "number" || f.type === "range") {
      field = { type: "number", ...(f.min !== undefined && { min: f.min }), ...(f.max !== undefined && { max: f.max }) };
    } else {
      field = {
        type: "string",
        ...(f.minLength !== undefined && { min: f.minLength }),
        ...(f.maxLength !== undefined && { max: f.maxLength }),
      };
    }
    inputs[f.name] = { ...field, ...required, ...description };
    fields.push({ name: f.name, kind });
  }
  if (fields.length === 0) return undefined;

  const path = new URL(pageUrl).pathname;
  const title = form.name || `form ${form.index + 1}`;
  return {
    actionId: toolName(`${title}_form`),
    method: form.method,
    path: new URL(form.action).pathname,
    label: `Submit the "${title}" form on ${path}`,
    description: "Fills in the form with the inputs, submits it, and returns the resulting page as text.",
    inputs,
    returns: { status: { type: "integer" }, url: { type: "string" }, text: { type: "string" } },
    relayAccess: "allowed",
    target: { kind: "form", pageUrl, formIndex: form.index, fields },
  };
}

function actionsFromRelay(graph: ActionGraph, origin: string): BridgeAction[] {
  return graph.actions.map((a) => ({
    ...a,
    target: {
      kind: "api" as const,
      urlTemplate: `${origin}/relay/act/${encodeURIComponent(a.actionId)}`,
      callMethod: "POST" as const,
    },
  }));
}

function applyBlockList(actions: BridgeAction[], blockList: BlockListConfig): BridgeAction[] {
  return actions.map((a) =>
    isBlocked(a.path, blockList) || isSessionEndpoint(a) ? { ...a, relayAccess: "denied" as const } : a,
  );
}

/** Changing the session (logout, login, reset…) is never an agent's action; reading it (GET /auth/me) is fine. */
function isSessionEndpoint(a: BridgeAction): boolean {
  return a.method !== "GET" && SESSION_ENDPOINT.test(a.path);
}

async function sitemapUrls(session: Session, start: URL, policy: SitePolicy): Promise<string[]> {
  const listed = policy.robots.sitemaps.map((u) => new URL(u, start.origin).toString());
  const sources = listed.length > 0 ? listed : [`${start.origin}/sitemap.xml`];
  const urls: string[] = [];
  for (const source of sources.slice(0, 3)) {
    const res = await session.request(source).catch(() => undefined);
    if (!res || res.status >= 400) continue;
    for (const m of res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      let url: URL;
      try {
        url = new URL((m[1] as string).replace(/&amp;/g, "&"));
      } catch {
        continue;
      }
      // Nested sitemap indexes and other hosts are skipped; pages are what matter here.
      if (url.origin !== start.origin || url.pathname.endsWith(".xml")) continue;
      if (!policy.robots.allows(url.pathname)) continue;
      urls.push(url.toString());
      if (urls.length >= MAX_SITEMAP_URLS) return urls;
    }
  }
  return urls;
}

function dedupe(actions: BridgeAction[]): BridgeAction[] {
  const byId = new Map<string, BridgeAction>();
  for (const a of actions) {
    const existing = byId.get(a.actionId);
    if (!existing) {
      byId.set(a.actionId, a);
      continue;
    }
    // Same form seen on several pages, or same endpoint seen in several bundles.
    if (existing.path === a.path && existing.method === a.method) continue;
    let n = 2;
    while (byId.has(`${a.actionId.slice(0, 60)}_${n}`)) n++;
    const id = `${a.actionId.slice(0, 60)}_${n}`;
    byId.set(id, { ...a, actionId: id });
  }
  return [...byId.values()];
}

async function fetchJson(session: Session, url: string): Promise<unknown> {
  const res = await session.request(url).catch(() => undefined);
  if (!res || res.status >= 400 || !res.contentType.includes("json")) return undefined;
  try {
    return JSON.parse(res.text);
  } catch {
    return undefined;
  }
}

function isActionGraph(value: unknown): value is ActionGraph {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as ActionGraph).relayVersion === "string" &&
    Array.isArray((value as ActionGraph).actions)
  );
}

function pageKey(url: URL): string {
  return `${url.origin}${url.pathname}`;
}
