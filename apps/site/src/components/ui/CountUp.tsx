"use client";

import { animate, useInView, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
}

export function CountUp({
  to,
  from = 0,
  suffix = "",
  prefix = "",
  duration = 1.6,
  decimals = 0,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const value = useMotionValue(from);
  const rounded = useTransform(value, (latest) =>
    decimals > 0 ? latest.toFixed(decimals) : Math.round(latest).toString(),
  );

  useEffect(() => {
    if (!inView) return;
    const controls = animate(value, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [inView, to, duration, value]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return rounded.on("change", (v) => {
      node.textContent = `${prefix}${v}${suffix}`;
    });
  }, [rounded, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {decimals > 0 ? from.toFixed(decimals) : from}
      {suffix}
    </span>
  );
}
