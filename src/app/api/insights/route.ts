import { handle, ok, requireUser } from "@/lib/api";
import { computeExecutionProfile, computeReport } from "@/lib/innerloop/behavior";
import { todayInTimeZone } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    const windowDays = Math.min(90, Math.max(7, Number(url.searchParams.get("days") ?? 30) || 30));

    const today = todayInTimeZone(user.timezone);
    const [report, profile] = await Promise.all([
      computeReport(user.id, windowDays, today),
      computeExecutionProfile(user.id, Math.min(30, windowDays)),
    ]);

    return ok({ report, profile });
  });
}
