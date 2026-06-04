import { RelayMark } from "@/components/ui/RelayMark";

const COLUMNS: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: "Packages",
    links: [
      { label: "@relay/core", href: "https://github.com/lathifshaik/Relay/tree/main/packages/core" },
      { label: "@relay/express", href: "https://github.com/lathifshaik/Relay/tree/main/packages/express" },
      { label: "@relay/next", href: "https://github.com/lathifshaik/Relay/tree/main/packages/next" },
      { label: "@relay/fastify", href: "https://github.com/lathifshaik/Relay/tree/main/packages/fastify" },
      { label: "@relay/hono", href: "https://github.com/lathifshaik/Relay/tree/main/packages/hono" },
      { label: "@relay/mcp", href: "https://github.com/lathifshaik/Relay/tree/main/packages/mcp" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Build plan", href: "https://github.com/lathifshaik/Relay/blob/main/PLAN.md" },
      { label: "Express example", href: "https://github.com/lathifshaik/Relay/tree/main/examples/express-todo" },
      { label: "Next.js example", href: "https://github.com/lathifshaik/Relay/tree/main/examples/next-shop" },
    ],
  },
  {
    heading: "MCP",
    links: [
      { label: "Anthropic MCP", href: "https://modelcontextprotocol.io" },
      { label: "Claude Desktop", href: "https://claude.ai/download" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-[var(--color-border)]/60 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 gap-12 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 text-[var(--color-fg)]">
              <RelayMark size={22} className="text-[var(--color-accent-bright)]" />
              <span className="font-semibold tracking-tight">Relay</span>
            </div>
            <p className="mt-3 max-w-[220px] text-[13.5px] leading-relaxed text-[var(--color-fg-muted)]">
              LLM-native middleware for Node.js. Drop in, become agent-readable.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
                {col.heading}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target={link.href.startsWith("http") ? "_blank" : undefined}
                      rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="cursor-pointer text-[13.5px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-[var(--color-border)]/60 pt-8 md:flex-row md:items-center">
          <p className="text-[12.5px] text-[var(--color-fg-dim)]">
            v0.1 · MIT licensed · Built in the open
          </p>
          <p className="font-mono text-[11.5px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
            relay-protocol
          </p>
        </div>
      </div>
    </footer>
  );
}
