import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { ApiError, clientIp, handle, ok, parseBody, parseId, rateLimit, requireUser } from "@/lib/api";
import { todayInTimeZone } from "@/lib/dates";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event: z.enum(["started", "abandoned", "postponed", "rescheduled"]),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  durationMin: z.number().int().min(0).max(720).optional(),
  energy: z.enum(["high", "medium", "low"]).optional(),
  mood: z.string().max(20).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Behavioural telemetry for the adaptive engine. Fire-and-forget; these
 * events never affect rewards — only insights & replanning.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`qevent:${user.id}:${clientIp(req)}`, 120, 10 * 60_000);
    const { id } = await params;
    const questId = parseId(id);
    const body = await parseBody(req, bodySchema);

    const [quest] = await db
      .select()
      .from(quests)
      .where(and(eq(quests.id, questId), eq(quests.userId, user.id)));
    if (!quest) throw new ApiError("Quest not found", 404);

    const today = todayInTimeZone(user.timezone);

    await db.transaction(async (tx) => {
      await tx.insert(questEvents).values({
        userId: user.id,
        questId: quest.id,
        event: body.event,
        scheduledFor: body.scheduledFor ?? quest.scheduledFor ?? today,
        fromDay: body.event === "postponed" || body.event === "rescheduled" ? quest.scheduledFor ?? today : null,
        toDay: body.toDay ?? null,
        durationMin: body.durationMin ?? null,
        energyLevel: body.energy ?? null,
        moodTag: body.mood ?? null,
        meta: body.meta ?? null,
      });

      // Effect of the event on the quest row itself:
      if (body.event === "postponed" && body.toDay) {
        await tx
          .update(quests)
          .set({ scheduledFor: body.toDay, scheduledOrder: null, updatedAt: new Date() })
          .where(eq(quests.id, quest.id));
      } else if (body.event === "rescheduled" && body.toDay) {
        await tx
          .update(quests)
          .set({ scheduledFor: body.toDay, updatedAt: new Date() })
          .where(eq(quests.id, quest.id));
      }
    });

    return ok({ ok: true });
  });
}
