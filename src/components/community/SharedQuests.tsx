"use client";
import Link from "next/link";
import type { SharedQuest } from "@/lib/community-types";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/game";
import { useWorld } from "./WorldShell";
import { Meter } from "./WorldUI";
export function SharedQuestCard({
  quest: q,
  guild = false,
  reload,
}: {
  quest: SharedQuest;
  guild?: boolean;
  reload: () => void;
}) {
  const { act, busy } = useWorld();
  const completed = q.status === "completed";
  const active = q.status === "active";
  const starting = new Date(q.starts_at) > new Date();
  const progress = Math.min(
    100,
    Math.round((q.progress / Math.max(1, q.target)) * 100),
  );
  const metric =
    q.metric === "xp"
      ? "XP"
      : q.metric === "members"
        ? "heroes"
        : q.metric === "streak_days"
          ? "active days"
          : "sessions";
  return (
    <article className={`w-shared-quest ${completed ? "is-completed" : ""}`}>
      <div className="w-shared-quest-top">
        <span className="w-quest-icon" aria-hidden="true">
          {q.icon || "⚔"}
        </span>
        <div>
          <p className="w-eyebrow">
            {completed
              ? "THE GUILD DID IT"
              : starting
                ? "ON THE HORIZON"
                : active
                  ? "ADVENTURE IN PROGRESS"
                  : q.status.toUpperCase()}
          </p>
          <h3>{q.title}</h3>
        </div>
        <span className="w-quest-number">
          {progress}
          <small>%</small>
        </span>
      </div>
      <p>{q.description}</p>
      <div className="w-quest-progress">
        <strong>
          {q.progress.toLocaleString()}{" "}
          <span>
            / {q.target.toLocaleString()} {metric}
          </span>
        </strong>
        <span>
          {q.participants} {q.participants === 1 ? "hero" : "heroes"} enlisted
        </span>
      </div>
      <Meter value={q.progress} max={q.target} label={`${q.title} progress`} />
      <div className="w-quest-rewards">
        <span>
          ✧ {guild ? q.reward_xp : Math.min(100, q.reward_xp)}{" "}
          {guild ? "Guild XP" : "XP"}
        </span>
        <span>◈ {Math.min(50, q.reward_gold)} gold / contributor</span>
        <span>☼ Up to {Math.min(5, q.reward_reputation)} reputation</span>
      </div>
      <div className="w-shared-quest-bottom">
        <div>
          <p>
            {q.attribute
              ? `Attribute: ${ATTRIBUTE_META[q.attribute as (typeof ATTRIBUTES)[number]]?.label ?? q.attribute}`
              : metric === "sessions"
                ? "Every completed quest counts"
                : "Progress comes from completed quests"}
          </p>
          <small>
            {q.ends_at
              ? `Ends ${new Date(q.ends_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
              : "No end date"}
            {q.joined ? ` · You contributed ${q.contribution}` : ""}
          </small>
        </div>
        {completed && q.joined && q.contribution > 0 ? (
          <button
            className="w-btn w-btn-primary"
            disabled={busy || q.reward_claimed}
            onClick={async () => {
              try {
                await act({
                  action: guild ? "claimQuest" : "claimChallenge",
                  id: q.id,
                });
                reload();
              } catch {}
            }}
          >
            {q.reward_claimed ? "✓ Reward claimed" : "Claim your reward"}
          </button>
        ) : active && !q.joined ? (
          <button
            className="w-btn w-btn-primary"
            disabled={busy}
            onClick={async () => {
              try {
                await act({
                  action: guild ? "joinQuest" : "joinChallenge",
                  id: q.id,
                });
                reload();
              } catch {}
            }}
          >
            Join the quest →
          </button>
        ) : q.joined && active ? (
          <Link className="w-btn" href="/guild">
            Complete a real-life quest →
          </Link>
        ) : (
          <span className="w-muted">
            {completed ? "A shared victory" : "Quest closed"}
          </span>
        )}
      </div>
    </article>
  );
}
export function SharedQuestForm({
  guildId,
  onDone,
}: {
  guildId?: number;
  onDone: () => void;
}) {
  const { act, busy } = useWorld();
  return (
    <form
      className="w-form w-inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const values = {
          title: String(f.get("title")),
          description: String(f.get("description")),
          target: Number(f.get("target")),
          days: Number(f.get("days")),
        };
        try {
          if (guildId)
            await act({
              action: "createGuildQuest",
              guildId,
              ...values,
              attribute: (f.get("attribute") || null) as
                | (typeof ATTRIBUTES)[number]
                | null,
            });
          else
            await act({
              action: "createChallenge",
              ...values,
              metric: f.get("metric") as
                | "sessions"
                | "xp"
                | "members"
                | "streak_days",
            });
          onDone();
        } catch {}
      }}
    >
      <h3>
        {guildId ? "Write a shared quest" : "Start a community challenge"}
      </h3>
      <label>
        Quest title
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          placeholder="Seven days of showing up"
        />
      </label>
      <label>
        What are we working toward?
        <textarea name="description" maxLength={1500} rows={2} />
      </label>
      <div className="w-form-columns">
        <label>
          Target
          <input
            name="target"
            type="number"
            required
            min={10}
            max={guildId ? 1000 : 100000}
            defaultValue={50}
          />
        </label>
        <label>
          Duration in days
          <input
            name="days"
            type="number"
            required
            min={1}
            max={30}
            defaultValue={7}
          />
        </label>
      </div>
      {guildId ? (
        <label>
          Which attribute counts?
          <select name="attribute">
            <option value="">Any completed quest</option>
            {ATTRIBUTES.map((a) => (
              <option value={a} key={a}>
                {ATTRIBUTE_META[a].label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Measure
          <select name="metric">
            <option value="sessions">Completed sessions</option>
            <option value="streak_days">
              Active days (one per hero per UTC day)
            </option>
            <option value="xp">Quest XP</option>
            <option value="members">Unique contributing heroes</option>
          </select>
        </label>
      )}
      <p className="w-muted">
        Rewards are fixed by the server: {guildId ? "500 Guild XP" : "100 XP"},
        50 gold and up to 5 reputation per contributor.{" "}
        {guildId ? "One guild quest can be created every seven days." : ""}
      </p>
      <div className="w-actions">
        <button className="w-btn w-btn-primary" disabled={busy}>
          Raise the quest banner →
        </button>
        <button className="w-text-btn" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
