import { handle, ok } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
    return ok({ ok: true });
  });
}
