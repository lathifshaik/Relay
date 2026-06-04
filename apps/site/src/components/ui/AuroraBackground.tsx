"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface AuroraBackgroundProps {
  className?: string;
  children?: ReactNode;
}

export function AuroraBackground({ className, children }: AuroraBackgroundProps) {
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          aria-hidden
          className="absolute top-[-30%] left-1/2 h-[600px] w-[1200px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.6 0.22 200 / 0.6), transparent)",
          }}
          animate={{
            x: ["-50%", "-45%", "-55%", "-50%"],
            y: [0, -20, 10, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[10%] left-[-10%] h-[400px] w-[700px] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.65 0.18 280 / 0.6), transparent)",
          }}
          animate={{
            x: [0, 60, -30, 0],
            y: [0, 30, -20, 0],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[20%] right-[-10%] h-[400px] w-[700px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.7 0.2 145 / 0.5), transparent)",
          }}
          animate={{
            x: [0, -40, 30, 0],
            y: [0, -30, 20, 0],
          }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      {children}
    </div>
  );
}
