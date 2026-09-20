"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { ATTRIBUTE_META } from "@/lib/game";

interface Report {
  windowDays: number;
  completedQuests: number;
  xpEarned: number;
  completionRate: number | null;
  avgMinutes: number | null;
  bestPeriod: string | null;
  bestBucket: string | null;
  missedScheduled: number;
  postponementRate: number | null;
  attributeSplit: { attribute: keyof typeof ATTRIBUTE_META; count: number }[];
  insights: { icon: string; text: string; evidence: string }[];
  summary: string | null;
}

interface Profile {
  avgCompletedMinutes: number | null;
  bestBucket: string | null;
  bestPeriod: string | null;
  dailyCapacity: number | null;
  postponementRate: number | null;
  sweetSpotMinutes: number | null;
}

export function InsightsCard() {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [data, setData] = useState<{ report: Report; profile: Profile } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ report: Report; profile: Profile }>(`/api/insights?days=${windowDays}`)
      .then((r) => alive && setData(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [windowDays]);

  if (failed) return null;
  if (!data) {
    return (
      <div className="panel p-4 sm:p-5">
        <div className="skeleton h-5 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const { report, profile } = data;
  if (report.completedQuests === 0) return null;

  const pct = report.completionRate !== null ? Math.round(report.completionRate * 100) : null;
  const postponePct =
    report.postponementRate !== null ? Math.round(report.postponementRate * 100) : null;

  const bucketLabel = (b: string | null) =>
    b === "tiny" ? "Tiny (5–15m)"
    : b === "small" ? "Small (15–30m)"
    : b === "medium" ? "Medium (30–60m)"
    : b === "large" ? "Large (60–120m)"
    : b === "epic" ? "Epic (120m+)"
    : null;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="insights-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">InnerLoop</p>
          <h2 id="insights-title" className="font-display text-lg font-bold">
            {windowDays === 7 ? "Weekly execution report" : "How you actually work"}
          </h2>
          <p className="text-xs text-muted">
            Observed patterns from the last {report.windowDays} days — no guesses, only your ledger.
          </p>
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Report window">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              className={`chip cursor-pointer ${windowDays === d ? "border-gold text-gold-2" : "hover:border-line-strong"}`}
              aria-pressed={windowDays === d}
              onClick={() => setWindowDays(d as 7 | 30)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Quests sealed" value={String(report.completedQuests)} />
        <Stat label="XP earned" value={`+${report.xpEarned}`} />
        <Stat
          label="Completion rate"
          value={pct === null ? "—" : `${pct}%`}
          sub={pct === null ? "needs a few more days" : undefined}
        />
        <Stat label="Avg quest size" value={report.avgMinutes ? `${report.avgMinutes}m` : "—"} />
        <Stat label="Most productive" value={report.bestPeriod ?? "—"} />
        <Stat label="Reliable size" value={bucketLabel(report.bestBucket) ?? "—"} />
        <Stat label="Postponed" value={postponePct === null ? "—" : `${postponePct}%`} />
        <Stat label="Missed (scheduled)" value={String(report.missedScheduled)} />
      </dl>

      {report.summary && (
        <div className="mt-3 rounded-xl border border-line-strong bg-panel-2 p-3 text-sm">
          <p className="mb-1 text-[11px] font-bold text-gold-2">🔮 The Oracle reads the ledger</p>
          <p className="whitespace-pre-line leading-relaxed text-muted">{report.summary}</p>
        </div>
      )}

      {profile.dailyCapacity !== null && (
        <p className="mt-3 text-sm text-muted">
          On a typical active day you seal about{" "}
          <strong className="text-ink">{profile.dailyCapacity}</strong> quests
          {profile.sweetSpotMinutes != null && (
            <>
              {" "}— your sweet spot is ~<strong className="text-ink">{profile.sweetSpotMinutes} minutes</strong> per quest
            </>
          )}
          .
        </p>
      )}

      {report.insights.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Behavioural insights">
          {report.insights.map((ins, i) => (
            <li key={i} className="rounded-xl border border-line bg-panel-2 px-3 py-2.5">
              <p className="text-sm">
                <span aria-hidden="true" className="mr-1.5">
                  {ins.icon}
                </span>
                {ins.text}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">{ins.evidence}</p>
            </li>
          ))}
        </ul>
      )}

      {report.attributeSplit.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold">Where your deeds land</p>
          <div className="flex flex-wrap gap-1.5">
            {report.attributeSplit.map((row) => (
              <span key={row.attribute} className="chip" style={{ color: `var(--attr-${row.attribute})` }}>
                <span aria-hidden="true">{ATTRIBUTE_META[row.attribute].icon}</span>
                {ATTRIBUTE_META[row.attribute].label} · {row.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {postponePct !== null && postponePct > 30 && (
        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm">
          <p className="font-bold text-gold-2">⚖ Planner hint</p>
          <p className="mt-0.5 text-muted">
            About {postponePct}% of scheduled quests were postponed. Next time you plan, say the day is{" "}
            <strong className="text-ink">20% shorter</strong> than you think — or split your Large quests up front.
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel-2 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">{value}</dd>
      {sub && <dd className="text-[10px] text-muted">{sub}</dd>}
    </div>
  );
}
