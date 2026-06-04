"use client";

import { motion } from "framer-motion";
import { CountUp } from "@/components/ui/CountUp";

const STATS = [
  {
    to: 100,
    suffix: "×",
    label: "Fewer tokens per agent turn",
    sub: "200–800 tokens vs 8K–40K raw HTML",
  },
  {
    to: 96,
    suffix: "%",
    label: "First-attempt success rate",
    sub: "On 10-step workflows in internal testing",
  },
  {
    to: 20,
    prefix: "<",
    suffix: "ms",
    label: "Per-action latency",
    sub: "vs 2–8s screenshot pipelines",
  },
  {
    to: 5500,
    prefix: "$",
    suffix: "/day",
    label: "Saved at 10K workflows/day",
    sub: "Pure LLM cost reduction, before infra",
  },
];

export function Stats() {
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
            Why it matters
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            The ROI is in the <span className="gradient-text">tokens</span>.
          </h2>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 p-6"
            >
              <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-[var(--color-accent-dim)] to-transparent opacity-50" />
              <div className="font-mono text-[42px] font-semibold leading-none tracking-tight text-[var(--color-fg)] md:text-[48px]">
                <CountUp to={stat.to} prefix={stat.prefix ?? ""} suffix={stat.suffix ?? ""} />
              </div>
              <p className="mt-3 text-[14.5px] font-medium text-[var(--color-fg)]">
                {stat.label}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-fg-dim)]">
                {stat.sub}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
