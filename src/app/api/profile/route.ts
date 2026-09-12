import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";
import { updateHero } from "@/lib/engine";
import { profilePatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const patch = await parseBody(req, profilePatchSchema);
    await updateHero(user.id, patch);
    const dashboard = await getDashboard(user.id);
    return ok({ dashboard });
  });
}
