import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseCookieOptions } from "@/lib/supabase";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_KEY ??
  "";

/**
 * Edge/network boundary. It does two jobs:
 *  1. Refreshes the Supabase session (GoTrue JWT) on every matched request and
 *     re-writes the (possibly chunked) auth cookies onto both the forwarded
 *     request and the response — the official @supabase/ssr pattern.
 *  2. Redirects anonymous visitors hitting /guild to /login with a real 307.
 *
 * Pages and API handlers still call supabase.auth.getUser() themselves, so the
 * token is always re-validated; this guard only prevents rendering the app for
 * obviously anonymous requests.
 */
/**
 * DEV-ONLY sandbox bypass (ADR-024): same triple gate as src/lib/auth.ts —
 * inert in production builds and on Vercel. Lets the app render in a local
 * sandbox with no Supabase project at all.
 */
const DEV_SANDBOX_AUTH =
  process.env.QUESTBOUND_DEV_AUTH_BYPASS === "1" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL;

export async function proxy(request: NextRequest) {
  if (DEV_SANDBOX_AUTH) return NextResponse.next({ request });

  const host = request.headers.get("host");
  const cookieOptions = supabaseCookieOptions(host);

  let response = NextResponse.next({ request });

  // If Supabase isn't configured yet, behave as a pass-through.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Make the new session visible to downstream handlers/renderers.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...cookieOptions, ...options }),
        );
      },
    },
  });

  // A transient auth-service/cookie error must not 500 the whole request;
  // pages and route handlers re-validate with getUser() themselves.
  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/guild") && !user) {
    const hasCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    // If a cookie exists but getUser() failed transiently, let the page render
    // (it will verify and redirect as needed) instead of bouncing on a blip.
    if (hasCookie) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  // Run on pages and API routes, skip static assets / image pipeline.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
