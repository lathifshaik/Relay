"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Github } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RelayMark } from "@/components/ui/RelayMark";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { label: "Problem", href: "/#problem" },
  { label: "How it works", href: "/#how" },
  { label: "Install", href: "/#install" },
  { label: "Docs", href: "/docs" },
];

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 32);
  });

  return (
    <motion.nav
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-1/2 top-4 z-50 -translate-x-1/2 px-4"
    >
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border px-2 py-2 transition-all duration-300",
          scrolled
            ? "border-[var(--color-border)] bg-[var(--color-bg-glass)]/80 backdrop-blur-xl shadow-2xl shadow-black/20"
            : "border-transparent bg-transparent",
        )}
      >
        <a
          href="/"
          className="ml-2 flex items-center gap-2 pr-3 text-[var(--color-fg)] transition-opacity hover:opacity-80"
        >
          <RelayMark size={22} className="text-[var(--color-accent-bright)]" />
          <span className="font-semibold tracking-tight">Relay</span>
        </a>

        <div className="hidden items-center md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13.5px] text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-2">
          <Button
            asChildLink={{
              href: "https://github.com/lathifshaik/Relay",
              external: true,
            }}
            variant="ghost"
            className="h-9 px-3 text-[13.5px]"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </Button>
          <Button
            asChildLink={{ href: "#install" }}
            variant="primary"
            className="h-9 px-3.5 text-[13.5px]"
          >
            Get started
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
