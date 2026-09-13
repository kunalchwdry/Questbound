"use client";

import { useState } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ATTRIBUTE_META, CLASSES, streakMultiplier } from "@/lib/game";
import { useCountUp } from "@/lib/hooks";
import type { Profile } from "@/lib/types";

export function CharacterSheet({
  profile,
  onOpenSettings,
  onOpenBriefing,
}: {
  profile: Profile;
  onOpenSettings: () => void;
  onOpenBriefing: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const gold = useCountUp(profile.gold);
  const xpInto = useCountUp(profile.xpIntoLevel);
  const cls = CLASSES[profile.classKey];
  const ring = `conic-gradient(var(--gold) ${Math.round(profile.progress * 360)}deg, color-mix(in srgb, var(--gold) 14%, transparent) 0)`;
  const unlocked = profile.achievements.filter((a) => a.unlocked).length;

  const streakHint = profile.streak === 0
    ? "Complete any quest to light the flame."
    : profile.streakActiveToday
      ? `Best: ${profile.longestStreak} days`
      : profile.shieldPending
        ? "A shield will save it when you act today."
        : "Complete a quest today to keep it alive.";

  return (
    <div className="panel panel-gilded p-5 sm:p-6" data-magic-reveal>
      <div className="flex items-center gap-4">
        <div className="relative flex-none magic-portrait">
          <div
            className="grid h-20 w-20 place-items-center rounded-full p-[3px] transition-[background] duration-700"
            style={{ background: ring }}
            aria-hidden="true"
          >
            <div className="grid h-full w-full place-items-center rounded-full bg-panel-solid text-4xl">
              {cls.icon}
            </div>
          </div>
          <span
            className="absolute -bottom-1 -right-1 rounded-full border border-gold-deep bg-gold px-2 py-0.5 font-display text-xs font-black text-gold-ink"
            aria-hidden="true"
          >
            {profile.level}
          </span>
          {profile.companion && (
            <span
              className="absolute -left-2 -top-1 text-xl drop-shadow"
              role="img"
              aria-label="Your companion"
            >
              {profile.companion}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate font-display text-xl font-bold">{profile.displayName}</h2>
            <button
              type="button"
              className="btn btn-ghost btn-icon shrink-0"
              onClick={onOpenSettings}
              aria-label="Edit hero name and class"
              title="Hero ledger"
            >
              <span aria-hidden="true">✎</span>
            </button>
          </div>
          {profile.title && (
            <p className="truncate text-sm italic text-gold-2">{profile.title}</p>
          )}
          <p className="text-xs text-muted">
            Level {profile.level} {profile.rank} · {cls.label}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-bold text-xp-2">Experience</span>
          <span className="tabular-nums text-muted">
            {xpInto} / {profile.xpForNext} XP
          </span>
        </div>
        <ProgressBar
          value={profile.xpIntoLevel}
          max={profile.xpForNext}
          label={`Level ${profile.level} progress`}
        />
        <p className="mt-1 text-[11px] text-muted">
          {profile.xpForNext - profile.xpIntoLevel} XP to level {profile.level + 1}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-panel-2 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Gold</dt>
          <dd className="font-display text-2xl font-bold tabular-nums text-gold-2">
            <span aria-hidden="true">🪙</span> {gold}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-panel-2 p-3">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">Streak</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">
            <span
              className={profile.streak > 0 && profile.streakActiveToday ? "flame" : "opacity-50 grayscale"}
              aria-hidden="true"
            >
              🔥
            </span>{" "}
            {profile.streak}
            <span className="ml-1 font-body text-xs font-semibold text-muted">
              day{profile.streak === 1 ? "" : "s"}
            </span>
          </dd>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{streakHint}</p>
        </div>
      </dl>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Active bonuses">
        <li className="chip" title="Streak XP multiplier">
          ×{streakMultiplier(profile.streak).toFixed(2)} streak XP
        </li>
        <li className="chip" title="Class affinity">
          <span aria-hidden="true">★</span> +15% {ATTRIBUTE_META[cls.affinity].label}
        </li>
        {profile.shields > 0 && (
          <li className="chip">
            <span aria-hidden="true">🛡️</span> {profile.shields} shield{profile.shields > 1 ? "s" : ""}
          </li>
        )}
        {profile.boostCharges > 0 && (
          <li className="chip text-xp-2">
            <span aria-hidden="true">⚗️</span> 2× XP · {profile.boostCharges} left
          </li>
        )}
      </ul>

      <div className={expanded ? "" : "hidden lg:block"}>
        <h3 className="eyebrow mb-3 mt-6">Attributes</h3>
        <ul className="space-y-3">
          {profile.attributes.map((a) => {
            const meta = ATTRIBUTE_META[a.key];
            const affinity = cls.affinity === a.key;
            return (
              <li key={a.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold">
                    <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    {affinity && (
                      <span className="ml-1 text-gold-2" title="Class affinity: +15% XP">
                        ★
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    Lv {a.level} · {a.into}/{a.needed}
                  </span>
                </div>
                <ProgressBar
                  value={a.into}
                  max={a.needed}
                  label={`${meta.label} level ${a.level} progress`}
                  color={`var(--attr-${a.key})`}
                  className="mt-1.5"
                />
              </li>
            );
          })}
        </ul>

        <h3 className="eyebrow mb-3 mt-6">
          Achievements <span className="text-muted">{unlocked}/{profile.achievements.length}</span>
        </h3>
        <ul className="grid grid-cols-6 gap-2">
          {profile.achievements.map((a) => (
            <li
              key={a.key}
              role="img"
              aria-label={`${a.name}: ${a.description} ${a.unlocked ? "Unlocked." : "Locked."}`}
              title={`${a.name} — ${a.description}`}
              className={`grid aspect-square place-items-center rounded-xl border text-xl transition-all ${
                a.unlocked
                  ? "border-line-strong bg-gold/10 shadow-[0_0_18px_-6px_var(--gold)]"
                  : "border-line opacity-35 grayscale"
              }`}
            >
              <span aria-hidden="true">{a.icon}</span>
            </li>
          ))}
        </ul>

        {profile.badges.length > 0 && (
          <>
            <h3 className="eyebrow mb-3 mt-6">Crests</h3>
            <ul className="flex flex-wrap gap-2" aria-label="Profile crests">
              {profile.badges.map((b, i) => (
                <li
                  key={`${b}-${i}`}
                  className="grid h-10 w-10 place-items-center rounded-full border border-line-strong bg-gold/10 text-lg"
                >
                  <span aria-hidden="true">{b}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-6 text-[11px] text-muted">
          {profile.totalCompletions} deed{profile.totalCompletions === 1 ? "" : "s"} recorded ·
          Member since{" "}
          {new Date(profile.joinedAt).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-ghost mt-4 w-full lg:hidden"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "Hide" : "Show"} attributes &amp; achievements
      </button>
    </div>
  );
}
