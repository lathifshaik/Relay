import { sanitiseValue } from "@relay/core";
import { looksSignedOut, signedOutMessage } from "./auth.js";
import { type ReadMemory, ReadMemory as Reads } from "./changes.js";
import { type ActionResult, callMethodOf, runAction, toResult } from "./execute.js";
import { pageLines, parseHtml } from "./html.js";
import { LayoutMemory } from "./layout.js";
import type { Session } from "./session.js";
import type { BridgeAction, BridgeGraph } from "./types.js";

export interface BridgeOptions {
  session: Session;
  graph: BridgeGraph;
  layout?: LayoutMemory;
  /** Called with one line per request, describing what was read and what was sent on. */
  log?: (line: string) => void;
  /** Called after the bridge learns something worth saving (the site's layout). */
  onLearn?: () => void;
  /** Called when an action no longer matches the app, so the site can be re-read. */
  onStale?: (action: BridgeAction, reason: string) => void;
}

export interface BridgeReply {
  status: number;
  body: unknown;
  /** Something the agent should know about this reply, e.g. that its shape changed. */
  note?: string;
}

export interface BridgeStats {
  requests: number;
  bytesIn: number;
  charsOut: number;
  unchanged: number;
}

/**
 * The part between the MCP tools and the app. Keeps what the agent receives
 * small: repeated page chrome is hidden, and a read that was made before
 * returns only what changed since.
 */
export class Bridge {
  graph: BridgeGraph;
  readonly layout: LayoutMemory;
  readonly stats: BridgeStats = { requests: 0, bytesIn: 0, charsOut: 0, unchanged: 0 };
  private readonly session: Session;
  private readonly reads: ReadMemory = new Reads();
  private readonly log: (line: string) => void;
  private readonly onLearn: () => void;
  private readonly onStale: (action: BridgeAction, reason: string) => void;
  /** Top-level keys of each action's first good JSON reply. */
  private readonly shapes = new Map<string, string[]>();

  constructor(opts: BridgeOptions) {
    this.session = opts.session;
    this.graph = opts.graph;
    this.layout = opts.layout ?? new LayoutMemory();
    this.log = opts.log ?? (() => {});
    this.onLearn = opts.onLearn ?? (() => {});
    this.onStale = opts.onStale ?? (() => {});
  }

  /** Reads a page of the site. */
  async read(url: string, full = false): Promise<BridgeReply> {
    const res = await this.session.request(url);
    const path = new URL(res.url).pathname;
    if (!res.contentType.includes("html")) {
      return this.finish(`read ${path}`, toResult(res), `GET ${url}`, full);
    }
    if (looksSignedOut(res)) return this.signedOut(`read ${path}`, Buffer.byteLength(res.text));
    const page = parseHtml(res.text, res.url);
    const { kept, hidden } = this.layout.strip(res.url, pageLines(page, res.url));
    this.onLearn();
    const body: Record<string, unknown> = { url: path, title: page.title, text: kept.join("\n") };
    if (hidden > 0) body["hidden"] = `${hidden} lines of site navigation/header/footer (same on every page)`;
    const result: ActionResult = {
      status: res.status,
      body: sanitiseValue(body),
      bytes: Buffer.byteLength(res.text),
      html: false,
      signedOut: false,
      contentType: res.contentType,
    };
    return this.finish(`read ${path}`, result, `GET ${url}`, full, hidden);
  }

  /** Runs one of the app's actions. */
  async act(action: BridgeAction, inputs: Record<string, unknown>, full = false): Promise<BridgeReply> {
    const result = await runAction(this.session, action, inputs);
    if (result.signedOut) return this.signedOut(action.actionId, result.bytes);

    const stale = staleReason(action, result);
    if (stale) {
      this.log(`${action.actionId} → ${result.status} · endpoint changed: ${stale}`);
      this.onStale(action, stale);
      return {
        status: result.status,
        body: {
          error: "ENDPOINT_CHANGED",
          message: `${action.actionId} no longer works as mapped (${stale}). The bridge is re-reading the site; the tool list will update shortly.`,
        },
      };
    }
    const drift = this.shapeDrift(action, result);
    let hidden = 0;
    if (result.html && isTextBody(result.body)) {
      const stripped = this.layout.strip(result.body.url, result.body.text.split("\n"));
      hidden = stripped.hidden;
      result.body = { url: new URL(result.body.url).pathname, text: stripped.kept.join("\n") };
    }
    const isRead = callMethodOf(action) === "GET";
    // Writes always come back whole; only reads are compared with last time.
    const key = isRead ? `${action.actionId} ${JSON.stringify(inputs)}` : undefined;
    const reply = this.finish(action.actionId, result, key, full, hidden);
    if (drift) {
      reply.note = drift;
      this.log(`${action.actionId} · ${drift}`);
    }
    return reply;
  }

  /** Notices when a reply lost fields it used to have: the app changed underneath. */
  private shapeDrift(action: BridgeAction, result: ActionResult): string | undefined {
    if (result.status >= 400 || result.html || !isRecord(result.body)) return undefined;
    const keys = Object.keys(result.body);
    const before = this.shapes.get(action.actionId);
    if (!before) {
      this.shapes.set(action.actionId, keys);
      return undefined;
    }
    const missing = before.filter((k) => !keys.includes(k));
    return missing.length > 0 ? `reply no longer has: ${missing.join(", ")} (the app may have changed)` : undefined;
  }

  private signedOut(label: string, bytes: number): BridgeReply {
    this.log(`${label} → signed out · ${kb(bytes)} in · ask the user to run relay-bridge login`);
    this.stats.requests++;
    this.stats.bytesIn += bytes;
    return { status: 401, body: { error: "SIGNED_OUT", message: signedOutMessage(this.graph.baseUrl) } };
  }

  private finish(
    label: string,
    result: ActionResult,
    memoryKey: string | undefined,
    full: boolean,
    hidden = 0,
  ): BridgeReply {
    let body = result.body;
    let note = "";
    if (memoryKey !== undefined && result.status < 400) {
      const compared = this.reads.compare(memoryKey, result.body);
      if (!full && "unchanged" in compared) {
        body = { unchanged: true };
        note = "unchanged since last read";
        this.stats.unchanged++;
      } else if (!full && "changes" in compared) {
        body = { changes: compared.changes };
        note = `${compared.changes.length} change${compared.changes.length === 1 ? "" : "s"} since last read`;
      }
    }

    const reply: BridgeReply = { status: result.status, body };
    const out = JSON.stringify(reply).length;
    this.stats.requests++;
    this.stats.bytesIn += result.bytes;
    this.stats.charsOut += out;

    const details = [hidden > 0 ? `${hidden} layout lines hidden` : "", note].filter(Boolean).join(", ");
    this.log(
      `${label} → ${result.status} · ${kb(result.bytes)} in → ${kb(out)} out` +
        (result.bytes > 0 ? ` (${Math.max(0, Math.round((1 - out / result.bytes) * 100))}% smaller)` : "") +
        (details ? ` · ${details}` : ""),
    );
    return reply;
  }
}

/** Signs that an endpoint the map points at has moved or gone. */
function staleReason(action: BridgeAction, result: ActionResult): string | undefined {
  if (action.target.kind !== "api") return undefined;
  if (result.status === 405) return "the app no longer accepts this method here";
  if (result.status === 410) return "the app says this endpoint is gone";
  if (result.status === 404 && !action.path.includes(":")) return "the endpoint returned 404";
  if (result.status < 400 && result.html && !action.target.urlTemplate.includes("/relay/")) {
    return "got a web page where data was expected";
  }
  return undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isTextBody(body: unknown): body is { url: string; text: string } {
  return (
    body !== null &&
    typeof body === "object" &&
    typeof (body as { url?: unknown }).url === "string" &&
    typeof (body as { text?: unknown }).text === "string"
  );
}

function kb(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}
