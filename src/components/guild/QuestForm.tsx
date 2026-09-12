"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import {
  ATTRIBUTES,
  ATTRIBUTE_META,
  DIFFICULTIES,
  DIFFICULTY_META,
  QUEST_TYPES,
  QUEST_TYPE_META,
  type Attribute,
  type Difficulty,
  type QuestType,
} from "@/lib/game";
import type { Profile, Quest, QuestInput } from "@/lib/types";
import { questInputSchema } from "@/lib/validation";
import { previewReward } from "./useGuild";

interface Props {
  open: boolean;
  quest: Quest | null;
  profile: Profile;
  onClose: () => void;
  onSubmit: (input: QuestInput) => Promise<boolean>;
}

type Errors = Partial<Record<"title" | "notes" | "dueDate", string>>;

export function QuestForm({ open, quest, profile, onClose, onSubmit }: Props) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [attribute, setAttribute] = useState<Attribute>("intellect");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [type, setType] = useState<QuestType>("once");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(quest?.title ?? "");
    setNotes(quest?.notes ?? "");
    setAttribute(quest?.attribute ?? "intellect");
    setDifficulty(quest?.difficulty ?? "medium");
    setType(quest?.type ?? "once");
    setDueDate(quest?.dueDate ?? "");
    setErrors({});
    setSaving(false);
  }, [open, quest]);

  const reward = previewReward(profile, { attribute, difficulty });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: QuestInput = {
      title,
      notes: notes.trim() ? notes.trim() : undefined,
      attribute,
      difficulty,
      type,
      dueDate: type === "once" && dueDate ? dueDate : null,
    };
    const parsed = questInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      titleRef.current?.focus();
      return;
    }
    setErrors({});
    setSaving(true);
    onClose();
    await onSubmit(parsed.data);
    setSaving(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={quest ? "Edit quest" : "Post a quest"}
      description={
        quest
          ? "Adjust the details. Past rewards stay in the Chronicle."
          : "Name the deed, pick the attribute it trains and how hard it honestly is."
      }
      initialFocusRef={titleRef}
      size="lg"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="quest-title" className="mb-1.5 block text-sm font-bold">
            Quest title
          </label>
          <input
            ref={titleRef}
            id="quest-title"
            className="input"
            placeholder="e.g. Read 20 pages of the dragon book"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "quest-title-error" : undefined}
            required
          />
          {errors.title && (
            <p id="quest-title-error" role="alert" className="mt-1 text-xs font-semibold text-danger">
              {errors.title}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Attribute trained</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ATTRIBUTES.map((key) => {
              const meta = ATTRIBUTE_META[key];
              const checked = attribute === key;
              return (
                <div key={key}>
                  <input
                    type="radio"
                    id={`attr-${key}`}
                    name="attribute"
                    value={key}
                    className="peer sr-only"
                    checked={checked}
                    onChange={() => setAttribute(key)}
                  />
                  <label
                    htmlFor={`attr-${key}`}
                    className="attr-pick flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2.5 transition-all hover:border-line-strong peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
                    style={{ "--attr-color": `var(--attr-${key})` } as React.CSSProperties}
                  >
                    <span aria-hidden="true" className="text-xl">
                      {meta.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold" style={{ color: `var(--attr-${key})` }}>
                        {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{meta.examples}</span>
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Difficulty</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {DIFFICULTIES.map((key) => {
              const meta = DIFFICULTY_META[key];
              return (
                <div key={key}>
                  <input
                    type="radio"
                    id={`diff-${key}`}
                    name="difficulty"
                    value={key}
                    className="peer sr-only"
                    checked={difficulty === key}
                    onChange={() => setDifficulty(key)}
                  />
                  <label
                    htmlFor={`diff-${key}`}
                    title={meta.hint}
                    className="flex cursor-pointer flex-col items-center rounded-xl border border-line bg-panel-2 px-1 py-2 text-center transition-all hover:border-line-strong peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
                  >
                    <span aria-hidden="true" className="text-[10px] tracking-tighter text-gold">
                      {"◆".repeat(meta.pips)}
                      <span className="opacity-30">{"◆".repeat(5 - meta.pips)}</span>
                    </span>
                    <span className="text-xs font-bold">{meta.label}</span>
                    <span className="text-[10px] text-muted">{meta.xp} XP</span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Quest type</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {QUEST_TYPES.map((key) => {
              const meta = QUEST_TYPE_META[key];
              return (
                <div key={key}>
                  <input
                    type="radio"
                    id={`type-${key}`}
                    name="type"
                    value={key}
                    className="peer sr-only"
                    checked={type === key}
                    onChange={() => setType(key)}
                  />
                  <label
                    htmlFor={`type-${key}`}
                    className="flex h-full cursor-pointer flex-col rounded-xl border border-line bg-panel-2 px-3 py-2 transition-all hover:border-line-strong peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
                  >
                    <span className="text-sm font-bold">
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </span>
                    <span className="text-[11px] leading-snug text-muted">{meta.blurb}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor="quest-notes" className="mb-1.5 block text-sm font-bold">
              Notes <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="quest-notes"
              className="input min-h-[4.5rem] resize-y"
              placeholder="Why it matters, or where to start."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              aria-invalid={Boolean(errors.notes)}
            />
          </div>
          {type === "once" && (
            <div>
              <label htmlFor="quest-due" className="mb-1.5 block text-sm font-bold">
                Due <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="quest-due"
                type="date"
                className="input"
                value={dueDate}
                min={profile.today}
                onChange={(e) => setDueDate(e.target.value)}
                aria-invalid={Boolean(errors.dueDate)}
              />
            </div>
          )}
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm"
          aria-live="polite"
        >
          <span className="text-muted">Reward preview</span>
          <span className="font-bold">
            <span className="text-xp-2">+{reward.xp} XP</span> ·{" "}
            <span className="text-gold-2">+{reward.gold} gold</span>
            <span className="ml-2 text-xs font-semibold text-muted">
              ×{reward.multiplier.toFixed(2)}
              {reward.affinity ? " · ★ class affinity" : ""}
              {reward.boosted ? " · ⚗️ elixir" : ""}
            </span>
          </span>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
            {quest ? "Save changes" : "Post quest"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
