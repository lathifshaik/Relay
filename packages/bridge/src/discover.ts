import type { ActionGraph, BlockListConfig, IOField } from "@relay/core";
import { RELAY_PROTOCOL_VERSION, isBlocked } from "@relay/core";
import { type HtmlForm, pageLines, parseHtml } from "./html.js";
import { apiActionId, placeholderNames, toolName } from "./infer.js";
import type { LayoutMemory } from "./layout.js";
import { explain } from "./meaning.js";
import { PolicyError, type SitePolicy, loadPolicy } from "./policy.js";
import { SPEC_PATHS, actionsFromOpenApi } from "./openapi.js";
import { type ScannedEndpoint, sameSite, scanJs } from "./scan-js.js";
import type { Session } from "./session.js";
import type { BridgeAction, BridgeGraph, FormFieldKind } from "./types.js";

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
  const finish = (actions: BridgeAction[], source: DiscoverySource, pages: string[] = []): DiscoverResult => ({
    source,
    policy,
    graph: {
      relayVersion: RELAY_PROTOCOL_VERSION,
      appName: start.hostname,
      baseUrl: start.origin,
      generatedAt: new Date().toISOString(),
      pages,
      actions: applyBlockList(dedupe(actions.map((a) => a.risk ? a : explain(a))), opts.blockList),
    },
  });

  const relay = await fetchJson(session, `${start.origin}/relay/manifest`);
  if (isActionGraph(relay)) {
    log("found a Relay manifest");
    return finish(actionsFromRelay(relay, start.origin), "relay");
  }

  for (const path of SPEC_PATHS) {
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
  finish: (actions: BridgeAction[], source: DiscoverySource, pages: string[]) => DiscoverResult,
): Promise<DiscoverResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const maxScripts = opts.maxScripts ?? DEFAULT_MAX_SCRIPTS;
  const visited = new Set<string>();
  const queue = [pageKey(start)];
  const scripts = new Set<string>();
  const endpoints: ScannedEndpoint[] = [];
  const actions: BridgeAction[] = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const url = queue.shift() as string;
    const pathname = new URL(url).pathname;
    if (visited.has(url) || isBlocked(pathname, opts.blockList)) continue;
    if (!policy.robots.allows(pathname)) {
      log(`skipping ${pathname} (robots.txt)`);
      continue;
    }
    visited.add(url);
    log(`reading ${new URL(url).pathname}`);

    const res = await session.request(url).catch(() => undefined);
    if (!res || res.status >= 400 || !res.contentType.includes("html")) continue;
    if (new URL(res.url).origin !== start.origin) continue;

    const page = parseHtml(res.text, res.url);
    opts.layout?.observe(res.url, pageLines(page, res.url));
    if (page.csrfToken) session.headers["x-csrf-token"] = page.csrfToken;
    for (const form of page.forms) {
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

  for (const src of [...scripts].slice(0, maxScripts)) {
    const res = await session.request(src).catch(() => undefined);
    if (res && res.status < 400) endpoints.push(...scanJs(res.text, start.origin));
  }
  log(`scanned ${Math.min(scripts.size, maxScripts)} scripts`);

  for (const e of endpoints) actions.push(endpointAction(e, start.origin));
  return finish(actions, "frontend", [...visited].map((k) => new URL(k).pathname));
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
  return actions.map((a) => (isBlocked(a.path, blockList) ? { ...a, relayAccess: "denied" as const } : a));
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
