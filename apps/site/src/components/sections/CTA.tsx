"use client";

import { motion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";
import { BackgroundPaths } from "@/components/ui/BackgroundPaths";
import { Button } from "@/components/ui/Button";

export function CTA() {
  return (
    <section className="relative py-28 md:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 px-6 py-20 md:px-12 md:py-28">
          <BackgroundPaths className="absolute inset-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 100%, oklch(0.6 0.22 200 / 0.18), transparent 70%)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto max-w-2xl text-center"
          >
            <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              Your app is{" "}
              <span className="gradient-text">already agent-ready.</span>
              <br />
              You just haven't installed it yet.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--color-fg-muted)]">
              Five-minute install. Zero new files. Same code path serves humans and agents.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button
                asChildLink={{ href: "https://github.com/lathifshaik/Relay", external: true }}
                variant="primary"
                className="h-12 px-6 text-[15px]"
              >
                Star on GitHub
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                asChildLink={{
                  href: "https://github.com/lathifshaik/Relay/blob/main/PLAN.md",
                  external: true,
                }}
                variant="outline"
                className="h-12 px-6 text-[15px]"
              >
                <Github className="h-4 w-4" />
                Read the plan
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
