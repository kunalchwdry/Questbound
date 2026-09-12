import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_KEY ??
  "";

if (!url || !anonKey) {
  throw new Error(
    "Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

/**
 * Cookie attributes for the Supabase auth cookies.
 *
 * On localhost we use the default Lax policy. On any other host — Vercel, and
 * especially the platform's proxied/embedded live preview, which browsers
 * treat as a cross-site (third-party) context — Lax cookies are silently
 * dropped, so the session must be `SameSite=None; Secure` to survive.
 */
export function supabaseCookieOptions(host?: string | null) {
  const h = (host ?? "").toLowerCase();
  const isLocal =
    h === "" || h.includes("localhost") || h.includes("127.0.0.1") || h.endsWith(".local");
  return isLocal
    ? { path: "/" as const, sameSite: "lax" as const }
    : { path: "/" as const, sameSite: "none" as const, secure: true };
}

/**
 * A Supabase client for Server Components, Route Handlers and Server Actions.
 * Cookies are read/written through next/headers, so GoTrue sessions are stored
 * as httpOnly cookies exactly like the app's previous custom sessions.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieOptions = supabaseCookieOptions(headerStore.get("host"));

  return createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, { ...cookieOptions, ...options });
          });
        } catch {
          // Called from a Server Component (where cookies are read-only). The
          // proxy (middleware) refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** True if any (possibly chunked) Supabase auth cookie is present. */
export function hasSupabaseAuthCookie(list: () => { name: string }[]): boolean {
  return list().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token"),
  );
}
