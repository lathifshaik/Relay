export interface RelayClientOptions {
  token?: string;
  fetchImpl?: typeof fetch;
  /** Abort a request to the Relay app after this long. Defaults to 30s. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface RelayCallResult {
  status: number;
  body: unknown;
}

export class RelayClient {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: RelayClientOptions = {}) {
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getManifest(baseUrl: string): Promise<RelayCallResult> {
    return this.request(joinUrl(baseUrl, "/relay/manifest"), { method: "GET" });
  }

  getState(baseUrl: string): Promise<RelayCallResult> {
    return this.request(joinUrl(baseUrl, "/relay/state"), { method: "GET" });
  }

  act(
    baseUrl: string,
    actionId: string,
    inputs: Record<string, unknown>,
  ): Promise<RelayCallResult> {
    return this.request(
      joinUrl(baseUrl, `/relay/act/${encodeURIComponent(actionId)}`),
      {
        method: "POST",
        body: JSON.stringify({ inputs }),
      },
    );
  }

  validate(
    baseUrl: string,
    actionId: string,
    inputs: Record<string, unknown>,
  ): Promise<RelayCallResult> {
    return this.request(joinUrl(baseUrl, "/relay/validate"), {
      method: "POST",
      body: JSON.stringify({ actionId, inputs }),
    });
  }

  private async request(url: string, init: RequestInit): Promise<RelayCallResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const response = await this.fetchImpl(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();
    let body: unknown = text;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        // leave as raw text
      }
    } else {
      body = null;
    }
    return { status: response.status, body };
  }
}

function joinUrl(base: string, path: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}${path}`;
}
