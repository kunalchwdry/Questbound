/**
 * InnerLoop — adaptive daily planning.
 *
 * Deterministic time budgeting + Oracle naming.
 *  1. packBudget() picks sizes from energy/mood + available minutes.
 *  2. We build a structured "plan skeleton" with attribute + difficulty + size.
 *  3. The Oracle fills in titles (+ optional why) for each step.
 *  4. Server writes quests + a plan_session row.
 *
 * Planning never fails hard: if every LLM target is unavailable or returns
 * invalid JSON, we fall back to deterministic titles so the hero always gets
 * a plan.
 */
import { db } from "@/db";
import { goals, planSessions, questEvents } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { serializeQuest } from "../dashboard";
import { type Attribute, ATTRIBUTES, DIFFICULTIES, QUEST_TYPES } from "../game";
import { gatherInsights, getOracleTargets, sanitizeProviderError, type OracleConfig } from "../oracle";
import type { Dashboard, Quest } from "../types";
import {
  SIZE_BUCKETS,
  defaultAttributeForGoal,
  packBudget,
  sizeFromMinutes,
  type Energy,
  type MoodTag,
  type SizeBucket,
} from "./sizing";

export interface PlanInput {
  userId: number;
  goal: string;
  availableMinutes: number;
  energy: Energy;
  mood?: MoodTag | null;
  deadlines?: string | null;
  note?: string | null;
  goalId?: number | null;
  /** Oracle targets override (uses existing env chain when omitted). */
  targets?: OracleConfig[] | null;
}

export interface PlannedQuest {
  title: string;
  attribute: Attribute;
  difficulty: (typeof DIFFICULTIES)[number];
  estimatedMinutes: number;
  size: SizeBucket;
  why?: string;
}

export interface PlanResult {
  sessionId: number;
  quests: Quest[];
  explanation: string;
  pack: SizeBucket[];
  budgetMinutes: number;
  scheduledMinutes: number;
  /** true when the LLM named the quests; false when the fallback did. */
  oracleNamed: boolean;
}

const plannedQuestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  attribute: z.enum(ATTRIBUTES),
  difficulty: z.enum(DIFFICULTIES),
  estimatedMinutes: z.number().int().min(5).max(240),
  why: z.string().trim().max(160).optional(),
});

const planOutputSchema = z.object({
  reply: z.string().trim().min(1).max(600),
  quests: z.array(plannedQuestSchema).min(1).max(6),
});

/**
 * Build a plan skeleton deterministically, then ask the Oracle to name it.
 */
export async function generatePlan(
  dashboard: Dashboard,
  input: PlanInput,
): Promise<PlanResult> {
  const today = dashboard.profile.today;
  const goalAttr = input.goalId
    ? await loadGoalAttribute(input.userId, input.goalId)
    : null;
  const baseAttribute =
    goalAttr ?? defaultAttributeForGoal(input.goal || "plan my day");

  const pack = packBudget({
    availableMinutes: input.availableMinutes,
    energy: input.energy,
    mood: input.mood ?? null,
  });
  if (pack.length === 0) {
    // Degenerate case: < ~11 minutes available — still offer one tiny quest.
    pack.push("tiny");
  }

  // Attribute mix: warm-up on vitality when tired/anxious; the rest on the
  // goal's attribute so the plan feels cohesive.
  const skeleton: { attribute: Attribute; size: SizeBucket }[] = pack.map(
    (bucket, i) => {
      if (i === 0 && (input.energy === "low" || input.mood === "anxious")) {
        return { attribute: "vitality" as Attribute, size: bucket };
      }
      return { attribute: baseAttribute, size: bucket };
    },
  );

  let planned: PlannedQuest[] = [];
  let oracleNamed = false;
  let explanation = `A ${input.energy}-energy plan sized to ~${input.availableMinutes} minutes, with slack left for the unexpected.`;

  try {
    const ai = await askOracleForPlan(dashboard, input, skeleton);
    planned = ai.quests.map((q) => ({
      ...q,
      size: sizeFromMinutes(q.estimatedMinutes).bucket,
    }));
    explanation = ai.reply;
    oracleNamed = true;
  } catch (err) {
    console.warn(
      "[innerloop] Oracle plan naming failed, using deterministic titles:",
      err instanceof Error ? err.message : err,
    );
    planned = deterministicPlanTitles(input.goal, skeleton);
  }

  // Safety net: if the Oracle returned the wrong count, trim/pad.
  if (planned.length < skeleton.length) {
    const fillers = deterministicPlanTitles(input.goal, skeleton.slice(planned.length));
    planned = [...planned, ...fillers];
  }
  planned = planned.slice(0, skeleton.length);

  // Server-side enforcement: size/difficulty/minutes come from OUR skeleton,
  // never from the model. The model only named things.
  planned = planned.map((p, i) => {
    const meta = SIZE_BUCKETS[skeleton[i].size];
    return {
      ...p,
      difficulty: meta.difficulty,
      estimatedMinutes: Math.min(
        meta.maxMinutes,
        Math.max(meta.minMinutes, p.estimatedMinutes ?? meta.minutes),
      ),
      size: skeleton[i].size,
    };
  });

  // Insert quests + plan session in one transaction.
  const { sessionId, created } = await db.transaction(async (tx) => {
    const createdQuests: Quest[] = [];
    const insertedIds: number[] = [];
    for (let i = 0; i < planned.length; i++) {
      const p = planned[i];
      const [row] = await tx
        .insert(quests)
        .values({
          userId: input.userId,
          title: p.title,
          notes: p.why ?? null,
          attribute: p.attribute,
          difficulty: p.difficulty,
          type: "once",
          dueDate: null,
          scheduledFor: today,
          scheduledOrder: i,
          estimatedMinutes: p.estimatedMinutes,
          goalId: input.goalId ?? null,
          planContext: {
            source: "plan",
            energy: input.energy,
            mood: input.mood ?? null,
            size: p.size,
          },
        })
        .returning();
      insertedIds.push(row.id);
      createdQuests.push(serializeQuest(row, 0));
      await tx.insert(questEvents).values({
        userId: input.userId,
        questId: row.id,
        event: "scheduled",
        scheduledFor: today,
        energyLevel: input.energy,
        moodTag: input.mood ?? null,
        meta: { size: p.size, order: i },
      });
    }
    const [session] = await tx
      .insert(planSessions)
      .values({
        userId: input.userId,
        day: today,
        goalText: input.goal || null,
        energyLevel: input.energy,
        moodTag: input.mood ?? null,
        availableMinutes: input.availableMinutes,
        deadlines: input.deadlines ?? null,
        note: input.note ?? null,
        questIds: insertedIds,
        explanation,
      })
      .returning();
    return { sessionId: session.id, created: createdQuests };
  });

  return {
    sessionId,
    quests: created,
    explanation,
    pack: skeleton.map((s) => s.size),
    budgetMinutes: input.availableMinutes,
    scheduledMinutes: planned.reduce((s, p) => s + p.estimatedMinutes, 0),
    oracleNamed,
  };
}

async function askOracleForPlan(
  dashboard: Dashboard,
  input: PlanInput,
  skeleton: { attribute: Attribute; size: SizeBucket }[],
): Promise<z.infer<typeof planOutputSchema>> {
  const insights = gatherInsights(dashboard);
  const skeletonText = skeleton
    .map(
      (s, i) =>
        `  ${i + 1}. attribute=${s.attribute}, size=${s.size}, ~${SIZE_BUCKETS[s.size].minutes} min (difficulty MUST be ${SIZE_BUCKETS[s.size].difficulty})`,
    )
    .join("\n");

  const systemPrompt = `You are the Oracle inside Questbound, a Life RPG. You are generating a realistic daily quest plan from the hero's goal, available time, energy and mood.

Rules:
- Be realistic, not optimistic. Leave slack.
- estimatedMinutes must match difficulty: trivial<=15, easy<=30, medium<=60, hard<=120, epic>120.
- Sizes available: tiny (5-15m), small (15-30m), medium (30-60m), large (60-120m), epic (120m+).
- Attributes must be one of: ${ATTRIBUTES.join(", ")}.
- Difficulties must be one of: ${DIFFICULTIES.join(", ")}.
- Keep each quest title specific and actionable ("Review logistic regression notes", not "Study").
- Respond ONLY with a single minified JSON object, no markdown, no prose:
  {"reply": string, "quests": [{"title","attribute","difficulty","estimatedMinutes","why"}]}
- "reply" is a warm 1-3 sentence explanation of how you sized the plan (max 300 chars).

HERO CONTEXT
- Name: ${dashboard.profile.displayName}, class ${dashboard.profile.classKey}, level ${dashboard.profile.level}
- Streak: ${insights.streak} days, ${insights.openQuests} open quests
- Strongest attribute: ${insights.strongestAttribute}, weakest: ${insights.weakestAttribute}
- Energy: ${input.energy} · Mood: ${input.mood ?? "unspecified"}
- Available time: ${input.availableMinutes} minutes
- Goal: ${input.goal || "(unspecified — build a balanced day)"}
- Deadlines: ${input.deadlines || "none stated"}

Return exactly ${skeleton.length} quests matching this skeleton, in order:
${skeletonText}`;

  const targets = input.targets ?? getOracleTargets();
  if (targets.length === 0) throw new Error("no oracle targets configured");
  const raw = await fetchPlanJson(targets, systemPrompt);
  return planOutputSchema.parse(raw);
}

async function fetchPlanJson(
  targets: OracleConfig[],
  systemPrompt: string,
): Promise<unknown> {
  let lastErr: unknown = null;
  // Primary + one fallback target keeps plan latency bounded.
  for (const cfg of targets.slice(0, 2)) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      cfg.keyless ? 20_000 : 25_000,
    );
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Generate my daily plan now. Return ONLY the JSON object.",
          },
        ],
        temperature: cfg.temperature ?? 0.6,
        max_tokens: cfg.maxTokens ?? 900,
      };
      if (cfg.json === "response_format") {
        body.response_format = { type: "json_object" };
      }
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `${cfg.label} responded ${res.status}: ${sanitizeProviderError(text)}`,
        );
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty completion");
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("no JSON in completion");
      return JSON.parse(content.slice(start, end + 1));
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("no oracle target answered");
}

/** Deterministic titles used when no LLM is reachable. */
function deterministicPlanTitles(
  goal: string,
  skeleton: { attribute: Attribute; size: SizeBucket }[],
): PlannedQuest[] {
  const words = (goal || "today's focus").trim().split(/\s+/).slice(0, 6).join(" ");
  const sequence = ["Warm up", "Dive in", "Focus block", "Push forward", "Wrap & review"];
  return skeleton.map((s, i) => {
    const meta = SIZE_BUCKETS[s.size];
    return {
      title: `${sequence[Math.min(i, sequence.length - 1)]}: ${words}`,
      attribute: s.attribute,
      difficulty: meta.difficulty,
      estimatedMinutes: meta.minutes,
      size: s.size,
      why: "Sized to fit your energy and time.",
    };
  });
}

async function loadGoalAttribute(
  userId: number,
  goalId: number,
): Promise<Attribute | null> {
  const [row] = await db
    .select({ attribute: goals.attribute })
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));
  return (row?.attribute as Attribute | null) ?? null;
}
