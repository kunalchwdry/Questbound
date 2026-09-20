import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { goals } from "@/db/innerloop-schema";
import { ApiError, handle, ok, parseBody, parseId, requireUser } from "@/lib/api";
import { ATTRIBUTES } from "@/lib/game";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  attribute: z.enum(ATTRIBUTES).optional().nullable(),
  status: z.enum(["active", "completed", "abandoned"]).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const goalId = parseId(id);
    const body = await parseBody(req, patchSchema);

    const [row] = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)));
    if (!row) throw new ApiError("Campaign not found", 404);

    const patch: Partial<typeof goals.$inferInsert> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.attribute !== undefined) patch.attribute = body.attribute ?? null;
    if (body.deadline !== undefined) patch.deadline = body.deadline ?? null;
    if (body.notes !== undefined) patch.notes = body.notes ?? null;
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "completed") patch.completedAt = new Date();
      if (body.status === "active") patch.completedAt = null;
    }
    patch.updatedAt = new Date();

    const [next] = await db
      .update(goals)
      .set(patch)
      .where(and(eq(goals.id, goalId), eq(goals.userId, user.id)))
      .returning();
    return ok({ goal: next });
  });
}
