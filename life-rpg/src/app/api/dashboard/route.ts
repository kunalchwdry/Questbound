import { handle, ok, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const dashboard = await getDashboard(user.id);
    return ok(dashboard);
  });
}
