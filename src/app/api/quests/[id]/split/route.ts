import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { clientIp, handle, ok, parseBody, parseId, rateLimit, requireUser, ApiError } from "@/lib/api";
import { aiConfigTarget, getAiConfigRow } from "@/lib/ai-settings";
import { getDashboard, serializeQuest } from "@/lib/dashboard";
import { todayInTimeZone } from "@/lib/dates";
import { getOracleTargets, sanitizeProviderError, type OracleConfig } from "@/lib/oracle";
import { sizeFromMinutes } from "@/lib/innerloop/sizing";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  into: z.number().int().min(2).max(6).optional().default(3),
});

const childSchema = z.object({
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

async function nameChildren(
  title: string,
  notes: string | null,
  count: number,
  targets: OracleConfig[],
): Promise<{ title: string; minutes: number }[]> {
  // Deterministic fallback first
  const fallback = Array.from({ length: count }, (_, i) => ({
    title: `${title} — part ${i + 1}`,
    minutes: 25,
  }));
  if (targets.length === 0) return fallback;
  const cfg = targets[0];
  const prompt = `Split this Questbound quest into ${count} sequential, concrete sub-quests.
Quest: "${title}"
Notes: ${notes ?? "none"}

Rules:
- Order children so the first can start immediately.
- Each child title is specific (e.g. "Create database schema", not "Work on it").
- minutes per child between 10 and 60.
- Respond ONLY with minified JSON: {"children":[{"title","minutes"}]}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Split "${title}" now.` },
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
    const parsed = childSchema.parse(JSON.parse(content.slice(start, end + 1)));
    return parsed.children.map((c) => ({ title: c.title, minutes: c.minutes }));
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`split:${user.id}:${clientIp(req)}`, 20, 10 * 60_000);
    const { id } = await params;
    const questId = parseId(id);
    const body = await parseBody(req, bodySchema);
    const aiRow = await getAiConfigRow(user.id);

    const [quest] = await db
      .select()
      .from(quests)
      .where(and(eq(quests.id, questId), eq(quests.userId, user.id)));
    if (!quest) {
      throw new ApiError("Quest not found", 404);
    }
    if (quest.completedAt) {
      throw new ApiError("That quest is already complete.", 409);
    }
    if (quest.questStatus === "split") {
      throw new ApiError("That quest is already split.", 409);
    }

    const estMinutes =
      quest.estimatedMinutes ??
      (quest.difficulty === "trivial"
        ? 10
        : quest.difficulty === "easy"
          ? 20
          : quest.difficulty === "medium"
            ? 45
            : quest.difficulty === "hard"
              ? 90
              : 150);
    if (estMinutes < 30) {
      throw new ApiError("That quest is already small enough — no need to split.", 422);
    }

    const targets = aiConfigTarget(aiRow) ?? getOracleTargets();
    const children = await nameChildren(quest.title, quest.notes, body.into, targets);
    const today = todayInTimeZone(user.timezone);

    const created = await db.transaction(async (tx) => {
      const rows = [];
      let remaining = estMinutes;
      for (let i = 0; i < children.length; i++) {
        // Distribute the parent's estimate across children (weighting by AI-suggested minutes but bounded by the parent estimate)
        const share = Math.min(
          Math.max(10, Math.round(children[i].minutes)),
          Math.max(10, remaining - (children.length - i - 1) * 10),
        );
        remaining -= share;
        const size = sizeFromMinutes(share);
        const [row] = await tx
          .insert(quests)
          .values({
            userId: user.id,
            title: children[i].title,
            notes: quest.notes,
            attribute: quest.attribute,
            difficulty: size.difficulty,
            type: quest.type,
            dueDate: quest.dueDate,
            scheduledFor: quest.scheduledFor ?? today,
            scheduledOrder: quest.scheduledOrder,
            estimatedMinutes: share,
            parentQuestId: quest.id,
            goalId: quest.goalId,
            planContext: { source: "split", splitFrom: quest.title, size: size.bucket, index: i, of: children.length },
          })
          .returning();
        rows.push(row);
        await tx.insert(questEvents).values({
          userId: user.id,
          questId: row.id,
          event: "scheduled",
          scheduledFor: quest.scheduledFor ?? today,
          meta: { fromSplit: quest.id, size: size.bucket, index: i },
        });
      }
      await tx
        .update(quests)
        .set({ questStatus: "split", updatedAt: new Date() })
        .where(eq(quests.id, quest.id));
      await tx.insert(questEvents).values({
        userId: user.id,
        questId: quest.id,
        event: "split",
        meta: { children: children.length },
      });
      return rows;
    });

    const dashboard = await getDashboard(user.id);
    return ok(
      {
        parent: { id: quest.id, title: quest.title },
        children: created.map((c, i) => ({
          ...serializeQuest(c),
          splitIndex: i + 1,
          splitTotal: children.length,
        })),
        message: `Split into ${created.length} quests — sequential chapters you can finish one at a time.`,
        dashboard,
      },
      201,
    );
  });
}
