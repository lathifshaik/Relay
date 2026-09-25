import type { HttpMethod } from "@relay/core";

export interface ScannedEndpoint {
  method: HttpMethod;
  /** Path (or absolute URL for another host) with `${…}` replaced by `:name`. */
  path: string;
  bodyKeys: string[];
  queryKeys: string[];
  /** False when only the URL string was found and the method is a guess. */
  confident: boolean;
}

const QUOTED = String.raw`(?<q>["'\x60])(?<path>(?:https?:\/\/[^"'\x60\s]+)?\/[^"'\x60\s]*?)\k<q>`;

// fetch("/x"), axios("/x"), $fetch("/x"), ky("/x")
const FETCH_CALL = new RegExp(String.raw`\b(?:fetch|axios|\$fetch|ky|request|useFetch|\$http)\s*\(\s*` + QUOTED, "g");
// anything.get("/x"), axios.post(`/x/${id}`) — the method comes from the call name.
const METHOD_CALL = new RegExp(String.raw`\.(get|post|put|patch|delete)\s*\(\s*` + QUOTED, "gi");
// Bare strings that look like API routes: "/api/…", "/v1/…", "/graphql".
const API_LITERAL = new RegExp(
  String.raw`(?<q>["'\x60])(?<path>(?:https?:\/\/[^"'\x60\s/]+)?\/(?:api|v\d+|graphql|rest|rpc|_api|ajax|json)(?:[/?][^"'\x60\s]*)?)\k<q>`,
  "g",
);
const METHOD_OPTION = /\bmethod\s*:\s*["'`](get|post|put|patch|delete)["'`]/i;
const STATIC_ASSET = /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|html?|txt|md)(\?|$)/i;
const CALL_WINDOW = 600;

/**
 * Finds the HTTP endpoints a frontend bundle calls. Plain pattern matching over
 * the source, so it works on minified bundles too; it cannot see URLs that are
 * assembled at runtime from pieces.
 */
export function scanJs(source: string, siteOrigin: string): ScannedEndpoint[] {
  const found = new Map<string, ScannedEndpoint>();
  const confidentPaths = new Set<string>();

  const add = (method: HttpMethod, raw: string, confident: boolean, rest: string) => {
    const parsed = normalisePath(raw, siteOrigin);
    if (!parsed) return;
    const key = `${method} ${parsed.path}`;
    const existing = found.get(key);
    const bodyKeys = method === "GET" || method === "DELETE" ? [] : bodyKeysIn(rest);
    if (existing) {
      existing.confident ||= confident;
      existing.bodyKeys = [...new Set([...existing.bodyKeys, ...bodyKeys])];
      existing.queryKeys = [...new Set([...existing.queryKeys, ...parsed.queryKeys])];
    } else {
      found.set(key, { method, path: parsed.path, bodyKeys, queryKeys: parsed.queryKeys, confident });
    }
    if (confident) confidentPaths.add(parsed.path);
  };

  for (const m of source.matchAll(FETCH_CALL)) {
    const rest = restOfCall(source, m.index + m[0].length);
    const method = METHOD_OPTION.exec(rest)?.[1] ?? "GET";
    add(method.toUpperCase() as HttpMethod, m.groups?.["path"] as string, true, rest);
  }
  for (const m of source.matchAll(METHOD_CALL)) {
    const rest = restOfCall(source, m.index + m[0].length);
    add((m[1] as string).toUpperCase() as HttpMethod, m.groups?.["path"] as string, true, rest);
  }
  for (const m of source.matchAll(API_LITERAL)) {
    const rest = restOfCall(source, m.index + m[0].length);
    const method = METHOD_OPTION.exec(rest)?.[1];
    add((method ?? "GET").toUpperCase() as HttpMethod, m.groups?.["path"] as string, method !== undefined, rest);
  }

  // A bare "/api/x" string next to a confident call for the same path is the
  // same endpoint, not an extra GET.
  return [...found.values()].filter((e) => e.confident || !confidentPaths.has(e.path));
}

/**
 * The source from `start` up to the end of the enclosing call — the first
 * unmatched closing bracket, or a `;` at the top level — so option lookups
 * never read into the next statement.
 */
function restOfCall(source: string, start: number): string {
  let depth = 0;
  const end = Math.min(source.length, start + CALL_WINDOW);
  for (let i = start; i < end; i++) {
    const c = source[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return source.slice(start, i);
      depth--;
    } else if (c === ";" && depth === 0) return source.slice(start, i);
  }
  return source.slice(start, end);
}

function normalisePath(raw: string, siteOrigin: string): { path: string; queryKeys: string[] } | undefined {
  let value = raw.replace(/\$\{([^}]*)\}/g, (_m, expr: string) => `:${paramName(expr)}`);
  if (/^https?:\/\//.test(value)) {
    let url: URL;
    try {
      url = new URL(value.replace(/:([A-Za-z_]\w*)/g, "__$1__"));
    } catch {
      return undefined;
    }
    if (!sameSite(url.hostname, new URL(siteOrigin).hostname)) return undefined;
    value = (url.origin === siteOrigin ? "" : url.origin) + url.pathname.replace(/__([A-Za-z_]\w*)__/g, ":$1") + url.search;
  }
  const [pathPart = "", query = ""] = value.split("?");
  if (!pathPart.startsWith("/") && !/^https?:/.test(pathPart)) return undefined;
  if (pathPart === "/" || pathPart.startsWith("//") || STATIC_ASSET.test(pathPart) || /\s/.test(pathPart)) {
    return undefined;
  }
  const queryKeys = query
    .split("&")
    .map((kv) => kv.split("=")[0] ?? "")
    .filter((k) => /^[A-Za-z_][\w.[\]-]*$/.test(k));
  return { path: pathPart.replace(/\/+$/, "") || "/", queryKeys };
}

function paramName(expr: string): string {
  const last = expr.trim().split(/[.\s()[\]]/).filter(Boolean).pop() ?? "";
  return /^[A-Za-z_]\w*$/.test(last) ? last : "param";
}

/** Keys of an object literal passed as the request body: JSON.stringify({a, b: 1}) or axios.post(url, {a}). */
function bodyKeysIn(rest: string): string[] {
  const literal =
    /JSON\.stringify\(\s*\{([^{}]*)\}/.exec(rest)?.[1] ?? /^\s*,\s*\{([^{}]*)\}/.exec(rest)?.[1];
  if (!literal) return [];
  const keys: string[] = [];
  for (const part of literal.split(",")) {
    const key = /^\s*["']?([A-Za-z_$][\w$]*)["']?\s*(?::|$)/.exec(part)?.[1];
    if (key && !part.trim().startsWith("...")) keys.push(key);
  }
  return keys;
}

export function sameSite(a: string, b: string): boolean {
  if (a === b) return true;
  const root = (h: string) => h.split(".").slice(-2).join(".");
  return a.includes(".") && b.includes(".") && root(a) === root(b);
}
