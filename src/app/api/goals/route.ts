import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { goals } from "@/db/innerloop-schema";
import { handle, ok, parseBody, requireUser, ApiError } from "@/lib/api";
import { ATTRIBUTES } from "@/lib/game";

export const dynamic = "force-dynamic";

const goalSchema = z.object({
  title: z.string().trim().min(3, "Give your campaign a name").max(160),
  attribute: z.enum(ATTRIBUTES).optional().nullable(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, user.id), eq(goals.status, "active")))
      .orderBy(desc(goals.createdAt))
      .limit(10);
    return ok({ goals: rows });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, goalSchema);

    const existing = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, user.id), eq(goals.status, "active")));
    if (existing.length >= 10) {
      throw new ApiError("You already have 10 active campaigns — complete or abandon one first.", 409);
    }

    const [row] = await db
      .insert(goals)
      .values({
        userId: user.id,
        title: body.title,
        attribute: body.attribute ?? null,
        deadline: body.deadline ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return ok({ goal: row }, 201);
  });
}
