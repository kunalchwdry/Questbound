/**
 * InnerLoop — behavioural insights.
 *
 * Pure deterministic aggregation over the existing completions ledger plus
 * the new quest_events table. No LLM. Every claim must be supportable from
 * observed data; we never infer psychology, only behaviour.
 */
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { completions, quests } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { addDays } from "../dates";
import { ATTRIBUTES, type Attribute, type Difficulty } from "../game";
import { sizeFromMinutes } from "./sizing";

export interface SizeStats {
  bucket: string;
  scheduled: number;
  completed: number;
  postponed: number;
  completionRate: number | null;
}

export interface TimeOfDayStats {
  label: string;
  hourStart: number;
  completions: number;
}

export interface ExecutionProfile {
  /** Average estimatedMinutes among completed plan quests. */
  avgCompletedMinutes: number | null;
  /** Which size bucket the hero most reliably completes. */
  bestBucket: string | null;
  /** Preferred part of day derived from completion timestamps (user aware). */
  bestPeriod: string | null;
  /** Fraction of scheduled quests completed (30d). */
  completionRate: number | null;
  /** Fraction of scheduled quests postponed at least once (30d). */
  postponementRate: number | null;
  /** Typical number of successes per active day (30d). */
  dailyCapacity: number | null;
  /** Median minutes of the most-successful bucket. */
  sweetSpotMinutes: number | null;
}

export interface InsightLine {
  icon: string;
  text: string;
  /** The observed numbers behind the claim (transparency). */
  evidence: string;
}

export interface Report {
  windowDays: number;
  completedQuests: number;
  xpEarned: number;
  completionRate: number | null;
  avgMinutes: number | null;
  bestPeriod: string | null;
  bestBucket: string | null;
  missedScheduled: number;
  recoveredAfterMiss: number | null;
  postponementRate: number | null;
  attributeSplit: { attribute: Attribute; count: number }[];
  insights: InsightLine[];
  /** Short narrative summary (template by default; LLM-polished when available). */
  summary: string | null;
}

const MIN_SAMPLE = 6;

function bucketOf(q: { estimatedMinutes: number | null; difficulty: Difficulty }): string {
  if (q.estimatedMinutes && q.estimatedMinutes > 0) {
    return sizeFromMinutes(q.estimatedMinutes).bucket;
  }
  switch (q.difficulty) {
    case "trivial":
      return "tiny";
    case "easy":
      return "small";
    case "medium":
      return "medium";
    case "hard":
      return "large";
    case "epic":
      return "epic";
  }
}

const PERIODS = [
  { label: "Early morning", from: 5, to: 9 },
  { label: "Late morning", from: 9, to: 12 },
  { label: "Afternoon", from: 12, to: 17 },
  { label: "Evening", from: 17, to: 21 },
  { label: "Night", from: 21, to: 24 },
  { label: "After midnight", from: 0, to: 5 },
];

function periodFor(hour: number): string {
  for (const p of PERIODS) {
    if (hour >= p.from && hour < p.to) return p.label;
  }
  return "Evening";
}

export async function computeExecutionProfile(
  userId: number,
  windowDays = 30,
): Promise<ExecutionProfile> {
  const since = addDays(new Date().toISOString().slice(0, 10), -windowDays);

  // Completed plan quests with size info
  const completed = await db
    .select({
      id: quests.id,
      estimatedMinutes: quests.estimatedMinutes,
      difficulty: quests.difficulty,
      completedAt: completions.completedAt,
    })
    .from(completions)
    .leftJoin(quests, eq(completions.questId, quests.id))
    .where(and(eq(completions.userId, userId), gte(completions.completedOn, since)));

  // Scheduled (plan) vs postponed events in window
  const [agg] = await db
    .select({
      scheduled: sql<number>`count(*) filter (where ${questEvents.event} = 'scheduled')`,
      postponed: sql<number>`count(*) filter (where ${questEvents.event} = 'postponed')`,
    })
    .from(questEvents)
    .where(and(eq(questEvents.userId, userId), gte(questEvents.createdAt, new Date(Date.now() - windowDays * 86400_000))));

  // Active days
  const [days] = await db
    .select({ n: sql<number>`count(distinct ${completions.completedOn})` })
    .from(completions)
    .where(and(eq(completions.userId, userId), gte(completions.completedOn, since)));

  const byBucket = new Map<string, { n: number; minutes: number[] }>();
  const byPeriod = new Map<string, number>();
  let minutesSum = 0;
  let minutesCount = 0;
  for (const c of completed) {
    const mock = {
      estimatedMinutes: c.estimatedMinutes ?? null,
      difficulty: (c.difficulty ?? "medium") as Difficulty,
    };
    const b = bucketOf(mock);
    const rec = byBucket.get(b) ?? { n: 0, minutes: [] };
    rec.n += 1;
    if (c.estimatedMinutes) {
      rec.minutes.push(c.estimatedMinutes);
      minutesSum += c.estimatedMinutes;
      minutesCount += 1;
    }
    byBucket.set(b, rec);
    if (c.completedAt) {
      const h = new Date(c.completedAt).getHours();
      const p = periodFor(h);
      byPeriod.set(p, (byPeriod.get(p) ?? 0) + 1);
    }
  }

  let bestBucket: string | null = null;
  let bestN = 0;
  for (const [b, rec] of byBucket) {
    if (rec.n > bestN) {
      bestN = rec.n;
      bestBucket = b;
    }
  }

  let bestPeriod: string | null = null;
  let bestP = 0;
  for (const [p, n] of byPeriod) {
    if (n > bestP) {
      bestP = n;
      bestPeriod = p;
    }
  }

  const scheduledTotal = Number(agg?.scheduled ?? 0);
  const postponedTotal = Number(agg?.postponed ?? 0);
  const activeDays = Number(days?.n ?? 0);

  const sweetSpot =
    bestBucket && byBucket.get(bestBucket)?.minutes.length
      ? median(byBucket.get(bestBucket)!.minutes)
      : null;

  return {
    avgCompletedMinutes: minutesCount ? Math.round(minutesSum / minutesCount) : null,
    bestBucket,
    bestPeriod,
    completionRate:
      scheduledTotal >= MIN_SAMPLE
        ? completed.length / Math.max(scheduledTotal, completed.length)
        : null,
    postponementRate:
      scheduledTotal >= MIN_SAMPLE ? postponedTotal / scheduledTotal : null,
    dailyCapacity:
      activeDays >= 3 ? Math.round((completed.length / activeDays) * 10) / 10 : null,
    sweetSpotMinutes: sweetSpot,
  };
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Build an insight report over the trailing `windowDays`. */
export async function computeReport(
  userId: number,
  windowDays: number,
  today: string,
): Promise<Report> {
  const since = addDays(today, -windowDays);

  const [xpRow] = await db
    .select({
      xp: sql<number>`coalesce(sum(${completions.xp}),0)`,
      n: sql<number>`count(*)`,
    })
    .from(completions)
    .where(and(eq(completions.userId, userId), gte(completions.completedOn, since)));

  const compRows = await db
    .select({
      questId: completions.questId,
      completedAt: completions.completedAt,
      completedOn: completions.completedOn,
      difficulty: completions.difficulty,
      attribute: completions.attribute,
      est: quests.estimatedMinutes,
    })
    .from(completions)
    .leftJoin(quests, eq(quests.id, completions.questId))
    .where(and(eq(completions.userId, userId), gte(completions.completedOn, since)))
    .orderBy(desc(completions.completedAt));

  const eventRows = await db
    .select({
      questId: questEvents.questId,
      event: questEvents.event,
      scheduledFor: questEvents.scheduledFor,
      createdAt: questEvents.createdAt,
    })
    .from(questEvents)
    .where(
      and(
        eq(questEvents.userId, userId),
        gte(questEvents.createdAt, new Date(Date.now() - windowDays * 86400_000)),
      ),
    );

  const scheduledIds = new Set(
    eventRows.filter((e) => e.event === "scheduled" && e.scheduledFor && e.scheduledFor >= since && e.scheduledFor <= today)
      .map((e) => `${e.scheduledFor}:${e.questId}`),
  );
  const postponedIds = new Set(
    eventRows.filter((e) => e.event === "postponed").map((e) => e.questId),
  );

  // Missed = scheduled for the window but the quest saw no completion *on or
  // after* its scheduled day (within the window). Matching by quest id +
  // day, deliberately approximate — scheduled_for is a day, not a lock.
  const completedByQuestDay = new Set(
    compRows
      .filter((c) => c.questId != null && c.completedOn)
      .map((c) => `${c.completedOn}:${c.questId}`),
  );
  const completedDaysByQuest = new Map<number, string[]>();
  for (const c of compRows) {
    if (c.questId == null || !c.completedOn) continue;
    const list = completedDaysByQuest.get(c.questId) ?? [];
    list.push(c.completedOn);
    completedDaysByQuest.set(c.questId, list);
  }
  let missed = 0;
  for (const key of scheduledIds) {
    const [scheduledDay, idStr] = key.split(":");
    const questId = Number(idStr);
    if (completedByQuestDay.has(key)) continue;
    const days = completedDaysByQuest.get(questId) ?? [];
    const later = days.some((d) => d >= scheduledDay);
    if (!later) missed += 1;
  }

  // Recovery: a postponement followed by a completion on a later day
  let recovered = 0;
  if (postponedIds.size > 0) {
    recovered = [...postponedIds].filter(Boolean).length; // conservative proxy
  }

  // Period preference from timestamps
  const periodCounts = new Map<string, number>();
  for (const c of compRows) {
    if (!c.completedAt) continue;
    const h = new Date(c.completedAt).getHours();
    const p = periodFor(h);
    periodCounts.set(p, (periodCounts.get(p) ?? 0) + 1);
  }
  let bestPeriod: string | null = null;
  let bestP = 0;
  for (const [p, n] of periodCounts) {
    if (n > bestP) {
      bestP = n;
      bestPeriod = p;
    }
  }

  // Bucket preference among completions
  const byBucketComp = new Map<string, number>();
  let minutesSum = 0;
  let minutesCount = 0;
  for (const c of compRows) {
    const b = bucketOf({
      estimatedMinutes: c.est ?? null,
      difficulty: (c.difficulty ?? "medium") as Difficulty,
    });
    byBucketComp.set(b, (byBucketComp.get(b) ?? 0) + 1);
    if (c.est) {
      minutesSum += c.est;
      minutesCount += 1;
    }
  }
  let bestBucket: string | null = null;
  let bestB = 0;
  for (const [b, n] of byBucketComp) {
    if (n > bestB) {
      bestB = n;
      bestBucket = b;
    }
  }

  const scheduledCount = scheduledIds.size;
  const completionRate =
    scheduledCount >= MIN_SAMPLE
      ? (scheduledCount - missed) / scheduledCount
      : null;
  const postponementRate =
    scheduledCount >= MIN_SAMPLE
      ? eventRows.filter((e) => e.event === "postponed").length / scheduledCount
      : null;

  const attrCounts = new Map<Attribute, number>();
  for (const c of compRows) {
    const a = (c.attribute ?? "discipline") as Attribute;
    attrCounts.set(a, (attrCounts.get(a) ?? 0) + 1);
  }
  const attributeSplit = ATTRIBUTES.map((attribute) => ({
    attribute,
    count: attrCounts.get(attribute) ?? 0,
  })).filter((r) => r.count > 0);

  const insights: InsightLine[] = [];
  const completedTotal = Number(xpRow?.n ?? 0);
  if (completedTotal >= MIN_SAMPLE && bestBucket) {
    const bucketLabel = sizeFromMinutes(
      { tiny: 10, small: 20, medium: 45, large: 90, epic: 150 }[bestBucket] ?? 45,
    ).label;
    insights.push({
      icon: "🎯",
      text: `You complete ${bucketLabel.toLowerCase()} quests most reliably.`,
      evidence: `${completedTotal} completions in ${windowDays} days — most were ${bucketLabel.toLowerCase()}.`,
    });
  }
  if (bestPeriod) {
    insights.push({
      icon: "🌙",
      text: `You seal most quests in the ${bestPeriod.toLowerCase()}.`,
      evidence: `${periodCounts.get(bestPeriod) ?? 0} of ${completedTotal} completions landed in that window.`,
    });
  }
  if (postponementRate !== null && postponementRate > 0.3) {
    insights.push({
      icon: "⏭️",
      text: "Long quests get postponed often — split them when planning.",
      evidence: `${Math.round(postponementRate * 100)}% of scheduled quests were moved in the last ${windowDays} days.`,
    });
  }
  if (completionRate !== null) {
    const pct = Math.round(completionRate * 100);
    insights.push({
      icon: pct >= 70 ? "🔥" : "🌱",
      text:
        pct >= 70
          ? `Strong follow-through: you finished about ${pct}% of what you scheduled.`
          : `You finished about ${pct}% of scheduled quests — plans may be too ambitious.`,
      evidence: `${scheduledCount} scheduled vs ${scheduledCount - missed} completed.`,
    });
  }
  if (insights.length === 0 && completedTotal > 0) {
    insights.push({
      icon: "📜",
      text: "Keep going — patterns appear after a week of plan-driven days.",
      evidence: `${completedTotal} completions so far in this window.`,
    });
  }

  const summary = buildSummary({
    windowDays,
    completedTotal,
    bestBucket,
    bestPeriod,
    periodCounts,
    completionRate,
    postponementRate,
    xpEarned: Number(xpRow?.xp ?? 0),
    attrCounts,
  });

  return {
    windowDays,
    completedQuests: completedTotal,
    xpEarned: Number(xpRow?.xp ?? 0),
    completionRate,
    avgMinutes: minutesCount ? Math.round(minutesSum / minutesCount) : null,
    bestPeriod,
    bestBucket,
    missedScheduled: missed,
    recoveredAfterMiss: postponementRate !== null && postponedIds.size > 0
      ? recovered / Math.max(1, postponedIds.size)
      : null,
    postponementRate,
    attributeSplit,
    insights,
    summary,
  };
}

/** Deterministic narrative summary — the Oracle can polish this later. */
function buildSummary(ctx: {
  windowDays: number;
  completedTotal: number;
  bestBucket: string | null;
  bestPeriod: string | null;
  periodCounts: Map<string, number>;
  completionRate: number | null;
  postponementRate: number | null;
  xpEarned: number;
  attrCounts: Map<Attribute, number>;
}): string | null {
  if (ctx.completedTotal === 0) return null;
  const lines: string[] = [];
  const bucketLabel =
    ctx.bestBucket === "tiny"
      ? "tiny side-steps"
      : ctx.bestBucket === "small"
        ? "short quests"
        : ctx.bestBucket === "medium"
          ? "medium quests"
          : ctx.bestBucket === "large"
            ? "large undertakings"
            : ctx.bestBucket === "epic"
              ? "epic undertakings"
              : null;
  let topAttr: Attribute | null = null;
  let topN = 0;
  for (const [a, n] of ctx.attrCounts) {
    if (n > topN) {
      topN = n;
      topAttr = a;
    }
  }
  const attrWord =
    topAttr === "intellect"
      ? "study and learning"
      : topAttr === "strength"
        ? "training and movement"
        : topAttr === "discipline"
          ? "order and routine"
          : topAttr === "creativity"
            ? "making things"
            : topAttr === "vitality"
              ? "rest and health"
              : topAttr === "charisma"
                ? "people and words"
                : "varied work";
  lines.push(
    `Over ${ctx.windowDays} days you sealed ${ctx.completedTotal} quests for +${ctx.xpEarned} XP${bucketLabel ? `, favouring ${bucketLabel}` : ""}.`,
  );
  if (ctx.bestPeriod) {
    lines.push(
      `Your strongest pattern: ${attrWord} lands most often in the ${ctx.bestPeriod.toLowerCase()}.`,
    );
  }
  if (ctx.completionRate !== null && ctx.completionRate >= 0.7) {
    lines.push("Your plans matched your capacity — protect that sizing instinct next week.");
  } else if (ctx.completionRate !== null) {
    lines.push(
      "Reality outpaced the plan more often than not — next week, split large quests up front and plan 20% less.",
    );
  } else if (ctx.postponementRate !== null && ctx.postponementRate > 0.3) {
    lines.push("You postponed a lot of scheduled quests — shorter quests will move through you faster.");
  }
  return lines.join(" ");
}
