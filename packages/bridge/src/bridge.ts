import { sanitiseValue } from "@relay/core";
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
}

export interface BridgeReply {
  status: number;
  body: unknown;
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
  readonly graph: BridgeGraph;
  readonly layout: LayoutMemory;
  readonly stats: BridgeStats = { requests: 0, bytesIn: 0, charsOut: 0, unchanged: 0 };
  private readonly session: Session;
  private readonly reads: ReadMemory = new Reads();
  private readonly log: (line: string) => void;
  private readonly onLearn: () => void;

  constructor(opts: BridgeOptions) {
    this.session = opts.session;
    this.graph = opts.graph;
    this.layout = opts.layout ?? new LayoutMemory();
    this.log = opts.log ?? (() => {});
    this.onLearn = opts.onLearn ?? (() => {});
  }

  /** Reads a page of the site. */
  async read(url: string, full = false): Promise<BridgeReply> {
    const res = await this.session.request(url);
    const path = new URL(res.url).pathname;
    if (!res.contentType.includes("html")) {
      return this.finish(`read ${path}`, toResult(res), `GET ${url}`, full);
    }
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
    };
    return this.finish(`read ${path}`, result, `GET ${url}`, full, hidden);
  }

  /** Runs one of the app's actions. */
  async act(action: BridgeAction, inputs: Record<string, unknown>, full = false): Promise<BridgeReply> {
    const result = await runAction(this.session, action, inputs);
    let hidden = 0;
    if (result.html && isTextBody(result.body)) {
      const stripped = this.layout.strip(result.body.url, result.body.text.split("\n"));
      hidden = stripped.hidden;
      result.body = { url: new URL(result.body.url).pathname, text: stripped.kept.join("\n") };
    }
    const isRead = callMethodOf(action) === "GET";
    // Writes always come back whole; only reads are compared with last time.
    const key = isRead ? `${action.actionId} ${JSON.stringify(inputs)}` : undefined;
    return this.finish(action.actionId, result, key, full, hidden);
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
