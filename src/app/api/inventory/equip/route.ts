import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";
import { equipItem } from "@/lib/engine";
import { idSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { itemId } = await parseBody(req, idSchema);
    const result = await equipItem(user.id, itemId);
    const dashboard = await getDashboard(user.id);
    return ok({ ...result, dashboard });
  });
}
