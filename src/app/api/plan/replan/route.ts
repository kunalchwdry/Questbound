import { z } from "zod";
import { clientIp, handle, ok, parseBody, rateLimit, requireUser } from "@/lib/api";
import { aiConfigTarget, getAiConfigRow } from "@/lib/ai-settings";
import { getDashboard } from "@/lib/dashboard";
import { explainReplan } from "@/lib/innerloop/oracle-explain";
import { computeReplan, loadTodaysPlan, nextBestQuest, type ReplanReason } from "@/lib/innerloop/replanning";
import { db } from "@/db";
import { companionMessages } from "@/db/schema";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  reason: z.enum(["missed-quest", "less-time", "more-time", "energy-change", "manual"]),
  remainingMinutes: z.number().int().min(5).max(720).optional(),
  missedQuestId: z.number().int().positive().optional(),
  energy: z.enum(["high", "medium", "low"]).optional(),
  mood: z.string().max(20).optional().nullable(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`replan:${user.id}:${clientIp(req)}`, 20, 10 * 60_000);
    const body = await parseBody(req, inputSchema);
    const aiRow = await getAiConfigRow(user.id);

    const { changes, openAfter, today } = await computeReplan({
      userId: user.id,
      reason: body.reason as ReplanReason,
      remainingMinutes: body.remainingMinutes,
      missedQuestId: body.missedQuestId,
      energy: body.energy,
      mood: body.mood ?? null,
      targets: aiConfigTarget(aiRow),
    });

    const next = nextBestQuest(openAfter, today);
    const dashboard = await getDashboard(user.id);

    // Ask the Oracle to explain what changed (and speak it into the Oracle
    // conversation so the user can ask follow-up questions).
    const explanation = await explainReplan({
      dashboard,
      changes,
      reason: body.reason,
      remainingMinutes: body.remainingMinutes,
      targets: aiConfigTarget(aiRow),
    });

    // Persist as an Oracle message so the Sanctum chat shows the "why".
    if (explanation) {
      await db.insert(companionMessages).values({
        userId: user.id,
        role: "oracle",
        content: explanation,
        emotion: "neutral",
        suggestions: "[]",
        provider: "rebalancer",
      });
    }

    return ok({
      changes,
      nextQuestId: next?.id ?? null,
      nextQuestTitle: next?.title ?? null,
      explanation,
      dashboard,
    });
  });
}
