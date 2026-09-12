import { handle, ok, parseId, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";
import { completeQuest } from "@/lib/engine";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const questId = parseId(id);
    const result = await completeQuest(user.id, questId);
    const dashboard = await getDashboard(user.id);
    return ok({ result, dashboard });
  });
}
