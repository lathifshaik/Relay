import { cn } from "@/lib/cn";

interface RelayMarkProps {
  className?: string;
  size?: number;
}

/**
 * Custom wordmark for Relay — three concentric arcs suggesting a relay/pass-through.
 * Renders as inline SVG so it inherits text colour.
 */
export function RelayMark({ className, size = 28 }: RelayMarkProps) {
  return (
    <svg
      className={cn("inline-block", className)}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <title>Relay</title>
      <path
        d="M6 16C6 10.477 10.477 6 16 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M11 16C11 13.239 13.239 11 16 11"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle
        cx="16"
        cy="16"
        r="2.5"
        fill="currentColor"
      />
      <path
        d="M16 21C18.761 21 21 23.239 21 26"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M16 26C21.523 26 26 21.523 26 16"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
