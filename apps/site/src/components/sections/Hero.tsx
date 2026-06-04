"use client";

import { motion } from "framer-motion";
import { ArrowRight, Github } from "lucide-react";
import { AnimatedHeadline } from "@/components/ui/AnimatedHeadline";
import { AuroraBackground } from "@/components/ui/AuroraBackground";
import { Button } from "@/components/ui/Button";
import { VersionBadge } from "@/components/ui/VersionBadge";

const reveal = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: 0.2 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <AuroraBackground className="relative pt-32 pb-28 md:pt-40 md:pb-32">
      <div className="grid-bg absolute inset-0 -z-10" />

      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          variants={reveal}
          initial="hidden"
          animate="show"
          custom={0}
          className="mb-10 flex justify-center"
        >
          <VersionBadge
            version="v0.1.0"
            label="Auto-MCP for Node.js"
            href="https://github.com/lathifshaik/Relay"
          />
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          animate="show"
          custom={1}
          className="text-center"
        >
          <AnimatedHeadline />
        </motion.div>

        <motion.p
          variants={reveal}
          initial="hidden"
          animate="show"
          custom={2}
          className="mx-auto mt-8 max-w-2xl text-balance text-center text-[17px] leading-relaxed text-[var(--color-fg-muted)] sm:text-[18px]"
        >
          One <span className="font-mono text-[var(--color-accent-bright)]">npm install</span>{" "}
          turns your Node.js app into a typed, agent-readable interface. 100× fewer
          tokens. Sub-20ms actions. Consent built in.
        </motion.p>

        <motion.div
          variants={reveal}
          initial="hidden"
          animate="show"
          custom={3}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <Button asChildLink={{ href: "#install" }} variant="primary">
            Get started
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            asChildLink={{ href: "https://github.com/lathifshaik/Relay", external: true }}
            variant="outline"
          >
            <Github className="h-4 w-4" />
            View on GitHub
          </Button>
        </motion.div>

        <motion.div
          variants={reveal}
          initial="hidden"
          animate="show"
          custom={4}
          className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12.5px] text-[var(--color-fg-dim)]"
        >
          <span className="font-mono uppercase tracking-wider">Works with</span>
          {["Express", "Next.js", "Fastify", "Hono"].map((name) => (
            <span
              key={name}
              className="font-mono text-[13.5px] text-[var(--color-fg-muted)]"
            >
              {name}
            </span>
          ))}
        </motion.div>
      </div>
    </AuroraBackground>
  );
}
