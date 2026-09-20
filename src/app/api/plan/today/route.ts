import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { planSessions } from "@/db/innerloop-schema";
import { quests } from "@/db/schema";
import { handle, ok, requireUser } from "@/lib/api";
import { serializeQuest } from "@/lib/dashboard";
import { todayInTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const today = todayInTimeZone(user.timezone);

    const rows = await db
      .select()
      .from(quests)
      .where(
        and(
          eq(quests.userId, user.id),
          eq(quests.scheduledFor, today),
          eq(quests.questStatus, "active"),
          isNull(quests.completedAt),
        ),
      )
      .orderBy(quests.scheduledOrder);

    const sessions = await db
      .select()
      .from(planSessions)
      .where(and(eq(planSessions.userId, user.id), eq(planSessions.day, today)))
      .orderBy(desc(planSessions.createdAt))
      .limit(1);

    const plannedMinutes = rows.reduce(
      (s, r) =>
        s +
        (r.estimatedMinutes ??
          (r.difficulty === "trivial"
            ? 10
            : r.difficulty === "easy"
              ? 20
              : r.difficulty === "medium"
                ? 45
                : r.difficulty === "hard"
                  ? 90
                  : 150)),
      0,
    );

    return ok({
      today,
      quests: rows.map((r) => serializeQuest(r)),
      session: sessions[0] ?? null,
      plannedMinutes,
    });
  });
}
