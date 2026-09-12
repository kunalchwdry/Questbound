import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, clientIp, handle, ok, parseBody, rateLimit } from "@/lib/api";
import { ensureAppUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, loginSchema);
    const email = body.email.trim().toLowerCase();
    rateLimit(`login:${clientIp(req)}:${email}`, 12, 15 * 60_000);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: body.password,
    });

    if (error || !data.session || !data.user) {
      const msg = error?.message ?? "";
      if (/email not confirmed|not confirmed/i.test(msg)) {
        throw new ApiError(
          "Please confirm your email via the link we sent you before signing in.",
          403,
        );
      }
      if (/invalid login credentials|invalid credentials/i.test(msg)) {
        throw new ApiError("That email and password don't match our ledger.", 401);
      }
      throw new ApiError(msg || "Could not sign in. Please try again.", 401);
    }

    // Provision the app profile (and starter quests on first sign-in).
    const appUser = await ensureAppUser(data.user);

    if (isValidTimeZone(body.timezone) && body.timezone !== appUser.timezone) {
      await db
        .update(users)
        .set({ timezone: body.timezone })
        .where(eq(users.id, appUser.id));
    }

    return ok({ ok: true });
  });
}
