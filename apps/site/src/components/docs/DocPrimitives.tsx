import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function DocHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <header className="mb-12 border-b border-[var(--color-border)]/60 pb-8">
      {eyebrow && (
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-accent-bright)]">
          {eyebrow}
        </p>
      )}
      <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-fg)] md:text-[44px]">
        {title}
      </h1>
      {lead && (
        <p className="mt-4 max-w-2xl text-[16.5px] leading-relaxed text-[var(--color-fg-muted)]">
          {lead}
        </p>
      )}
    </header>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-14 scroll-mt-24 text-[26px] font-semibold tracking-tight text-[var(--color-fg)]"
    >
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mt-10 scroll-mt-24 text-[19px] font-semibold tracking-tight text-[var(--color-fg)]"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--color-fg-muted)]">
      {children}
    </p>
  );
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-4 space-y-2 pl-1 text-[15.5px] leading-relaxed text-[var(--color-fg-muted)]">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-5 before:absolute before:left-0 before:top-[0.7em] before:h-1 before:w-1 before:rounded-full before:bg-[var(--color-fg-dim)]">
      {children}
    </li>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[var(--color-bg-elev)] px-1.5 py-0.5 font-mono text-[13.5px] text-[var(--color-accent-bright)]">
      {children}
    </code>
  );
}

type CalloutKind = "info" | "warning" | "note";

const CALLOUT_STYLES: Record<CalloutKind, { border: string; bg: string; accent: string; tag: string }> = {
  info: {
    border: "border-[oklch(0.4_0.12_200)]",
    bg: "bg-[oklch(0.22_0.04_200_/_0.4)]",
    accent: "text-[var(--color-accent-bright)]",
    tag: "INFO",
  },
  warning: {
    border: "border-[oklch(0.45_0.16_75)]",
    bg: "bg-[oklch(0.22_0.04_75_/_0.4)]",
    accent: "text-[var(--color-amber)]",
    tag: "HEADS UP",
  },
  note: {
    border: "border-[var(--color-border-bright)]",
    bg: "bg-[var(--color-bg-elev)]/60",
    accent: "text-[var(--color-fg-muted)]",
    tag: "NOTE",
  },
};

export function Callout({
  kind = "info",
  title,
  children,
}: {
  kind?: CalloutKind;
  title?: string;
  children: ReactNode;
}) {
  const s = CALLOUT_STYLES[kind];
  return (
    <div
      className={cn(
        "mt-6 rounded-xl border px-5 py-4 text-[14.5px] leading-relaxed",
        s.border,
        s.bg,
      )}
    >
      <p className={cn("mb-1 font-mono text-[11px] uppercase tracking-[0.18em]", s.accent)}>
        {s.tag}
        {title ? ` · ${title}` : ""}
      </p>
      <div className="text-[var(--color-fg)]">{children}</div>
    </div>
  );
}

export function StepList({ steps }: { steps: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="mt-6 space-y-5">
      {steps.map((step, i) => (
        <li key={step.title} className="grid grid-cols-[40px_1fr] gap-4">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border-bright)] bg-[var(--color-bg-elev)] font-mono text-[13px] text-[var(--color-accent-bright)]">
            {i + 1}
          </div>
          <div>
            <p className="text-[15px] font-medium text-[var(--color-fg)]">{step.title}</p>
            <div className="mt-1 text-[14.5px] leading-relaxed text-[var(--color-fg-muted)]">
              {step.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
