import { ApiError, clientIp, handle, ok, parseBody, rateLimit } from "@/lib/api";
import { ensureAppUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/dates";
import { createSupabaseServerClient } from "@/lib/supabase";
import { signupSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`signup:${clientIp(req)}`, 10, 15 * 60_000);
    const body = await parseBody(req, signupSchema);
    const email = body.email.trim().toLowerCase();
    const timezone = isValidTimeZone(body.timezone) ? body.timezone : "UTC";

    const supabase = await createSupabaseServerClient();
    const origin = new URL(req.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: body.password,
      options: {
        emailRedirectTo: `${origin}/guild`,
        data: {
          display_name: body.displayName,
          class_key: body.classKey,
          timezone,
        },
      },
    });

    if (error) {
      if (/already registered|already exists|already been registered/i.test(error.message)) {
        throw new ApiError(
          "A hero with that email already exists. Try signing in instead.",
          409,
        );
      }
      throw new ApiError(error.message || "Could not create your hero.", 400);
    }

    // Supabase obfuscates existing accounts when email confirmation is on by
    // returning a user with no identities.
    if (!data.session && data.user && (data.user.identities?.length ?? 0) === 0) {
      throw new ApiError(
        "A hero with that email already exists. Try signing in instead.",
        409,
      );
    }

    // Auto-confirmed projects return a session immediately: provision the
    // profile + starter quests now.
    if (data.session && data.user) {
      await ensureAppUser(data.user);
      return ok({ ok: true, confirmRequired: false }, 201);
    }

    // Email confirmation is enabled — tell the client to wait for the link.
    return ok(
      {
        ok: true,
        confirmRequired: true,
        message:
          "Almost there — check your inbox and confirm your email, then sign in.",
      },
      201,
    );
  });
}
