import { z } from "zod";
import { clientIp, handle, ok, parseBody, rateLimit, requireUser } from "@/lib/api";
import { aiConfigTarget, getAiConfigRow } from "@/lib/ai-settings";
import { getDashboard } from "@/lib/dashboard";
import { generatePlan } from "@/lib/innerloop/planning";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  goal: z.string().trim().max(200, "Keep the goal under 200 characters").optional().default(""),
  availableMinutes: z.number().int().min(10, "Give yourself at least 10 minutes").max(480, "That's over 8 hours — split it into multiple days"),
  energy: z.enum(["high", "medium", "low"]),
  mood: z
    .enum(["calm", "focused", "tired", "anxious", "overwhelmed", "frustrated", "neutral"])
    .optional()
    .nullable(),
  deadlines: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  goalId: z.number().int().positive().optional().nullable(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`plan:${user.id}:${clientIp(req)}`, 12, 10 * 60_000);
    const body = await parseBody(req, inputSchema);

    const [dashboard, aiRow] = await Promise.all([
      getDashboard(user.id),
      getAiConfigRow(user.id),
    ]);

    const result = await generatePlan(dashboard, {
      userId: user.id,
      goal: body.goal,
      availableMinutes: body.availableMinutes,
      energy: body.energy,
      mood: body.mood ?? null,
      deadlines: body.deadlines ?? null,
      note: body.note ?? null,
      goalId: body.goalId ?? null,
      targets: aiConfigTarget(aiRow),
    });

    return ok({ plan: result });
  });
}
