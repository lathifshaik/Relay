"use client";

import { usePathname } from "next/navigation";
import { DOCS_NAV } from "./nav-config";
import { cn } from "@/lib/cn";

export function DocSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs">
      <ul className="space-y-7">
        {DOCS_NAV.map((group) => (
          <li key={group.heading}>
            <p className="mb-3 px-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const base = item.href.split("#")[0] ?? item.href;
                const active = pathname === base;
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={cn(
                        "block cursor-pointer rounded-md px-3 py-1.5 text-[13.5px] transition-colors",
                        active
                          ? "bg-[var(--color-bg-elev)] text-[var(--color-fg)]"
                          : "text-[var(--color-fg-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]",
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
