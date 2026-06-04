"use client";

import { motion } from "framer-motion";
import {
  ChevronsRight,
  Lock,
  Network,
  Package,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Auto-MCP",
    body: "Every Relay install is an automatic MCP server. Claude, Cursor, Windsurf — they just work.",
    span: "md:col-span-2 md:row-span-2",
    accent: true,
  },
  {
    icon: Package,
    title: "Four frameworks, one protocol",
    body: "Express. Next.js. Fastify. Hono. Same Action Graph shape across all of them.",
    span: "md:col-span-2",
  },
  {
    icon: ShieldCheck,
    title: "Sanitisation pipeline",
    body: "Schema projection + secret pattern scanner + error sanitiser. Keys never reach the agent.",
    span: "md:col-span-1",
  },
  {
    icon: Lock,
    title: "Consent-first",
    body: "Route blocks, JWT scope, instant revocation. Banking-grade controls from v0.1.",
    span: "md:col-span-1",
  },
  {
    icon: Workflow,
    title: "Multi-step state",
    body: "/relay/state gives agents the session context they need without re-discovering it every turn.",
    span: "md:col-span-2",
  },
  {
    icon: Network,
    title: "Drop-in middleware",
    body: "One line of code per framework. Your existing handlers don't change.",
    span: "md:col-span-2",
  },
];

export function Features() {
  return (
    <section className="relative py-28 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="mb-4 font-mono text-[12.5px] uppercase tracking-[0.15em] text-[var(--color-accent-bright)]">
            Built in
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Everything an agent needs.{" "}
            <span className="text-[var(--color-fg-muted)]">Nothing it doesn't.</span>
          </h2>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-4 md:auto-rows-[180px]">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, scale: 0.96, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 p-6 transition-colors duration-300 hover:border-[var(--color-border-bright)] ${
                  f.span
                } ${f.accent ? "bg-gradient-to-br from-[oklch(0.2_0.04_200)] to-[var(--color-bg-elev)]" : ""}`}
              >
                {f.accent && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full opacity-50 blur-3xl"
                    style={{
                      background:
                        "radial-gradient(closest-side, oklch(0.6 0.22 200 / 0.35), transparent)",
                    }}
                  />
                )}

                <div className="relative flex h-full flex-col">
                  <div
                    className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg ${
                      f.accent
                        ? "bg-[oklch(0.3_0.12_200)] text-[var(--color-accent-bright)]"
                        : "bg-[var(--color-bg-glass)] text-[var(--color-fg-muted)]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-[19px] font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--color-fg-muted)]">
                    {f.body}
                  </p>
                  {f.accent && (
                    <div className="mt-auto pt-6">
                      <div className="flex items-center gap-2 text-[13.5px] font-mono text-[var(--color-accent-bright)] transition-transform group-hover:translate-x-0.5">
                        npx @relay/mcp
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
