"use client";
import { useEffect, useRef, useState } from "react";
import { useMagicPreference } from "./EnchantedEffects";
import { usePrefersReducedMotion } from "@/lib/hooks";

/** A clearly decorative interaction. No XP, network request or gameplay side effects. */
export function SpellButton() {
  const enabled = useMagicPreference();
  const reduced = usePrefersReducedMotion();
  const [casting, setCasting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="grand-cast-button"
      disabled={!enabled || reduced || casting}
      title="A little magic, just for fun — no XP or rewards"
      onClick={(e) => {
        const r =
          e.currentTarget.closest("section")?.getBoundingClientRect() ??
          e.currentTarget.getBoundingClientRect();
        window.dispatchEvent(
          new CustomEvent("questbound:spell", {
            detail: {
              x: Math.min(innerWidth - 75, r.x + r.width * 0.73),
              y: Math.max(
                80,
                Math.min(innerHeight - 80, r.y + r.height * 0.45),
              ),
              power: 2,
            },
          }),
        );
        setCasting(true);
        timer.current = setTimeout(() => setCasting(false), 1400);
      }}
    >
      <span className="grand-wand" aria-hidden="true">
        ✦
      </span>
      <span>{casting ? "Lumos!" : "Cast a spell"}</span>
      <small aria-hidden="true">↗</small>
    </button>
  );
}
