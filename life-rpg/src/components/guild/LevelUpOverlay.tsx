"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import type { LevelUpEvent } from "./useGuild";

export function LevelUpOverlay({
  event,
  onClose,
}: {
  event: LevelUpEvent | null;
  onClose: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!event) return;
    const raf = requestAnimationFrame(() => buttonRef.current?.focus());
    if (!reduced) {
      import("canvas-confetti").then(({ default: confetti }) => {
        const colors = ["#f8de93", "#e2b95b", "#8f7bff", "#ffffff"];
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors, zIndex: 120 });
        window.setTimeout(
          () => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 120 }),
          250,
        );
        window.setTimeout(
          () => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 120 }),
          420,
        );
      });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
    };
  }, [event, reduced, onClose]);

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="levelup-title"
        >
          <div className="burst-ring absolute h-72 w-72 rounded-full border-2 border-gold" aria-hidden="true" />
          <div
            className="burst-ring absolute h-72 w-72 rounded-full border border-gold-2"
            style={{ animationDelay: "200ms" }}
            aria-hidden="true"
          />
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="panel panel-gilded glow-ring relative w-full max-w-md p-8 text-center"
          >
            <p className="eyebrow">Level up</p>
            <p
              className="mt-2 bg-gradient-to-b from-gold-2 to-gold-deep bg-clip-text font-display text-8xl font-black leading-none text-transparent"
              aria-hidden="true"
            >
              {event.to}
            </p>
            <h2 id="levelup-title" className="mt-3 font-display text-2xl font-bold">
              You reached level {event.to}
            </h2>
            <p className="mt-2 text-muted">
              Rank: <strong className="text-ink">{event.rank}</strong>. The guild treasurer hands you{" "}
              <strong className="text-gold-2">+{event.bonusGold} gold</strong>.
            </p>
            <button
              ref={buttonRef}
              type="button"
              className="btn btn-primary mt-6 w-full text-base"
              onClick={onClose}
            >
              Continue the legend
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
