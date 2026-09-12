import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companionMessages } from "@/db/schema";
import { clientIp, handle, ok, parseBody, rateLimit, requireUser } from "@/lib/api";
import { aiConfigTarget, getAiConfigRow } from "@/lib/ai-settings";
import { getDashboard } from "@/lib/dashboard";
import { runOracle } from "@/lib/oracle";
import type { CompanionMessage, OracleSuggestion } from "@/lib/types";
import { companionSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function serialize(row: typeof companionMessages.$inferSelect): CompanionMessage {
  let suggestions: OracleSuggestion[] = [];
  if (row.suggestions) {
    try {
      suggestions = JSON.parse(row.suggestions) as OracleSuggestion[];
    } catch {
      suggestions = [];
    }
  }
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "oracle",
    content: row.content,
    emotion: row.emotion,
    suggestions,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db
      .select()
      .from(companionMessages)
      .where(eq(companionMessages.userId, user.id))
      .orderBy(desc(companionMessages.createdAt))
      .limit(40);
    return ok({ messages: rows.reverse().map(serialize) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`oracle:${user.id}:${clientIp(req)}`, 30, 10 * 60_000);
    const { message } = await parseBody(req, companionSchema);

    const [dashboard, historyRows, aiRow] = await Promise.all([
      getDashboard(user.id),
      db
        .select({ role: companionMessages.role, content: companionMessages.content })
        .from(companionMessages)
        .where(eq(companionMessages.userId, user.id))
        .orderBy(asc(companionMessages.createdAt))
        .limit(12),
      getAiConfigRow(user.id),
    ]);

    const result = await runOracle({
      dashboard,
      message,
      history: historyRows.map((r) => ({
        role: r.role === "user" ? "user" : "oracle",
        content: r.content,
      })),
      // Per-user override; null falls back to the environment/keyless ensemble.
      targets: aiConfigTarget(aiRow),
    });

    const [userRow] = await db
      .insert(companionMessages)
      .values({ userId: user.id, role: "user", content: message, emotion: result.emotion })
      .returning();
    const [oracleRow] = await db
      .insert(companionMessages)
      .values({
        userId: user.id,
        role: "oracle",
        content: result.reply,
        emotion: result.emotion,
        suggestions: JSON.stringify(result.suggestions),
        // Column is varchar(60); user-supplied model ids can be long.
        provider: result.provider.slice(0, 60),
      })
      .returning();

    return ok({
      user: serialize(userRow),
      oracle: { ...serialize(oracleRow), trace: result.trace },
      crisis: result.crisis,
    });
  });
}

export async function DELETE() {
  return handle(async () => {
    const user = await requireUser();
    await db.delete(companionMessages).where(eq(companionMessages.userId, user.id));
    return ok({ ok: true });
  });
}
