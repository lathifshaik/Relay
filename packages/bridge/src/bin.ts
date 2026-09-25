import { readFile, writeFile } from "node:fs/promises";
import { createBlockList } from "@relay/core";
import { DEFAULT_CACHE_DIR, loadSite, saveSite } from "./cache.js";
import { discover } from "./discover.js";
import { LayoutMemory } from "./layout.js";
import { exposedActions, runBridgeServer } from "./server.js";
import { Session } from "./session.js";
import type { BridgeGraph } from "./types.js";

const USAGE = `Usage: relay-bridge <url> [options]

Turns a web app into an MCP server (stdio). Reads the app's Relay manifest,
OpenAPI spec, or frontend code to find what it can do.

Options:
  --scan             Print the discovered actions as JSON and exit
  --save <file>      Also write the discovered actions to <file>
  --graph <file>     Use actions saved earlier instead of discovering again
  --read-only        Only expose actions that read (GET)
  --max-pages <n>    Pages to read when scanning the frontend (default 15)
  --refresh          Rescan the site even if a saved map is recent
  --no-cache         Don't read or write the saved map
  --cache-dir <dir>  Where site maps are kept (default ~/.relay-bridge)

The map of each site (its actions and page layout) is saved and reused for
24 hours, so restarts don't rescan the whole site.

Your session (optional, for pages behind a login):
  RELAY_BRIDGE_TOKEN   Bearer token sent as Authorization
  RELAY_BRIDGE_COOKIE  Cookie header copied from your logged-in browser
`;

interface Args {
  url?: string;
  scan: boolean;
  save?: string;
  graph?: string;
  readOnly: boolean;
  maxPages?: number;
  refresh: boolean;
  cache: boolean;
  cacheDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { scan: false, readOnly: false, refresh: false, cache: true, cacheDir: DEFAULT_CACHE_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--scan") args.scan = true;
    else if (a === "--read-only") args.readOnly = true;
    else if (a === "--save") args.save = next();
    else if (a === "--graph") args.graph = next();
    else if (a === "--max-pages") args.maxPages = Number(next());
    else if (a === "--refresh") args.refresh = true;
    else if (a === "--no-cache") args.cache = false;
    else if (a === "--cache-dir") args.cacheDir = next();
    else if (a === "--help" || a === "-h") throw new Error("help");
    else if (!a.startsWith("--")) args.url = a;
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url && !args.graph) throw new Error("help");
  const log = (m: string) => process.stderr.write(`relay-bridge: ${m}\n`);

  const token = process.env["RELAY_BRIDGE_TOKEN"];
  const cookie = process.env["RELAY_BRIDGE_COOKIE"];
  const session = new Session({
    ...(token && { bearerToken: token }),
    ...(cookie && { cookie }),
  });

  let graph: BridgeGraph;
  let layout = new LayoutMemory();
  const siteUrl = args.url;
  const cached =
    siteUrl && args.cache && !args.refresh && !args.graph ? await loadSite(args.cacheDir, siteUrl) : undefined;

  if (args.graph) {
    graph = JSON.parse(await readFile(args.graph, "utf8")) as BridgeGraph;
  } else if (cached) {
    graph = cached.graph;
    layout = LayoutMemory.from(cached.layout);
    log(`using the saved map of ${graph.appName} from ${cached.savedAt} (--refresh to rescan)`);
  } else {
    const result = await discover(session, siteUrl as string, {
      blockList: createBlockList(),
      layout,
      ...(args.maxPages !== undefined && { maxPages: args.maxPages }),
      log,
    });
    graph = result.graph;
    log(`found ${graph.actions.length} actions (source: ${result.source})`);
  }

  const cacheTarget = args.cache && siteUrl ? siteUrl : undefined;
  let saving: Promise<void> = Promise.resolve();
  const remember = () => {
    if (!cacheTarget) return;
    saving = saving
      .then(() => saveSite(args.cacheDir, cacheTarget, graph, layout.snapshot()))
      .catch((err: unknown) => {
        log(`could not save the site map: ${err instanceof Error ? err.message : String(err)}`);
      });
  };
  if (!cached) remember();

  if (args.save) await writeFile(args.save, `${JSON.stringify(graph, null, 2)}\n`);

  if (args.scan) {
    await saving;
    process.stdout.write(`${JSON.stringify(graph, null, 2)}\n`);
    return;
  }
  log(`serving ${exposedActions(graph, args.readOnly).length} tools over MCP (stdio)`);
  let learnTimer: NodeJS.Timeout | undefined;
  await runBridgeServer({
    session,
    graph,
    layout,
    readOnly: args.readOnly,
    log,
    // Layout keeps improving as pages are read; save it now and then.
    onLearn: () => {
      if (learnTimer) return;
      learnTimer = setTimeout(() => {
        learnTimer = undefined;
        remember();
      }, 2_000);
      learnTimer.unref();
    },
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message === "help" ? USAGE : `relay-bridge: ${message}\n\n${USAGE}`);
  process.exit(message === "help" ? 0 : 1);
});
