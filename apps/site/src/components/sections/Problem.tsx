"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Camera, FileCode2 } from "lucide-react";

const PROBLEMS = [
  {
    icon: Camera,
    title: "Screenshot + vision",
    metric: "2–8s · ~$0.03 / step",
    body: "Pixels in, intent out. Hallucinated buttons. No validation. No structure. Latency that breaks any real workflow.",
  },
  {
    icon: FileCode2,
    title: "Raw HTML scraping",
    metric: "8K–40K tokens / page",
    body: "Agents reverse-engineer intent from a wall of markup. Retry loops burn more tokens. Brittle to every CSS class change.",
  },
  {
    icon: AlertTriangle,
    title: "Browser automation",
    metric: "Brittle · slow · blind",
    body: "Playwright on every step. A renamed button breaks production. Visual coordinates can't reason about app state.",
  },
];

export function Problem() {
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
            The Problem
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Every agent talks to your app through{" "}
            <span className="text-[var(--color-fg-muted)]">duct tape.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[16.5px] leading-relaxed text-[var(--color-fg-muted)]">
            Three approaches dominate today. All of them force the agent to reverse-engineer
            your application from artifacts that weren't built for it.
          </p>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROBLEMS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{
                  duration: 0.6,
                  delay: i * 0.08,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 p-6 transition-colors duration-300 hover:border-[var(--color-border-bright)]"
              >
                <div className="pointer-events-none absolute -top-32 -right-32 h-64 w-64 rounded-full bg-[oklch(0.6_0.18_25_/_0.08)] opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.22_0.02_25)] text-[oklch(0.78_0.18_25)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-[19px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-1 font-mono text-[12.5px] text-[var(--color-fg-dim)]">
                    {p.metric}
                  </p>
                  <p className="mt-4 text-[14.5px] leading-relaxed text-[var(--color-fg-muted)]">
                    {p.body}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
