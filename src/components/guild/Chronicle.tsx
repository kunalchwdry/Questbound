"use client";

import { formatDay, formatRelativeTime } from "@/lib/dates";
import { ATTRIBUTE_META, DIFFICULTY_META } from "@/lib/game";
import type { HistoryEntry, Profile } from "@/lib/types";
import { Heatmap } from "./Heatmap";
import { InsightsCard } from "./InsightsCard";

export function Chronicle({ history, profile }: { history: HistoryEntry[]; profile: Profile }) {
  const todayEntries = history.filter((h) => h.completedOn === profile.today);
  const todayXp = todayEntries.reduce((s, h) => s + h.xp, 0);
  const todayGold = todayEntries.reduce((s, h) => s + h.gold, 0);

  const groups = new Map<string, HistoryEntry[]>();
  for (const h of history) {
    const list = groups.get(h.completedOn) ?? [];
    list.push(h);
    groups.set(h.completedOn, list);
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <h2 className="font-display text-xl font-bold">The Chronicle</h2>
        <p className="text-sm text-muted">
          Every deed is written to the ledger the moment you seal it. Nothing here can be edited.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Deeds today" value={String(todayEntries.length)} />
          <Stat label="XP today" value={`+${todayXp}`} accent="var(--xp-2)" />
          <Stat label="Gold today" value={`+${todayGold}`} accent="var(--gold-2)" />
          <Stat label="All-time deeds" value={String(profile.totalCompletions)} />
        </dl>
      </div>

      <Heatmap profile={profile} />

      <InsightsCard />

      {groups.size === 0 ? (
        <div className="panel rise p-10 text-center">
          <p className="text-4xl" aria-hidden="true">
            📖
          </p>
          <h3 className="mt-3 font-display text-lg font-bold">The first page is blank</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Seal a quest on the board and your legend begins here.
          </p>
        </div>
      ) : (
        Array.from(groups.entries()).map(([day, entries]) => (
          <section key={day} aria-labelledby={`chron-${day}`}>
            <h3 id={`chron-${day}`} className="eyebrow mb-2 px-1">
              {day === profile.today ? "Today" : formatDay(day)}
              <span className="ml-2 normal-case tracking-normal text-muted">
                {entries.length} deed{entries.length === 1 ? "" : "s"}
              </span>
            </h3>
            <ol className="panel divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-lg"
                    style={{ color: `var(--attr-${e.attribute})` }}
                    aria-hidden="true"
                  >
                    {ATTRIBUTE_META[e.attribute].icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.title}</p>
                    <p className="text-xs text-muted">
                      {ATTRIBUTE_META[e.attribute].label} · {DIFFICULTY_META[e.difficulty].label} ·
                      ×{(e.multiplierPct / 100).toFixed(2)} · <span aria-hidden="true">🔥</span>
                      <span className="sr-only">streak</span> {e.streakAfter} ·{" "}
                      <time dateTime={e.completedAt}>{formatRelativeTime(e.completedAt)}</time>
                    </p>
                  </div>
                  <div className="text-right text-sm font-bold tabular-nums">
                    <p className="text-xp-2">+{e.xp} XP</p>
                    <p className="text-gold-2">
                      +{e.gold} gold
                      {e.crit && <span className="chip ml-1 border-gold text-gold-2">CRIT</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="font-display text-xl font-bold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </dd>
    </div>
  );
}
