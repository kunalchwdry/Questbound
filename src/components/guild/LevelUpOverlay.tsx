"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { LevelUpEvent } from "./useGuild";
/** A celebration, not a roadblock. No focus capture, no sound, no modal backdrop. */
export function LevelUpOverlay({
  event,
  onClose,
}: {
  event: LevelUpEvent | null;
  onClose: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(onClose, 9000);
    return () => window.clearTimeout(timer);
  }, [event, onClose]);
  return (
    <AnimatePresence>
      {event && (
        <motion.section
          key={event.to}
          role="status"
          aria-live="polite"
          aria-label={`Level up! You reached level ${event.to}`}
          className="grand-levelup fixed bottom-24 right-4 z-[95] w-[min(360px,calc(100vw-32px))] border-2 border-gold bg-panel-solid p-5 shadow-xl sm:bottom-6 sm:right-6"
          initial={{ opacity: 0, y: reduced ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.25 }}
        >
          <button
            onClick={onClose}
            className="absolute right-2 top-1 px-2 py-1 text-xl text-muted"
            aria-label="Dismiss level-up celebration"
          >
            ×
          </button>
          <div className="grand-levelup-rune" aria-hidden="true">✧</div>
          <p className="eyebrow text-gold">✦ Level up ✦</p>
          <h2 className="mt-2 font-display text-3xl font-bold">
            Level {event.to}
          </h2>
          <p className="mt-2 text-sm text-muted">
            A new chapter in your adventure.
          </p>
          <p className="mt-3 border-t border-line pt-3 text-sm font-bold text-gold">
            +{event.bonusGold} gold unlocked
          </p>
          <p className="mt-2 text-xs text-muted">
            Keep going at your own pace.
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
