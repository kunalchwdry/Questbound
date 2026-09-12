import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";
import { recordCheckin } from "@/lib/engine";
import { checkinSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, checkinSchema);
    const result = await recordCheckin(user.id, body);
    const dashboard = await getDashboard(user.id);
    return ok({ result, dashboard });
  });
}
