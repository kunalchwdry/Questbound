"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { EnchantedEffects, useMagicPreference } from "./EnchantedEffects";
import { usePrefersReducedMotion } from "@/lib/hooks";
import "./enchantments.css";
import "./candlelit-magic.css";
import { SpellInteractions } from "./SpellInteractions";

export function MotionPreferences({ children }: { children: ReactNode }) {
  const enabled = useMagicPreference();
  const reduced = usePrefersReducedMotion();
  return (
    <MotionConfig
      reducedMotion={enabled ? "user" : "always"}
      transition={!enabled || reduced ? { duration: 0 } : undefined}
    >
      {children}
      <EnchantedEffects />
      <SpellInteractions enabled={enabled && !reduced} />
    </MotionConfig>
  );
}
