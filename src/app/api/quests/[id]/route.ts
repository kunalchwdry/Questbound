import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { questEvents } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { ApiError, handle, ok, parseBody, parseId, requireUser } from "@/lib/api";
import { serializeQuest } from "@/lib/dashboard";
import { todayInTimeZone } from "@/lib/dates";
import { questPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const questId = parseId(id);
    const body = await parseBody(req, questPatchSchema);

    const [existing] = await db.select().from(quests).where(and(eq(quests.id, questId), eq(quests.userId, user.id)));
    if (!existing) throw new ApiError("Quest not found", 404);
    if (body.type !== undefined && body.type !== existing.type && existing.timesCompleted > 0) {
      throw new ApiError("A quest's type is fixed after its first completion. Create a new quest for a different routine.", 409);
    }

    const patch: Partial<typeof quests.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.notes !== undefined) patch.notes = body.notes ? body.notes : null;
    if (body.attribute !== undefined) patch.attribute = body.attribute;
    if (body.difficulty !== undefined) patch.difficulty = body.difficulty;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
    if (body.type !== undefined) {
      patch.type = body.type;
      if (body.type !== "once") patch.completedAt = null;
    }

    const [row] = await db
      .update(quests)
      .set(patch)
      .where(and(eq(quests.id, questId), eq(quests.userId, user.id), eq(quests.timesCompleted, existing.timesCompleted)))
      .returning();
    if (!row) throw new ApiError("Quest not found", 404);
    return ok({ quest: serializeQuest(row) });
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const questId = parseId(id);

    // InnerLoop: record the abandon before the row disappears (FK SET NULL keeps the ledger clean).
    const [quest] = await db
      .select({ scheduledFor: quests.scheduledFor })
      .from(quests)
      .where(and(eq(quests.id, questId), eq(quests.userId, user.id)));
    void (async () => {
      try {
        if (quest) {
          await db.insert(questEvents).values({
            userId: user.id,
            questId,
            event: "abandoned",
            scheduledFor: quest.scheduledFor ?? todayInTimeZone(user.timezone),
          });
        }
      } catch (err) {
        console.warn("[innerloop] abandon event log failed:", err);
      }
    })();

    const deleted = await db
      .delete(quests)
      .where(and(eq(quests.id, questId), eq(quests.userId, user.id)))
      .returning({ id: quests.id });
    if (deleted.length === 0) throw new ApiError("Quest not found", 404);
    return ok({ ok: true });
  });
}
