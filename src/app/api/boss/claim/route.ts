import { handle, ok, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";
import { claimBoss } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const result = await claimBoss(user.id);
    const dashboard = await getDashboard(user.id);
    return ok({ result, dashboard });
  });
}
