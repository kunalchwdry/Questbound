import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quests } from "@/db/schema";
import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { serializeQuest } from "@/lib/dashboard";
import { questInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(quests)
      .where(eq(quests.userId, user.id))
      .orderBy(desc(quests.createdAt));
    return ok({ quests: rows.map((r) => serializeQuest(r)) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, questInputSchema);
    const [row] = await db
      .insert(quests)
      .values({
        userId: user.id,
        title: body.title,
        notes: body.notes ? body.notes : null,
        attribute: body.attribute,
        difficulty: body.difficulty,
        type: body.type,
        dueDate: body.dueDate ?? null,
      })
      .returning();
    return ok({ quest: serializeQuest(row) }, 201);
  });
}
