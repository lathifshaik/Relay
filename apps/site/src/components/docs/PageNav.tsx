import { ArrowLeft, ArrowRight } from "lucide-react";
import { findAdjacent } from "./nav-config";

export function PageNav({ pathname }: { pathname: string }) {
  const { prev, next } = findAdjacent(pathname);
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="Doc pagination"
      className="mt-20 grid gap-3 border-t border-[var(--color-border)]/60 pt-10 sm:grid-cols-2"
    >
      {prev ? (
        <a
          href={prev.href}
          className="group flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/40 p-5 transition-colors hover:border-[var(--color-border-bright)]"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
            <ArrowLeft className="h-3 w-3" />
            Previous
          </span>
          <span className="text-[15px] font-medium text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-accent-bright)]">
            {prev.label}
          </span>
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a
          href={next.href}
          className="group flex flex-col items-end gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/40 p-5 text-right transition-colors hover:border-[var(--color-border-bright)]"
        >
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
            Next
            <ArrowRight className="h-3 w-3" />
          </span>
          <span className="text-[15px] font-medium text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-accent-bright)]">
            {next.label}
          </span>
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
