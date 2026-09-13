"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const STEPS = [
  {
    icon: "⚜",
    title: "Seal a quest, earn loot",
    body: "The board already has a few starter quests. Tap the wax seal — XP and gold land instantly. That's the whole loop.",
  },
  {
    icon: "⚔️",
    title: "Six attributes, one hero",
    body: "Gym trains Strength. Reading trains Intellect. Your class earns +15% XP on its favoured attribute, so lean into the life you want.",
  },
  {
    icon: "🔥",
    title: "Streaks with mercy",
    body: "Consecutive days multiply XP up to +60%. Miss a day? A Streak Shield from the Armory absorbs it. There is no punishment, ever.",
  },
  {
    icon: "🪙",
    title: "Spend gold in the Armory",
    body: "Titles, companions, colour themes and potions. Seal three quests today to claim the Guild Contract bonus.",
  },
  {
    icon: "🔮",
    title: "Visit the Sanctum when it's heavy",
    body: "Tell the Oracle how you feel and it sizes a quest to your energy. Log a mood, light the focus candle, and slay the weekly boss with the XP you earn. Shortcuts: N new quest, 1–4 tabs, ? this briefing.",
  },
];

export function Briefing({
  open,
  onFinish,
}: {
  open: boolean;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  useEffect(() => {
    if (!open) {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the existing local editor/tutorial when its external open signal changes.
      setStep(0);
      return;
    }
    const raf = requestAnimationFrame(() => nextRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onFinish, step]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[92] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="briefing-title"
        >
          <motion.div
            key={step}
            initial={{ y: 18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="panel panel-gilded glow-ring relative w-full max-w-lg p-6 sm:p-8"
          >
            <p className="eyebrow">
              Guild briefing · {step + 1} of {STEPS.length}
            </p>
            <p className="mt-4 text-5xl" aria-hidden="true">
              {current.icon}
            </p>
            <h2 id="briefing-title" className="mt-4 font-display text-2xl font-bold">
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>

            <div className="mt-5 flex gap-1.5" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background: i <= step ? "var(--gold)" : "var(--border)",
                  }}
                />
              ))}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" className="btn btn-ghost" onClick={onFinish}>
                Skip briefing
              </button>
              <div className="flex gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setStep((s) => s - 1)}
                  >
                    Back
                  </button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  className="btn btn-primary"
                  onClick={() => (last ? onFinish() : setStep((s) => s + 1))}
                >
                  {last ? "Enter the hall" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
