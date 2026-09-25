import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { LayoutSnapshot } from "./layout.js";
import type { BridgeGraph } from "./types.js";

export interface SiteMemory {
  version: 1;
  savedAt: string;
  graph: BridgeGraph;
  layout: LayoutSnapshot;
}

export const DEFAULT_CACHE_DIR = path.join(homedir(), ".relay-bridge");
export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function siteFile(dir: string, siteUrl: string): string {
  const { host } = new URL(siteUrl);
  return path.join(dir, `${host.replace(/[^A-Za-z0-9.-]/g, "_")}.json`);
}

/** The saved map of a site, if there is one younger than `maxAgeMs`. */
export async function loadSite(dir: string, siteUrl: string, maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<SiteMemory | undefined> {
  let memory: SiteMemory;
  try {
    memory = JSON.parse(await readFile(siteFile(dir, siteUrl), "utf8")) as SiteMemory;
  } catch {
    return undefined;
  }
  if (memory.version !== 1 || !memory.graph || !memory.layout) return undefined;
  if (Date.now() - Date.parse(memory.savedAt) > maxAgeMs) return undefined;
  return memory;
}

/**
 * Saves a site's map. Layout lines can include things like the signed-in
 * user's name, so the file is private to the current user.
 */
export async function saveSite(dir: string, siteUrl: string, graph: BridgeGraph, layout: LayoutSnapshot): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = siteFile(dir, siteUrl);
  const memory: SiteMemory = { version: 1, savedAt: new Date().toISOString(), graph, layout };
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(memory)}\n`, { mode: 0o600 });
  await rename(tmp, file);
}
