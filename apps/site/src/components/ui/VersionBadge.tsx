"use client";

import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

interface VersionBadgeProps {
  version: string;
  label: string;
  href: string;
}

/**
 * Restrained version/announcement badge — pulse dot + mono version + plain tagline.
 * No pill chrome, no sparkle icons. Hover reveals the arrow.
 */
export function VersionBadge({ version, label, href }: VersionBadgeProps) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group mx-auto inline-flex items-center gap-3 text-[12.5px] tracking-tight"
    >
      <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden>
        <motion.span
          className="absolute h-2 w-2 rounded-full bg-[var(--color-green)]"
          animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
        />
        <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
      </span>
      <span className="font-mono text-[var(--color-fg-muted)] transition-colors group-hover:text-[var(--color-fg)]">
        {version}
      </span>
      <span className="text-[var(--color-fg-dim)]" aria-hidden>
        /
      </span>
      <span className="text-[var(--color-fg)]">{label}</span>
      <ArrowUpRight className="ml-0.5 h-3.5 w-3.5 text-[var(--color-fg-dim)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--color-fg)]" />
    </motion.a>
  );
}
