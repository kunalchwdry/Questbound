"use client";

import { motion } from "motion/react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { ATTRIBUTE_META, DIFFICULTY_META } from "@/lib/game";
import { SIZE_BUCKETS } from "@/lib/innerloop/sizing";
import type { Quest } from "@/lib/types";

type Energy = "high" | "medium" | "low";
type MoodTag = "calm" | "focused" | "tired" | "anxious" | "overwhelmed" | "frustrated" | "neutral";

const ENERGIES: { key: Energy; icon: string; label: string; blurb: string }[] = [
  { key: "high", icon: "⚡", label: "High", blurb: "Deep work ok" },
  { key: "medium", icon: "🌤️", label: "Medium", blurb: "Normal pace" },
  { key: "low", icon: "🕯️", label: "Low", blurb: "Gentle steps" },
];

const MOODS: { key: MoodTag; icon: string; label: string }[] = [
  { key: "calm", icon: "🌊", label: "Calm" },
  { key: "focused", icon: "🎯", label: "Focused" },
  { key: "tired", icon: "😴", label: "Tired" },
  { key: "anxious", icon: "🌀", label: "Anxious" },
  { key: "overwhelmed", icon: "🌪️", label: "Overwhelmed" },
  { key: "frustrated", icon: "💢", label: "Frustrated" },
  { key: "neutral", icon: "😐", label: "Neutral" },
];

const TIME_CHOICES = [30, 45, 60, 90, 120, 180, 240];

interface PlanQuestOut extends Quest {
  estimatedMinutes?: number | null;
}
interface PlanResponse {
  plan: {
    sessionId: number;
    quests: PlanQuestOut[];
    explanation: string;
    budgetMinutes: number;
    scheduledMinutes: number;
    oracleNamed: boolean;
  };
}

interface Props {
  /** Latest mood tag from the check-in rail (for prefill). */
  latestMood?: string | null;
  onPlanAccepted: () => void;
  toast: (t: { title: string; body?: string; variant?: "default" | "success" | "danger" | "gold" | "info" }) => void;
}

export function PlanMyDay({ latestMood, onPlanAccepted, toast }: Props) {
  const [goal, setGoal] = useState("");
  const [minutes, setMinutes] = useState(60);
  // Prefill from the latest mood check-in via lazy initialisers (runs once).
  const [energy, setEnergy] = useState<Energy>(() => {
    const key = (latestMood ?? "").toLowerCase();
    return ["tired", "sad"].includes(key) ? "low" : "medium";
  });
  const [mood, setMood] = useState<MoodTag | null>(() => {
    const key = (latestMood ?? "").toLowerCase();
    if (["joy", "calm"].includes(key)) return "calm";
    if (["tired", "sad"].includes(key)) return "tired";
    if (key === "anxious") return "anxious";
    if (key === "overwhelmed") return "overwhelmed";
    if (key === "frustrated") return "frustrated";
    return null;
  });
  const [deadlines, setDeadlines] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<PlanResponse["plan"] | null>(null);

  const canSubmit = useMemo(
    () => goal.trim().length >= 2 || minutes > 0,
    [goal, minutes],
  );

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setProposal(null);
    try {
      const res = await api<PlanResponse>("/api/plan/generate", {
        method: "POST",
        body: JSON.stringify({
          goal: goal.trim(),
          availableMinutes: minutes,
          energy,
          mood,
          deadlines: deadlines.trim() || null,
        }),
      });
      setProposal(res.plan);
    } catch (err) {
      toast({
        title: "The Oracle couldn't draft a plan",
        body: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!proposal) return;
    setProposal(null);
    setGoal("");
    onPlanAccepted();
    toast({
      title: `${proposal.quests.length} quests posted to today's chapter`,
      body: `${proposal.scheduledMinutes} min planned · open the Quest Board to begin.`,
      variant: "success",
    });
  }

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="plan-title">
      <p className="eyebrow">InnerLoop</p>
      <h3 id="plan-title" className="font-display text-lg font-bold">
        Plan my day
      </h3>
      <p className="text-xs text-muted">
        Tell the Oracle your goal and capacity — it decomposes the day into right-sized quests.{" "}
        <span className="font-semibold">Reality&apos;s first draft.</span>
      </p>

      <form onSubmit={generate} className="mt-3 space-y-3">
        <div>
          <label htmlFor="plan-goal" className="text-xs font-bold">
            Goal
          </label>
          <input
            id="plan-goal"
            className="input mt-1"
            placeholder={"e.g. Study machine learning"}
            value={goal}
            maxLength={120}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>

        <div>
          <p className="text-xs font-bold" id="energy-label">
            Energy
          </p>
          <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-labelledby="energy-label">
            {ENERGIES.map((en) => (
              <button
                key={en.key}
                type="button"
                aria-pressed={energy === en.key}
                onClick={() => setEnergy(en.key)}
                className={`rounded-xl border px-2 py-2 text-center transition-all ${
                  energy === en.key
                    ? "border-gold bg-gold/10"
                    : "border-line bg-panel-2 hover:border-line-strong"
                }`}
              >
                <span className="text-xl" aria-hidden="true">
                  {en.icon}
                </span>
                <p className="text-[11px] font-bold">{en.label}</p>
                <p className="text-[10px] text-muted">{en.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold" id="mood-label">
            Mood <span className="font-normal text-muted">(optional)</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-labelledby="mood-label">
            {MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mood === m.key}
                onClick={() => setMood((cur) => (cur === m.key ? null : m.key))}
                className={`chip cursor-pointer ${
                  mood === m.key
                    ? "border-gold bg-gold/10 text-gold-2"
                    : "hover:border-line-strong"
                }`}
              >
                <span aria-hidden="true">{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold">
            Available time: <span className="text-gold-2">{minutes} min</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TIME_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                className={`chip cursor-pointer tabular-nums ${
                  minutes === m ? "border-gold text-gold-2" : "hover:border-line-strong"
                }`}
                onClick={() => setMinutes(m)}
              >
                {m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="plan-deadlines" className="text-xs font-bold">
            Deadlines <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="plan-deadlines"
            className="input mt-1"
            placeholder="e.g. submit assignment Friday"
            value={deadlines}
            maxLength={120}
            onChange={(e) => setDeadlines(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit || busy} aria-busy={busy}>
          {busy ? "Consulting the Oracle…" : "⚜ Forge my chapter"}
        </button>
      </form>

      {busy && (
        <div className="mt-3 space-y-2" aria-label="Drafting your plan">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-5/6" />
          <div className="skeleton h-12 w-4/6" />
        </div>
      )}

      {proposal && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3"
        >
          <div className="rounded-xl border border-line-strong bg-panel-2 p-3 text-sm">
            <p className="mb-1 text-[11px] font-bold text-gold-2">🔮 The Oracle speaks</p>
            <p className="leading-relaxed text-muted">{proposal.explanation}</p>
          </div>
          <ul className="space-y-2" aria-label="Proposed quests">
            {proposal.quests.map((q, i) => (
              <li key={q.id ?? i} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
                <span className="chip text-[10px]" aria-hidden="true">
                  {i + 1}
                </span>
                <span aria-hidden="true">{ATTRIBUTE_META[q.attribute].icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{q.title}</p>
                  <p className="text-[11px] text-muted">
                    {DIFFICULTY_META[q.difficulty].label} ·{" "}
                    {q.estimatedMinutes
                      ? `${q.estimatedMinutes} min · ${SIZE_BUCKETS.small && sizeLabel(q.estimatedMinutes)}`
                      : DIFFICULTY_META[q.difficulty].hint}
                  </p>
                </div>
                <span className="whitespace-nowrap text-[11px] font-bold text-xp-2">
                  +{DIFFICULTY_META[q.difficulty].xp} XP
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" onClick={accept}>
              Accept — post {proposal.quests.length} quests
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setProposal(null)}>
              Redo
            </button>
          </div>
        </motion.div>
      )}
    </section>
  );
}

function sizeLabel(minutes: number): string {
  if (minutes <= 15) return "Tiny";
  if (minutes <= 30) return "Small";
  if (minutes <= 60) return "Medium";
  if (minutes <= 120) return "Large";
  return "Epic";
}
