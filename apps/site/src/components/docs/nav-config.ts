export interface NavItem {
  label: string;
  href: string;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const DOCS_NAV: NavGroup[] = [
  {
    heading: "Getting Started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quickstart", href: "/docs#quickstart" },
    ],
  },
  {
    heading: "Frameworks",
    items: [
      { label: "Express", href: "/docs/express" },
      { label: "Next.js", href: "/docs/next" },
      { label: "Fastify", href: "/docs/fastify" },
      { label: "Hono", href: "/docs/hono" },
    ],
  },
  {
    heading: "MCP",
    items: [
      { label: "Server setup", href: "/docs/mcp" },
    ],
  },
  {
    heading: "Reference",
    items: [
      { label: "Action Graph", href: "/docs/protocol" },
      { label: "Security", href: "/docs/security" },
      { label: "Consent model", href: "/docs/consent" },
    ],
  },
];

/** Linear walk used by per-page prev/next nav. */
export const DOCS_FLAT: NavItem[] = DOCS_NAV.flatMap((group) => group.items);

export function findAdjacent(href: string): {
  prev: NavItem | undefined;
  next: NavItem | undefined;
} {
  const idx = DOCS_FLAT.findIndex((i) => i.href === href);
  if (idx === -1) return { prev: undefined, next: undefined };
  return {
    prev: idx > 0 ? DOCS_FLAT[idx - 1] : undefined,
    next: idx < DOCS_FLAT.length - 1 ? DOCS_FLAT[idx + 1] : undefined,
  };
}
