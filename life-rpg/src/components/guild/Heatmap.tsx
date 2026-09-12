"use client";

import { formatDay } from "@/lib/dates";
import type { Profile } from "@/lib/types";

export function Heatmap({ profile }: { profile: Profile }) {
  const max = Math.max(1, ...profile.heatmap.map((d) => d.count));
  const weeks: Profile["heatmap"][] = [];
  for (let i = 0; i < profile.heatmap.length; i += 7) weeks.push(profile.heatmap.slice(i, i + 7));
  const active = profile.heatmap.filter((d) => d.count > 0).length;
  const weekMax = Math.max(1, ...profile.week.map((d) => d.xp));
  const weekTotal = profile.week.reduce((s, d) => s + d.xp, 0);

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="heat-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="heat-title" className="font-display text-lg font-bold">
          Twelve weeks of deeds
        </h3>
        <p className="text-xs text-muted">
          {active} active day{active === 1 ? "" : "s"} · longest streak {profile.longestStreak}
        </p>
      </div>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex gap-1" role="img" aria-label={`Activity heatmap: ${active} active days in the last 84 days`}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((d) => {
                const level = d.count === 0 ? 0 : Math.ceil((d.count / max) * 4);
                return (
                  <span
                    key={d.day}
                    className="heat-cell"
                    data-level={level}
                    data-today={d.day === profile.today}
                    title={`${formatDay(d.day)}: ${d.count} deed${d.count === 1 ? "" : "s"}, ${d.xp} XP`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <h4 className="eyebrow mb-2 mt-5">This week · {weekTotal} XP</h4>
      <ol className="flex h-24 items-end gap-1.5" aria-label="XP earned each day this week">
        {profile.week.map((d) => {
          const h = d.xp === 0 ? 4 : Math.max(8, Math.round((d.xp / weekMax) * 88));
          const isToday = d.day === profile.today;
          const future = d.day > profile.today;
          return (
            <li key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted">{d.xp > 0 ? d.xp : ""}</span>
              <span
                className="w-full rounded-t-md transition-[height] duration-700"
                style={{
                  height: h,
                  background: future
                    ? "var(--border)"
                    : isToday
                      ? "linear-gradient(180deg, var(--gold-2), var(--gold-deep))"
                      : "linear-gradient(180deg, var(--xp-2), var(--xp))",
                  opacity: future ? 0.5 : 1,
                }}
                aria-label={`${formatDay(d.day)}: ${d.xp} XP`}
              />
              <span className={`text-[10px] ${isToday ? "font-bold text-gold-2" : "text-muted"}`}>
                {formatDay(d.day).slice(0, 3)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
