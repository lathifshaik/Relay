import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createBlockList } from "@relay/core";
import { forgetSession, loadSession, looksSignedOut, parsePastedSession, saveSession } from "./auth.js";
import { DEFAULT_CACHE_DIR, loadSite, saveSite } from "./cache.js";
import type { ConfirmPolicy } from "./confirm.js";
import { discover } from "./discover.js";
import { LayoutMemory } from "./layout.js";
import { type Labels, applyLabels, labelsTemplate } from "./meaning.js";
import { type BridgeMcpServer, exposedActions, runBridgeServer } from "./server.js";
import { Session } from "./session.js";
import type { BridgeGraph } from "./types.js";

const USAGE = `Usage:
  relay-bridge <url> [options]     Serve the app as an MCP server (stdio)
  relay-bridge login <url>         Hand the bridge your signed-in session
  relay-bridge logout <url>        Forget the saved session
  relay-bridge labels <url>        Write an editable labels file for the app's tools

Options:
  --scan              Print the discovered actions as JSON and exit
  --save <file>       Also write the discovered actions to <file>
  --graph <file>      Use actions saved earlier instead of discovering again
  --read-only         Only expose actions that read
  --confirm <policy>  risky (default): destructive and external actions need
                      the user's confirmation; writes: every change; none
  --rate <n>          At most n requests per second to the site (default 5)
  --max-pages <n>     Pages to read when scanning the frontend (default 15)
  --refresh           Rescan the site even if a saved map is recent
  --no-cache          Don't read or write the saved map
  --cache-dir <dir>   Where site maps, sessions and labels are kept
                      (default ~/.relay-bridge)

Signing in: log in to the site in your own browser as usual (2FA and single
sign-on included), then run \`relay-bridge login <url>\` and paste your Cookie
header or an API token. RELAY_BRIDGE_COOKIE / RELAY_BRIDGE_TOKEN also work.
`;

interface Args {
  command: "serve" | "login" | "logout" | "labels";
  url?: string;
  scan: boolean;
  save?: string;
  graph?: string;
  readOnly: boolean;
  confirm: ConfirmPolicy;
  rate?: number;
  maxPages?: number;
  refresh: boolean;
  cache: boolean;
  cacheDir: string;
}

const RESCAN_AFTER_MS = 10 * 60 * 1000;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "serve",
    scan: false,
    readOnly: false,
    confirm: "risky",
    refresh: false,
    cache: true,
    cacheDir: DEFAULT_CACHE_DIR,
  };
  const first = argv[0];
  if (first === "login" || first === "logout" || first === "labels") {
    args.command = first;
    argv = argv.slice(1);
  }
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
    else if (a === "--confirm") {
      const v = next();
      if (v !== "risky" && v !== "writes" && v !== "none") throw new Error("--confirm takes risky, writes or none");
      args.confirm = v;
    } else if (a === "--rate") args.rate = Number(next());
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

const log = (m: string) => process.stderr.write(`relay-bridge: ${m}\n`);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "login") return login(args);
  if (args.command === "logout") {
    if (!args.url) throw new Error("help");
    await forgetSession(args.cacheDir, args.url);
    log(`forgot the saved session for ${new URL(args.url).host}`);
    return;
  }
  if (!args.url && !args.graph) throw new Error("help");

  const session = await openSession(args);
  const labelsPath = args.url ? labelsFile(args.cacheDir, args.url) : undefined;
  const labels = labelsPath ? await readLabels(labelsPath) : {};

  let graph: BridgeGraph;
  let layout = new LayoutMemory();
  const siteUrl = args.url;
  const cached =
    siteUrl && args.cache && !args.refresh && !args.graph ? await loadSite(args.cacheDir, siteUrl) : undefined;

  const rediscover = async (): Promise<BridgeGraph> => {
    const result = await discover(session, siteUrl as string, {
      blockList: createBlockList(),
      layout,
      ...(args.maxPages !== undefined && { maxPages: args.maxPages }),
      log,
    });
    log(`found ${result.graph.actions.length} actions (source: ${result.source})`);
    if (result.source === "frontend") {
      log(`reading ${new URL(siteUrl as string).host}'s frontend — only use the bridge where its terms allow it`);
    }
    return result.graph;
  };

  if (args.graph) {
    graph = JSON.parse(await readFile(args.graph, "utf8")) as BridgeGraph;
  } else if (cached) {
    graph = cached.graph;
    layout = LayoutMemory.from(cached.layout);
    log(`using the saved map of ${graph.appName} from ${cached.savedAt} (--refresh to rescan)`);
  } else {
    graph = await rediscover();
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

  if (args.command === "labels") {
    const file = labelsPath as string;
    await writeFile(file, `${JSON.stringify(labelsTemplate(graph.actions, labels), null, 2)}\n`);
    log(`wrote ${file} — edit names, descriptions and risk, or set "hidden": true; changes apply on next start`);
    return;
  }

  const labelled = (g: BridgeGraph): BridgeGraph => ({ ...g, actions: applyLabels(g.actions, labels) });
  if (args.save) await writeFile(args.save, `${JSON.stringify(labelled(graph), null, 2)}\n`);
  if (args.scan) {
    await saving;
    process.stdout.write(`${JSON.stringify(labelled(graph), null, 2)}\n`);
    return;
  }

  log(`serving ${exposedActions(labelled(graph), args.readOnly).length} tools over MCP (stdio)`);
  let learnTimer: NodeJS.Timeout | undefined;
  let lastRescan = 0;
  // Declared before use so the rescan callback can reach it once serving.
  const server: BridgeMcpServer = await runBridgeServer({
    session,
    graph: labelled(graph),
    layout,
    readOnly: args.readOnly,
    confirm: args.confirm,
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
    // The app changed under us: re-read it (not too often) and swap the tools.
    onStale: () => {
      if (!siteUrl || Date.now() - lastRescan < RESCAN_AFTER_MS) return;
      lastRescan = Date.now();
      log("re-reading the site because an endpoint changed");
      rediscover()
        .then((fresh) => {
          graph = fresh;
          remember();
          server.setGraph(labelled(fresh));
          log(`tool list updated: ${exposedActions(labelled(fresh), args.readOnly).length} tools`);
        })
        .catch((err: unknown) => log(`rescan failed: ${err instanceof Error ? err.message : String(err)}`));
    },
  });
}

async function openSession(args: Args): Promise<Session> {
  const token = process.env["RELAY_BRIDGE_TOKEN"];
  const cookie = process.env["RELAY_BRIDGE_COOKIE"];
  const saved = !token && !cookie && args.url ? await loadSession(args.cacheDir, args.url) : undefined;
  if (saved) log(`using the session saved on ${saved.savedAt} (relay-bridge logout to forget it)`);
  const bearer = token ?? saved?.token;
  const jar = cookie ?? saved?.cookie;
  return new Session({
    ...(bearer && { bearerToken: bearer }),
    ...(jar && { cookie: jar }),
    ...(args.rate !== undefined && { ratePerSecond: args.rate }),
  });
}

async function login(args: Args): Promise<void> {
  if (!args.url) throw new Error("help");
  const { origin, host } = new URL(args.url);
  process.stderr.write(
    [
      `To connect ${host}:`,
      `  1. Open ${origin} in your browser and log in as usual (2FA and single sign-on work normally).`,
      "  2. Open the developer tools (F12) → Network, reload, and click any request to the site.",
      "  3. Copy the value of the Cookie request header — or an API token from the site's settings.",
      "",
      "Paste it here (it won't be shown) and press Enter:",
      "",
    ].join("\n"),
  );
  const pasted = parsePastedSession(await readSecret());
  if (!pasted) throw new Error("nothing was pasted");

  const session = new Session({
    ...(pasted.token && { bearerToken: pasted.token }),
    ...(pasted.cookie && { cookie: pasted.cookie }),
  });
  const res = await session.request(args.url);
  if (looksSignedOut(res)) {
    throw new Error(`${host} still treats that session as signed out — copy it again right after logging in`);
  }
  const file = await saveSession(args.cacheDir, args.url, pasted);
  log(`signed in to ${host}; the session is saved in ${file} (readable only by you)`);
}

/** Reads one line without echoing it when attached to a terminal; reads all of stdin otherwise. */
function readSecret(): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk: string) => (data += chunk));
      stdin.on("end", () => resolve(data));
    });
  }
  return new Promise((resolve, reject) => {
    let data = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdin.pause();
          process.stderr.write("\n");
          resolve(data);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          reject(new Error("cancelled"));
          return;
        }
        data = ch === "\u007f" ? data.slice(0, -1) : data + ch;
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

function labelsFile(dir: string, siteUrl: string): string {
  return path.join(dir, `${new URL(siteUrl).host.replace(/[^A-Za-z0-9.-]/g, "_")}.labels.json`);
}

async function readLabels(file: string): Promise<Labels> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Labels;
  } catch {
    return {};
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message === "help" ? USAGE : `relay-bridge: ${message}\n\n${USAGE}`);
  process.exit(message === "help" ? 0 : 1);
});
