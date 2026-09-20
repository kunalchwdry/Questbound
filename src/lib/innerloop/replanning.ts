/**
 * InnerLoop — adaptive replanning.
 *
 * When reality changes (missed quests, less time than planned, a new energy
 * check-in), this module computes a deterministic rebalance patch:
 *   - low-priority unfinished quests move to tomorrow ("postponed")
 *   - oversized quests are split into children sized to the remaining budget
 *   - deadline-critical quests are preserved
 *   - everything left is re-ordered
 *
 * The Oracle later explains the patch in natural language; the math here is
 * pure TypeScript with zero LLM involvement.
 */
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { quests, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { todayInTimeZone, addDays } from "../dates";
import { getOracleTargets, sanitizeProviderError, type OracleConfig, type OracleTraceStep } from "../oracle";
import { ATTRIBUTES, DIFFICULTIES, type Attribute, type Difficulty } from "../game";
import { sizeFromMinutes } from "./sizing";

export type ReplanReason =
  | "missed-quest"
  | "less-time"
  | "more-time"
  | "energy-change"
  | "manual";

export interface ReplanInput {
  userId: number;
  reason: ReplanReason;
  /** Remaining usable minutes today (if the caller knows). */
  remainingMinutes?: number;
  /** Optional single quest that was missed (manual trigger from a quest). */
  missedQuestId?: number;
  energy?: "high" | "medium" | "low";
  mood?: string | null;
  targets?: OracleConfig[] | null;
}

export interface ReplanChange {
  questId: number;
  title: string;
  action: "postponed" | "split" | "resized" | "kept" | "reordered";
  detail: string;
  /** For splits — the child titles created. */
  children?: string[];
}

export interface ReplanResult {
  changes: ReplanChange[];
  explanation: string;
  /** What the next best quest to start is, per the deterministic scorer. */
  nextQuestId: number | null;
  nextQuestTitle: string | null;
}

export interface PlanQuest {
  id: number;
  title: string;
  notes: string | null;
  attribute: Attribute;
  difficulty: Difficulty;
  scheduledFor: string | null;
  scheduledOrder: number | null;
  estimatedMinutes: number | null;
  planContext: unknown;
  completedAt: Date | null;
  dueDate: string | null;
  questStatus: string;
}

const splitNamesSchema = z.object({
  reply: z.string().trim().max(400),
  children: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(120),
        minutes: z.number().int().min(5).max(240),
      }),
    )
    .min(2)
    .max(6),
});

/** Load today's still-open, plan-scheduled quests for the user. */
export async function loadTodaysPlan(userId: number, today: string): Promise<PlanQuest[]> {
  const rows = await db
    .select()
    .from(quests)
    .where(
      and(
        eq(quests.userId, userId),
        eq(quests.scheduledFor, today),
        eq(quests.questStatus, "active"),
        isNull(quests.completedAt),
      ),
    );
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      notes: r.notes,
      attribute: r.attribute,
      difficulty: r.difficulty,
      scheduledFor: r.scheduledFor,
      scheduledOrder: r.scheduledOrder,
      estimatedMinutes: r.estimatedMinutes,
      planContext: r.planContext,
      completedAt: r.completedAt,
      dueDate: r.dueDate,
      questStatus: r.questStatus,
    }))
    .sort((a, b) => (a.scheduledOrder ?? 99) - (b.scheduledOrder ?? 99));
}

function estMinutes(q: PlanQuest): number {
  if (q.estimatedMinutes && q.estimatedMinutes > 0) return q.estimatedMinutes;
  switch (q.difficulty) {
    case "trivial":
      return 10;
    case "easy":
      return 20;
    case "medium":
      return 45;
    case "hard":
      return 90;
    case "epic":
      return 150;
  }
}

/**
 * Deterministic schedule priority: deadline-critical quests first, then the
 * plan's original order dominates (order×100), with a small preference for
 * shorter quests inside the same slot. Used when deciding whose budget gets
 * consumed first in a rebalance — NOT for "what to do next".
 */
function priority(q: PlanQuest, today: string): number {
  let score = 0;
  if (q.dueDate && q.dueDate <= today) score -= 1_000_000; // deadlines always first
  score += (q.scheduledOrder ?? 50) * 100;
  score += estMinutes(q) / 10;
  return score;
}

/**
 * Suggest the next-best quest after a rebalance. Momentum matters more than
 * plan order here: deadline-critical first, then the smallest remaining
 * quest — the point is to get a quick seal under the hero's belt.
 */
export function nextBestQuest(open: PlanQuest[], today: string): PlanQuest | null {
  if (open.length === 0) return null;
  const scored = (q: PlanQuest) =>
    (q.dueDate && q.dueDate <= today ? -1_000_000 : 0) + estMinutes(q);
  return [...open].sort((a, b) => scored(a) - scored(b))[0];
}

export async function computeReplan(input: ReplanInput): Promise<{
  changes: ReplanChange[];
  openAfter: PlanQuest[];
  today: string;
  remaining: number;
}> {
  const [hero] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!hero) throw new Error("Hero not found");
  const today = todayInTimeZone(hero.timezone);
  const tomorrow = addDays(today, 1);

  const openNow = await loadTodaysPlan(input.userId, today);
  if (openNow.length === 0) {
    return { changes: [], openAfter: [], today, remaining: 0 };
  }

  // How much time is left? If caller didn't say, assume the plan still fits
  // unless the reason explicitly says otherwise (missed-quest shrinks by the
  // missed quest's estimate).
  const plannedTotal = openNow.reduce((s, q) => s + estMinutes(q), 0);
  let remaining =
    input.remainingMinutes != null
      ? Math.max(10, Math.round(input.remainingMinutes))
      : plannedTotal;
  if (input.reason === "missed-quest" && input.missedQuestId) {
    const missed = openNow.find((q) => q.id === input.missedQuestId);
    remaining = Math.max(10, plannedTotal - (missed ? estMinutes(missed) : 45));
  }

  const changes: ReplanChange[] = [];
  let kept: PlanQuest[] = [];

  // 1. Deadline-critical quests are always kept.
  const critical = openNow.filter((q) => q.dueDate && q.dueDate <= today);
  const flexible = openNow.filter((q) => !(q.dueDate && q.dueDate <= today));

  const remainingAfterCritical =
    remaining - critical.reduce((s, q) => s + estMinutes(q), 0);

  // 2. Global fit check: if the open plan still fits with a little tolerance,
  //    leave it alone (re-order only). Otherwise greedy-fit without slack.
  const flexibleTotal = flexible.reduce((s, q) => s + estMinutes(q), 0);
  const fits = flexibleTotal <= Math.max(0, remainingAfterCritical) + 5;

  let budget = remainingAfterCritical;
  const toSplit: PlanQuest[] = [];
  const toPostpone: PlanQuest[] = [];
  if (fits) {
    kept = [...flexible];
  } else {
    for (const q of [...flexible].sort((a, b) => priority(a, today) - priority(b, today))) {
      const est = estMinutes(q);
      if (est <= Math.max(0, budget)) {
        kept.push(q);
        budget -= est;
      } else if (est >= 60 && budget >= 20) {
        // Large quest and there's still meaningful time — split it.
        toSplit.push(q);
        budget = 0; // a split consumes the remainder
      } else {
        toPostpone.push(q);
      }
    }
  }

  // 3. Apply splits: create child quests totaling the parent's estimate,
  //    sized to today's remaining budget. Parent becomes questStatus='split'.
  for (const q of toSplit) {
    const childNames = await nameSplitChildren(q, 2, input.targets);
    const parentEst = estMinutes(q);
    const per = Math.max(15, Math.round(parentEst / childNames.length));
    const firstFitsToday = Math.min(per, Math.max(15, remainingAfterCritical));
    const childRows: string[] = [];
    await db.transaction(async (tx) => {
      for (let i = 0; i < childNames.length; i++) {
        const child = childNames[i];
        const childMinutes = i === 0 ? firstFitsToday : per;
        const size = sizeFromMinutes(childMinutes);
        const [row] = await tx
          .insert(quests)
          .values({
            userId: input.userId,
            title: child.title,
            notes: q.notes,
            attribute: q.attribute,
            difficulty: size.difficulty,
            type: "once",
            dueDate: q.dueDate,
            scheduledFor: i === 0 ? today : tomorrow,
            scheduledOrder: i === 0 ? 0 : i,
            estimatedMinutes: childMinutes,
            parentQuestId: q.id,
            planContext: { source: "split", splitFrom: q.title, size: size.difficulty },
          })
          .returning({ id: quests.id, title: quests.title });
        childRows.push(row.title);
        await tx.insert(questEvents).values({
          userId: input.userId,
          questId: row.id,
          event: "scheduled",
          scheduledFor: i === 0 ? today : tomorrow,
          meta: { size: size.bucket, fromSplit: q.id },
        });
      }
      await tx
        .update(quests)
        .set({ questStatus: "split", updatedAt: new Date() })
        .where(eq(quests.id, q.id));
      await tx.insert(questEvents).values({
        userId: input.userId,
        questId: q.id,
        event: "split",
        meta: { children: childNames.length },
      });
    });
    changes.push({
      questId: q.id,
      title: q.title,
      action: "split",
      detail: `Too large for the remaining time — broken into ${childNames.length} smaller quests.`,
      children: childRows,
    });
  }

  // 4. Postpone what doesn't fit. Move to tomorrow.
  for (const q of toPostpone) {
    await db
      .update(quests)
      .set({ scheduledFor: tomorrow, scheduledOrder: null, updatedAt: new Date() })
      .where(eq(quests.id, q.id));
    await db.insert(questEvents).values({
      userId: input.userId,
      questId: q.id,
      event: "postponed",
      fromDay: today,
      toDay: tomorrow,
      meta: { reason: input.reason },
    });
    changes.push({
      questId: q.id,
      title: q.title,
      action: "postponed",
      detail: "Moved to tomorrow to keep today's chapter winnable.",
    });
  }

  // 5. Re-order the kept quests deterministically (smallest first after
  //    deadline-critical), and persist the new order.
  kept = [...critical, ...kept].sort((a, b) => priority(a, today) - priority(b, today));
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].scheduledOrder !== i) {
      await db
        .update(quests)
        .set({ scheduledOrder: i, updatedAt: new Date() })
        .where(eq(quests.id, kept[i].id));
      await db.insert(questEvents).values({
        userId: input.userId,
        questId: kept[i].id,
        event: "rescheduled",
        scheduledFor: today,
        meta: { order: i, reason: input.reason },
      });
    }
  }

  const openAfter = await loadTodaysPlan(input.userId, today);
  return { changes, openAfter, today, remaining };
}

/** Ask the Oracle for split names; deterministic fallback on any failure. */
async function nameSplitChildren(
  q: PlanQuest,
  count: number,
  targets: OracleConfig[] | null | undefined,
): Promise<{ title: string; minutes: number }[]> {
  const fallback = [
    { title: `${q.title} — part 1`, minutes: 25 },
    { title: `${q.title} — part 2`, minutes: 25 },
  ].slice(0, count);
  const usable = targets ?? getOracleTargets();
  if (usable.length === 0) return fallback;
  const prompt = `You split an oversized quest inside Questbound, a Life RPG, into ${count} smaller concrete actions, ordered so the first can start immediately.
Quest: "${q.title}"
Notes: ${q.notes ?? "none"}

Rules:
- ${count} children max, each a single action.
- Either use "${q.title} — <specific step>" titles or naturally ordered steps.
- minutes per child between 10 and 60.
- reply = one sentence ("Splitting X keeps momentum: …" style, max 200 chars).
- Respond ONLY with minified JSON: {"reply": string, "children":[{"title","minutes"}]}`;

  const cfg = usable[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Split "${q.title}" into ${count} steps now.` },
      ],
      temperature: cfg.temperature ?? 0.5,
      max_tokens: cfg.maxTokens ?? 500,
    };
    if (cfg.json === "response_format") body.response_format = { type: "json_object" };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${cfg.label} ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    const parsed = splitNamesSchema.parse(JSON.parse(content.slice(start, end + 1)));
    return parsed.children;
  } catch (err) {
    console.warn(
      "[innerloop] split naming fell back:",
      err instanceof Error ? sanitizeProviderError(err.message) : err,
    );
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** Structured output helpers exposed for the Oracle "explain my replan" flow. */
export const replanExplainSchema = z.object({
  reply: z.string().trim().min(1).max(600),
});
export type { OracleTraceStep };
export { ATTRIBUTES, DIFFICULTIES };
