"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const WORDS = ["Express.", "Next.js.", "Fastify.", "Hono."];

export function AnimatedHeadline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <h1 className="font-sans text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.5rem]">
      <span className="gradient-text">LLM-native</span>{" "}
      <span className="text-fg/90">middleware for</span>
      <br className="hidden sm:block" />
      <span className="relative inline-block">
        <AnimatePresence mode="wait">
          <motion.span
            key={index}
            initial={{ y: 40, opacity: 0, filter: "blur(10px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: -40, opacity: 0, filter: "blur(10px)" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block bg-gradient-to-br from-[oklch(0.85_0.2_200)] to-[oklch(0.65_0.18_280)] bg-clip-text text-transparent"
          >
            {WORDS[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </h1>
  );
}
