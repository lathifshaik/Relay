export interface SessionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Cookie header to start with, e.g. copied from a logged-in browser. */
  cookie?: string;
  /** Bearer token to send on every request. */
  bearerToken?: string;
  /** At most this many requests per second to the site. Defaults to 5. */
  ratePerSecond?: number;
}

export interface SessionResponse {
  status: number;
  /** Where the request ended up, after redirects. */
  url: string;
  /** Where it was sent. */
  requestUrl: string;
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
const DEFAULT_RATE = 5;
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * A minimal HTTP client that keeps cookies across requests the way a browser
 * tab would, so a login done once carries over to every later call.
 */
export class Session {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly cookies = new Map<string, Map<string, string>>();
  private bearerToken: string | undefined;
  private readonly minIntervalMs: number;
  private nextSlot = 0;
  /** Extra headers replayed on every request (CSRF tokens and the like). */
  readonly headers: Record<string, string> = {};

  constructor(opts: SessionOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.bearerToken = opts.bearerToken;
    this.minIntervalMs = 1000 / Math.max(0.1, opts.ratePerSecond ?? DEFAULT_RATE);
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

    let retried = false;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await this.takeTurn();
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

      // The site asked us to slow down: wait as told (briefly) and try once more.
      if ((res.status === 429 || res.status === 503) && !retried) {
        const wait = retryAfterMs(res.headers.get("retry-after"));
        if (wait !== undefined && wait <= MAX_RETRY_AFTER_MS) {
          retried = true;
          await res.body?.cancel();
          await sleep(wait);
          hop--;
          continue;
        }
      }

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
        requestUrl: url,
        contentType: res.headers.get("content-type") ?? "",
        text: await readCapped(res),
      };
    }
    throw new Error(`Too many redirects starting at ${url}`);
  }

  /** Spaces requests out so the bridge never floods a site. */
  private async takeTurn(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + this.minIntervalMs;
    if (at > now) await sleep(at - now);
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

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
