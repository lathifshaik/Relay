"use client";

import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  asChildLink?: { href: string; external?: boolean };
}

const base =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-[14.5px] font-medium tracking-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-fg)] text-[var(--color-bg)] hover:bg-[oklch(0.92_0.005_264)] shadow-[0_0_0_1px_color-mix(in_oklch,var(--color-fg)_30%,transparent)]",
  ghost:
    "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-white/5",
  outline:
    "border border-[var(--color-border-bright)] text-[var(--color-fg)] hover:bg-white/5 hover:border-[var(--color-accent-dim)]",
};

export function Button({
  variant = "primary",
  className,
  children,
  asChildLink,
  ...rest
}: ButtonProps) {
  if (asChildLink) {
    return (
      <motion.a
        href={asChildLink.href}
        target={asChildLink.external ? "_blank" : undefined}
        rel={asChildLink.external ? "noopener noreferrer" : undefined}
        whileTap={{ scale: 0.97 }}
        className={cn(base, variants[variant], className)}
      >
        {children}
      </motion.a>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cn(base, variants[variant], className)}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  );
}
