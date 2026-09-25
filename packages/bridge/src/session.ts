export interface SessionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Cookie header to start with, e.g. copied from a logged-in browser. */
  cookie?: string;
  /** Bearer token to send on every request. */
  bearerToken?: string;
}

export interface SessionResponse {
  status: number;
  url: string;
  contentType: string;
  text: string;
}

export interface SessionRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 10;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const USER_AGENT = "relay-bridge/0.1 (+https://github.com/lathifshaik/Relay)";

/**
 * A minimal HTTP client that keeps cookies across requests the way a browser
 * tab would, so a login done once carries over to every later call.
 */
export class Session {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cookies = new Map<string, Map<string, string>>();
  private bearerToken: string | undefined;
  /** Extra headers replayed on every request (CSRF tokens and the like). */
  readonly headers: Record<string, string> = {};

  constructor(opts: SessionOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.bearerToken = opts.bearerToken;
    if (opts.cookie) this.seedCookies(opts.cookie);
  }

  setBearerToken(token: string): void {
    this.bearerToken = token;
  }

  hasCredentials(): boolean {
    return this.bearerToken !== undefined || [...this.cookies.values()].some((jar) => jar.size > 0);
  }

  cookieValue(host: string, name: string): string | undefined {
    return this.cookies.get(host)?.get(name);
  }

  async request(url: string, init: SessionRequest = {}): Promise<SessionResponse> {
    let current = new URL(url);
    let method = (init.method ?? "GET").toUpperCase();
    let body = init.body;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = {
        "user-agent": USER_AGENT,
        accept: "application/json, text/html;q=0.9, */*;q=0.8",
        ...this.headers,
        ...init.headers,
      };
      const cookie = this.cookieHeader(current.hostname);
      if (cookie) headers["cookie"] = cookie;
      if (this.bearerToken && !headers["authorization"]) {
        headers["authorization"] = `Bearer ${this.bearerToken}`;
      }

      const res = await this.fetchImpl(current, {
        method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
        ...(body !== undefined && method !== "GET" && method !== "HEAD" && { body }),
      });
      this.storeCookies(current.hostname, res.headers);

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, current);
        // 303, and 301/302 after a POST, turn into a GET — as browsers do.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        continue;
      }

      return {
        status: res.status,
        url: current.toString(),
        contentType: res.headers.get("content-type") ?? "",
        text: await readCapped(res),
      };
    }
    throw new Error(`Too many redirects starting at ${url}`);
  }

  private cookieHeader(host: string): string {
    const pairs: string[] = [];
    for (const [domain, jar] of this.cookies) {
      if (domain && host !== domain && !host.endsWith(`.${domain}`)) continue;
      for (const [name, value] of jar) pairs.push(`${name}=${value}`);
    }
    return pairs.join("; ");
  }

  private storeCookies(host: string, headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = (pair ?? "").indexOf("=");
      if (eq <= 0) continue;
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();
      let domain = host;
      let expired = value === "";
      for (const attr of attrs) {
        const [k, v = ""] = attr.split("=").map((s) => s.trim());
        const key = (k ?? "").toLowerCase();
        if (key === "domain" && v) domain = v.replace(/^\./, "");
        if (key === "max-age" && Number(v) <= 0) expired = true;
        if (key === "expires" && Date.parse(v) < Date.now()) expired = true;
      }
      const jar = this.cookies.get(domain) ?? new Map<string, string>();
      if (expired) jar.delete(name);
      else jar.set(name, value);
      this.cookies.set(domain, jar);
    }
  }

  private seedCookies(cookie: string): void {
    // Seeded cookies apply to every host until the site sets its own.
    const jar = new Map<string, string>();
    for (const part of cookie.split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
    this.cookies.set("", jar);
  }
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
