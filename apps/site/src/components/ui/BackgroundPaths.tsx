"use client";

import { motion } from "framer-motion";

interface BackgroundPathsProps {
  className?: string;
  position?: 1 | -1;
}

export function BackgroundPaths({ className, position = 1 }: BackgroundPathsProps) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    opacity: 0.05 + i * 0.015,
    width: 0.5 + i * 0.02,
  }));

  return (
    <div className={className} aria-hidden>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-[oklch(0.78_0.2_200)]"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Background paths</title>
        {paths.map((path, index) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            initial={{ pathLength: 0.3, opacity: 0.4 }}
            animate={{
              pathLength: 1,
              opacity: [0.2, 0.5, 0.2],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 16 + Math.random() * 6,
              repeat: Infinity,
              ease: "linear",
              delay: index * 0.05,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
