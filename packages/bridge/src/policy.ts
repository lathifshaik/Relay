import type { Session } from "./session.js";

export const BRIDGE_AGENT = "relay-bridge";

/**
 * What a site allows the bridge to do. Owners say so in
 * `/.well-known/relay.json`: `{ "agents": "allow" | "deny" | "official-only" }`.
 * `official-only` means "use my Relay manifest or OpenAPI spec, don't read my
 * frontend". A robots.txt group that disallows `relay-bridge` everywhere
 * counts as `deny`.
 */
export interface SitePolicy {
  agents: "allow" | "deny" | "official-only";
  source: "relay.json" | "robots.txt" | "default";
  message?: string;
  robots: RobotsRules;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export async function loadPolicy(session: Session, origin: string): Promise<SitePolicy> {
  const robots = parseRobots(await fetchText(session, `${origin}/robots.txt`), BRIDGE_AGENT);

  const declared = parseDeclared(await fetchText(session, `${origin}/.well-known/relay.json`));
  if (declared) return { ...declared, source: "relay.json", robots };

  if (robots.specific && !robots.allows("/")) {
    return { agents: "deny", source: "robots.txt", message: `robots.txt disallows ${BRIDGE_AGENT}`, robots };
  }
  return { agents: "allow", source: "default", robots };
}

function parseDeclared(text: string | undefined): Omit<SitePolicy, "source" | "robots"> | undefined {
  if (!text) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (json === null || typeof json !== "object") return undefined;
  const { agents, message } = json as { agents?: unknown; message?: unknown };
  if (agents !== "allow" && agents !== "deny" && agents !== "official-only") return undefined;
  return { agents, ...(typeof message === "string" && { message }) };
}

export interface RobotsRules {
  /** True when a group names this agent rather than falling back to `*`. */
  specific: boolean;
  /** `Sitemap:` URLs the file lists. */
  sitemaps: string[];
  allows(path: string): boolean;
}

/** robots.txt matching per RFC 9309: the longest matching rule wins, Allow wins a tie. */
export function parseRobots(text: string | undefined, agent: string): RobotsRules {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }> = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  const sitemaps: string[] = [];

  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const name = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && name.startsWith(a)));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);

  return {
    specific: mine.length > 0,
    sitemaps,
    allows(path: string): boolean {
      let best: { allow: boolean; length: number } | undefined;
      for (const rule of rules) {
        if (!robotsMatch(rule.pattern, path)) continue;
        const length = rule.pattern.length;
        if (!best || length > best.length || (length === best.length && rule.allow)) {
          best = { allow: rule.allow, length };
        }
      }
      return best?.allow ?? true;
    },
  };
}

function robotsMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

async function fetchText(session: Session, url: string): Promise<string | undefined> {
  const res = await session.request(url).catch(() => undefined);
  return res && res.status < 400 ? res.text : undefined;
}
