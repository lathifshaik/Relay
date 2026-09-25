import { templatePath } from "./infer.js";

export interface LayoutSnapshot {
  templates: string[];
  lines: Record<string, string[]>;
}

const MIN_TEMPLATES = 2;
const SHARE = 0.6;
const MAX_TRACKED_LINES = 5_000;

/**
 * Learns which lines of text are the site's chrome — navigation, headers,
 * footers — by seeing which ones repeat across different kinds of page.
 *
 * Lines are counted per route template, not per page: `/orders/1` and
 * `/orders/2` are one template, so a detail line that happens to repeat
 * across orders ("Status: shipped") is never mistaken for chrome.
 */
export class LayoutMemory {
  private readonly templates = new Set<string>();
  private readonly lines = new Map<string, Set<string>>();

  static from(snapshot: LayoutSnapshot | undefined): LayoutMemory {
    const memory = new LayoutMemory();
    if (!snapshot) return memory;
    for (const t of snapshot.templates) memory.templates.add(t);
    for (const [line, templates] of Object.entries(snapshot.lines)) memory.lines.set(line, new Set(templates));
    return memory;
  }

  observe(pageUrl: string, lines: readonly string[]): void {
    const template = templatePath(new URL(pageUrl).pathname);
    this.templates.add(template);
    for (const line of new Set(lines)) {
      let seen = this.lines.get(line);
      if (!seen) {
        if (this.lines.size >= MAX_TRACKED_LINES) continue;
        seen = new Set();
        this.lines.set(line, seen);
      }
      seen.add(template);
    }
  }

  isChrome(line: string): boolean {
    if (this.templates.size < MIN_TEMPLATES) return false;
    const seen = this.lines.get(line)?.size ?? 0;
    return seen >= MIN_TEMPLATES && seen / this.templates.size >= SHARE;
  }

  /** Records the page, then returns its lines without the chrome. */
  strip(pageUrl: string, lines: readonly string[]): { kept: string[]; hidden: number } {
    this.observe(pageUrl, lines);
    const kept = lines.filter((l) => !this.isChrome(l));
    return { kept, hidden: lines.length - kept.length };
  }

  snapshot(): LayoutSnapshot {
    // Lines seen on a single template can't be chrome yet; keep only what matters.
    const lines: Record<string, string[]> = {};
    for (const [line, templates] of this.lines) {
      if (templates.size >= MIN_TEMPLATES) lines[line] = [...templates];
    }
    return { templates: [...this.templates], lines };
  }
}
