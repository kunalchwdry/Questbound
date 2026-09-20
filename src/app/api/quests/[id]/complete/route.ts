import { handle, ok, parseId, requireUser } from "@/lib/api";
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDashboard } from "@/lib/dashboard";
import { todayInTimeZone } from "@/lib/dates";
import { completeQuest } from "@/lib/engine";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const questId = parseId(id);
    const result = await completeQuest(user.id, questId);

    // InnerLoop: log the behavioural event (fire-and-forget; never blocks the reward).
    void (async () => {
      try {
        const [q] = await db
          .select({ scheduledFor: quests.scheduledFor, estimatedMinutes: quests.estimatedMinutes })
          .from(quests)
          .where(eq(quests.id, questId));
        await db.insert(questEvents).values({
          userId: user.id,
          questId,
          event: "completed",
          scheduledFor: q?.scheduledFor ?? todayInTimeZone(user.timezone),
          durationMin: q?.estimatedMinutes ?? null,
        });
      } catch (err) {
        console.warn("[innerloop] completion event log failed:", err);
      }
    })();

    const dashboard = await getDashboard(user.id);
    return ok({ result, dashboard });
  });
}
