"use client";

import { usePrefersReducedMotion } from "@/lib/hooks";

const SPARKS = [
  { dx: -28, dy: -36, delay: "0ms", size: 7 },
  { dx: 22, dy: -40, delay: "40ms", size: 5 },
  { dx: 34, dy: -8, delay: "70ms", size: 6 },
  { dx: -32, dy: 10, delay: "90ms", size: 4 },
  { dx: 8, dy: -48, delay: "20ms", size: 8 },
  { dx: -10, dy: 28, delay: "110ms", size: 5 },
  { dx: 26, dy: 22, delay: "50ms", size: 4 },
  { dx: -40, dy: -14, delay: "80ms", size: 6 },
];

/** Tiny gold sparks around a wax seal when a quest is completed. */
export function SparkleBurst() {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={
            {
              "--dx": `${s.dx}px`,
              "--dy": `${s.dy}px`,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
