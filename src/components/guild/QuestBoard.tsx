"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { Profile, Quest, QuestInput } from "@/lib/types";
import { QuestCard } from "./QuestCard";
import { QuestForm } from "./QuestForm";
import { isQuestDone, type RewardFloat } from "./useGuild";

type Filter = "all" | "daily" | "habit" | "once" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "daily", label: "Dailies" },
  { key: "habit", label: "Habits" },
  { key: "once", label: "One-offs" },
  { key: "done", label: "Sealed" },
];

interface Props {
  profile: Profile;
  quests: Quest[];
  floats: RewardFloat[];
  pending: Set<number>;
  onComplete: (id: number) => void;
  onCreate: (input: QuestInput) => Promise<boolean>;
  onUpdate: (id: number, patch: Partial<QuestInput>) => Promise<boolean>;
  onDelete: (id: number) => void;
  onSplit?: (id: number) => void;
  /** Incrementing this number from outside opens the "new quest" form (keyboard shortcut). */
  openSignal?: number;
}

export function QuestBoard({
  profile,
  quests,
  floats,
  pending,
  onComplete,
  onCreate,
  onUpdate,
  onDelete,
  onSplit,
  openSignal = 0,
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Quest | null>(null);
  const today = profile.today;

  useEffect(() => {
    if (openSignal > 0) {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the existing local editor/tutorial when its external open signal changes.
      setEditing(null);
      setFormOpen(true);
    }
  }, [openSignal]);

  const visible = useMemo(() => {
    const list = quests.filter((q) => {
      if (filter === "done") return isQuestDone(q, today);
      // One-offs sealed on a previous day retire from the board (still in "Sealed").
      if (q.type === "once" && q.completedAt && q.lastCompletedOn !== today) return false;
      if (filter === "all") return true;
      return q.type === filter;
    });
    if (filter === "done") return list;
    const active = list.filter((q) => !isQuestDone(q, today));
    const done = list.filter((q) => isQuestDone(q, today));
    return [...active, ...done];
  }, [quests, filter, today]);

  const dailies = quests.filter((q) => q.type === "daily");
  const dailiesDone = dailies.filter((q) => isQuestDone(q, today)).length;
  const activeCount = quests.filter((q) => !isQuestDone(q, today)).length;

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Quest Board</h2>
            <p className="text-sm text-muted">
              {activeCount === 0
                ? "The board is clear. Post something worth doing."
                : `${activeCount} quest${activeCount === 1 ? "" : "s"} awaiting your seal.`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <span aria-hidden="true">＋</span> Post a quest
          </button>
        </div>

        {dailies.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-bold">Today&apos;s dailies</span>
              <span className="tabular-nums text-muted">
                {dailiesDone} / {dailies.length} sealed
                {dailiesDone === dailies.length ? " — a perfect day" : ""}
              </span>
            </div>
            <ProgressBar
              value={dailiesDone}
              max={dailies.length}
              label="Dailies completed today"
              color="linear-gradient(90deg, var(--ember), var(--gold-2))"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter quests">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`chip cursor-pointer transition-colors ${
                filter === f.key ? "border-gold bg-gold/15 text-gold-2" : "hover:border-line-strong hover:text-ink"
              }`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="panel rise p-10 text-center">
          <p className="text-4xl" aria-hidden="true">
            {filter === "done" ? "📜" : "🕯️"}
          </p>
          <h3 className="mt-3 font-display text-lg font-bold">
            {filter === "done" ? "Nothing sealed yet" : "An empty board"}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {filter === "done"
              ? "Complete a quest and it will appear here until the day turns."
              : "Try a Trivial quest first — momentum is the real loot. Something like “Drink a glass of water” pays 10 XP."}
          </p>
          {filter !== "done" && (
            <button
              type="button"
              className="btn btn-primary mt-5"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Post your first quest
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Quests">
          <AnimatePresence initial={false}>
            {visible.map((q) => (
              <QuestCard
                key={q.id}
                quest={q}
                profile={profile}
                done={isQuestDone(q, today)}
                pending={pending.has(q.id)}
                floats={floats.filter((f) => f.questId === q.id)}
                onComplete={onComplete}
                onEdit={(quest) => {
                  setEditing(quest);
                  setFormOpen(true);
                }}
                onDelete={onDelete}
                onSplit={onSplit}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <QuestForm
        open={formOpen}
        quest={editing}
        profile={profile}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => (editing ? onUpdate(editing.id, input) : onCreate(input))}
      />
    </div>
  );
}
