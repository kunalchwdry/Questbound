"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { ATTRIBUTE_META } from "@/lib/game";
import type { Profile, Quest } from "@/lib/types";

interface PlanBundle {
  today: string;
  quests: Quest[];
  plannedMinutes: number;
  session: { explanation: string | null; energyLevel: string } | null;
}

interface ReplanResult {
  changes: {
    questId: number;
    title: string;
    action: string;
    detail: string;
    children?: string[];
  }[];
  nextQuestId: number | null;
  nextQuestTitle: string | null;
  explanation: string;
}

interface Props {
  profile: Profile;
  /** Bump this number to force a reload (e.g. after generating a plan). */
  refreshSignal?: number;
  onStartQuest: (id: number) => void;
  toast: (t: { title: string; body?: string; variant?: "default" | "success" | "danger" | "gold" | "info" }) => void;
}

export function DailyPlanStrip({ profile, refreshSignal = 0, onStartQuest, toast }: Props) {
  const [plan, setPlan] = useState<PlanBundle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [explain, setExplain] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<PlanBundle>("/api/plan/today")
      .then((data) => {
        if (!alive) return;
        setPlan(data);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setPlan(null);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
    // totalCompletions in deps: completing a quest peels it off the strip.
  }, [refreshSignal, profile.today, profile.totalCompletions]);

  async function rebalance() {
    if (rebalancing) return;
    setRebalancing(true);
    try {
      const res = await api<ReplanResult>("/api/plan/replan", {
        method: "POST",
        body: JSON.stringify({ reason: "manual" }),
      });
      setExplain(res.explanation);
      const fresh = await api<PlanBundle>("/api/plan/today").catch(() => null);
      if (fresh) setPlan(fresh);
      const real = res.changes.filter((c) => c.action !== "kept" && c.action !== "reordered");
      toast({
        title:
          real.length === 0
            ? "Plan still fits today"
            : `Chapter rebalanced — ${real.length} change${real.length === 1 ? "" : "s"}`,
        body: res.nextQuestTitle ? `Next up: ${res.nextQuestTitle}` : undefined,
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Couldn't rebalance",
        body: err instanceof Error ? err.message : "Try again shortly.",
        variant: "danger",
      });
    } finally {
      setRebalancing(false);
    }
  }

  if (!loaded || !plan || plan.quests.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel border-l-4 p-4 sm:p-5"
      style={{ borderLeftColor: "var(--gold)" }}
      aria-labelledby="daily-plan-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Today&rsquo;s chapter</p>
          <h2 id="daily-plan-title" className="font-display text-lg font-bold">
            The InnerLoop plan
          </h2>
          <p className="text-xs text-muted">
            {plan.quests.length} open quest{plan.quests.length === 1 ? "" : "s"} · ~
            {plan.plannedMinutes} min planned
            {plan.session ? ` · forged at ${plan.session.energyLevel} energy` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={rebalance}
          disabled={rebalancing}
          aria-busy={rebalancing}
          title="Missed something? Rebalance the day."
        >
          {rebalancing ? "Rebalancing…" : "⚖ Rebalance my day"}
        </button>
      </div>

      <ol className="mt-3 space-y-1.5" aria-label="Planned quests in order">
        <AnimatePresence initial={false}>
          {plan.quests.map((q, i) => {
            const mins = q.estimatedMinutes;
            return (
              <motion.li
                key={q.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2"
              >
                <span className="chip text-[10px] tabular-nums" aria-label={`Step ${i + 1}`}>
                  {i + 1}
                </span>
                <span aria-hidden="true">{ATTRIBUTE_META[q.attribute].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{q.title}</p>
                </div>
                {mins ? (
                  <span className="chip text-[10px] tabular-nums" aria-label={`Estimated ${mins} minutes`}>
                    {mins}m
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary min-h-8 px-3 text-xs"
                  onClick={() => onStartQuest(q.id)}
                  aria-label={`Start quest: ${q.title}`}
                >
                  Start
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {explain && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 rounded-xl border border-line-strong bg-panel-2 p-3 text-sm"
          role="status"
        >
          <p className="mb-1 text-[11px] font-bold text-gold-2">🔮 Why the plan changed</p>
          <p className="whitespace-pre-line leading-relaxed text-muted">{explain}</p>
        </motion.div>
      )}
    </motion.section>
  );
}
