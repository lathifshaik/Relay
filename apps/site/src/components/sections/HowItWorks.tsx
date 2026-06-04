"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Network, Search, Zap } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    label: "01",
    title: "Discover",
    body: "On boot, Relay walks your framework's route registry and builds a static Action Graph — every route, typed.",
  },
  {
    icon: Network,
    label: "02",
    title: "Read",
    body: "Agents hit /relay/manifest and receive 200–800 tokens of typed JSON instead of 8–40k tokens of HTML.",
  },
  {
    icon: CheckCircle2,
    label: "03",
    title: "Validate",
    body: "Every call to /relay/act/:actionId runs through the Validator. Bad inputs return a self-correctable structured error.",
  },
  {
    icon: Zap,
    label: "04",
    title: "Act or correct",
    body: "Handler executes. Output is projected through the action's return schema. Secrets are stripped. 1–20ms total.",
  },
];

export function HowItWorks() {
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
            How it works
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            <span className="gradient-text">Four steps</span>. No new files.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[16.5px] leading-relaxed text-[var(--color-fg-muted)]">
            Relay sits behind your existing routes as middleware. Your handlers don't change.
            Your UI doesn't change. The agent gets a typed surface for free.
          </p>
        </motion.div>

        <div className="relative mt-20">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 lg:block"
            style={{
              background:
                "linear-gradient(to bottom, transparent, var(--color-border) 8%, var(--color-border) 92%, transparent)",
            }}
          />

          <div className="grid gap-10 lg:gap-16">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={step.label}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-120px" }}
                  transition={{
                    duration: 0.7,
                    delay: i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`relative grid items-center gap-6 lg:grid-cols-[1fr_56px_1fr] ${
                    isLeft ? "" : ""
                  }`}
                >
                  <div className={`order-2 lg:order-${isLeft ? "1" : "3"} ${isLeft ? "lg:text-right" : "lg:text-left"}`}>
                    <div className={`inline-block max-w-md ${isLeft ? "lg:text-right" : ""}`}>
                      <p className="font-mono text-[12px] tracking-[0.2em] text-[var(--color-fg-dim)]">
                        STEP {step.label}
                      </p>
                      <h3 className="mt-2 text-[28px] font-semibold tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--color-fg-muted)]">
                        {step.body}
                      </p>
                    </div>
                  </div>

                  <div className="order-1 flex justify-center lg:order-2">
                    <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-[var(--color-border-bright)] bg-[var(--color-bg-elev)] text-[var(--color-accent-bright)] shadow-[0_0_40px_oklch(0.6_0.22_200_/_0.15)]">
                      <Icon className="h-6 w-6" />
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-2xl border border-[var(--color-accent-dim)] opacity-50"
                      />
                    </div>
                  </div>

                  <div
                    className={`order-3 hidden lg:order-${
                      isLeft ? "3" : "1"
                    } lg:block`}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
