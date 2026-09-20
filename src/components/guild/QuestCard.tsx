"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { formatDay } from "@/lib/dates";
import { ATTRIBUTE_META, DIFFICULTY_META, QUEST_TYPE_META } from "@/lib/game";
import type { Profile, Quest } from "@/lib/types";
import { SparkleBurst } from "./SparkleBurst";
import { previewReward, type RewardFloat } from "./useGuild";

interface Props {
  quest: Quest;
  profile: Profile;
  done: boolean;
  pending: boolean;
  floats: RewardFloat[];
  onComplete: (id: number) => void;
  onEdit: (quest: Quest) => void;
  onDelete: (id: number) => void;
  onSplit?: (id: number) => void;
}

export function QuestCard({
  quest,
  profile,
  done,
  pending,
  floats,
  onComplete,
  onEdit,
  onDelete,
  onSplit,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const reward = previewReward(profile, quest);
  const attr = ATTRIBUTE_META[quest.attribute];
  const diff = DIFFICULTY_META[quest.difficulty];
  const type = QUEST_TYPE_META[quest.type];
  const overdue = Boolean(quest.dueDate && !done && quest.dueDate < profile.today);
  const optimistic = quest.id < 0;
  // Offer "Split" when the quest is too large for a single focus block.
  const estMins = quest.estimatedMinutes ?? (quest.difficulty === "hard" ? 90 : quest.difficulty === "epic" ? 150 : 30);
  const splittable = Boolean(onSplit) && !done && !optimistic && estMins >= 60 && quest.questStatus !== "split";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={`panel relative overflow-hidden border-l-4 p-3.5 sm:p-4 ${done ? "opacity-75" : ""}`}
      style={{ borderLeftColor: `var(--attr-${quest.attribute})` }}
      aria-busy={pending || optimistic}
    >
      {floats.map((f) => (
        <span key={f.id} className="float-reward" aria-hidden="true">
          +{f.xp} XP · +{f.gold} 🪙{f.boosted ? " · 2×" : ""}
        </span>
      ))}

      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 inline-flex">
          <button
            type="button"
            className="seal"
            data-done={done}
            disabled={done || pending || optimistic}
            onClick={() => onComplete(quest.id)}
            aria-label={done ? `${quest.title} — completed` : `Complete quest: ${quest.title}`}
          >
            {done ? (
              <span aria-hidden="true" className="text-lg font-black">
                ✓
              </span>
            ) : (
              <span aria-hidden="true" className="text-lg">
                ⚜
              </span>
            )}
          </button>
          {floats.length > 0 && <SparkleBurst />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`font-bold leading-snug ${done ? "text-muted line-through" : ""}`}>
              {quest.title}
            </h3>
            {quest.type === "habit" && quest.timesToday > 0 && (
              <span className="chip">×{quest.timesToday} today</span>
            )}
            {quest.type === "daily" && done && <span className="chip">Returns at dawn</span>}
          </div>
          {quest.notes && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{quest.notes}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="chip" style={{ color: `var(--attr-${quest.attribute})` }}>
              <span aria-hidden="true">{attr.icon}</span>
              {attr.label}
            </span>
            <span className="chip" aria-label={`Difficulty: ${diff.label}`}>
              <span aria-hidden="true" className="tracking-tighter text-gold">
                {"◆".repeat(diff.pips)}
                <span className="opacity-30">{"◆".repeat(5 - diff.pips)}</span>
              </span>
              {diff.label}
            </span>
            <span className="chip">
              <span aria-hidden="true">{type.icon}</span>
              {type.label}
            </span>
            {quest.dueDate && (
              <span className={`chip ${overdue ? "border-danger/50 text-danger" : ""}`}>
                {overdue ? "Overdue · " : "Due "}
                {formatDay(quest.dueDate)}
              </span>
            )}
            {quest.estimatedMinutes != null && (
              <span className="chip tabular-nums" aria-label={`Estimated ${quest.estimatedMinutes} minutes`}>
                ⏱ {quest.estimatedMinutes}m
              </span>
            )}
            {quest.planContext?.source === "split" && quest.planContext.splitFrom && (
              <span className="chip" title={`Split from: ${quest.planContext.splitFrom}`}>
                ✂ part of “{quest.planContext.splitFrom}”
              </span>
            )}
            {!done && (
              <span className="ml-auto whitespace-nowrap font-bold text-muted">
                <span className="text-xp-2">+{reward.xp} XP</span> ·{" "}
                <span className="text-gold-2">+{reward.gold} gold</span>
                {reward.boosted && <span className="text-xp-2"> · 2×</span>}
                {reward.affinity && (
                  <span className="text-gold-2" title="Class affinity">
                    {" "}
                    · ★
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-1">
          {confirming ? (
            <>
              <span className="text-xs font-semibold text-muted">Abandon?</span>
              <button
                type="button"
                className="btn btn-danger btn-icon"
                onClick={() => {
                  setConfirming(false);
                  onDelete(quest.id);
                }}
                aria-label={`Confirm: abandon ${quest.title}`}
              >
                ✓
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setConfirming(false)}
                aria-label="Cancel"
                autoFocus
              >
                ×
              </button>
            </>
          ) : (
            <>
              {splittable && (
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => onSplit!(quest.id)}
                  aria-label={`Split quest into smaller steps: ${quest.title}`}
                  title="Split into smaller quests"
                >
                  <span aria-hidden="true">✂</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => onEdit(quest)}
                aria-label={`Edit quest: ${quest.title}`}
                disabled={optimistic}
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setConfirming(true)}
                aria-label={`Abandon quest: ${quest.title}`}
                disabled={optimistic}
              >
                <span aria-hidden="true">🗑</span>
              </button>
            </>
          )}
        </div>
      </div>
    </motion.li>
  );
}
