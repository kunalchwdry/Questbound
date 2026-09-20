import type { User as SupabaseUser } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { quests, users, type UserRow } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isValidTimeZone } from "@/lib/dates";
import { isClassKey } from "@/lib/game";
import { starterQuestsFor } from "@/lib/starters";

/**
 * Authentication is handled by Supabase Auth (GoTrue), which stores the JWT in
 * httpOnly cookies via @supabase/ssr. We keep a lightweight `users` *profile*
 * row (the character sheet + progression) linked by `auth_id` and created
 * lazily on the first authenticated request.
 */

/** Derive a presentable hero name from the email local-part. */
function nameFromEmail(email?: string | null): string {
  const local = (email ?? "hero").split("@")[0] ?? "hero";
  const cleaned = local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const titled = cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
  const name = titled || "Hero";
  return name.slice(0, 40);
}

/**
 * Ensure a Supabase Auth user has a matching app profile row, seeding starter
 * quests the first time. Idempotent and concurrency-safe (unique `auth_id`).
 */
export async function ensureAppUser(authUser: SupabaseUser): Promise<UserRow> {
  // Fast path: profile already exists.
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.authId, authUser.id))
    .limit(1);
  if (existing[0]) return existing[0];

  const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const email = (authUser.email ?? "").trim().toLowerCase();
  const rawName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  const displayName = (rawName.length >= 2 ? rawName : nameFromEmail(email)).slice(0, 40);
  const metaClass = typeof meta.class_key === "string" ? meta.class_key : "knight";
  const classKey = isClassKey(metaClass) ? metaClass : "knight";
  const metaTz = typeof meta.timezone === "string" ? meta.timezone : "UTC";
  const timezone = isValidTimeZone(metaTz) ? metaTz : "UTC";

  let row: UserRow | undefined;
  try {
    const inserted = await db
      .insert(users)
      .values({ authId: authUser.id, email, displayName, classKey, timezone })
      .onConflictDoNothing({ target: users.authId })
      .returning();
    row = inserted[0];
  } catch {
    row = undefined;
  }

  // Lost a concurrent insert race — re-read the winner.
  if (!row) {
    const again = await db
      .select()
      .from(users)
      .where(eq(users.authId, authUser.id))
      .limit(1);
    if (again[0]) return again[0];
    throw new Error("Could not provision user profile");
  }

  // First-time hero: lay down the class-themed starter quests.
  await db
    .insert(quests)
    .values(
      starterQuestsFor(classKey).map((q) => ({
        userId: row!.id,
        title: q.title,
        notes: q.notes,
        attribute: q.attribute,
        difficulty: q.difficulty,
        type: q.type,
      })),
    )
    .catch(() => undefined);

  return row;
}

/**
 * DEV-ONLY sandbox bypass (see ADR-024): when QUESTBOUND_DEV_AUTH_BYPASS=1 is
 * set in a non-production build outside Vercel, skip Supabase session
 * resolution and impersonate a fixed demo hero so the app can run in a local
 * sandbox without a Supabase project. The variable is inert everywhere else —
 * production builds and any Vercel deployment ignore it entirely.
 */
const DEV_SANDBOX_AUTH =
  process.env.QUESTBOUND_DEV_AUTH_BYPASS === "1" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.VERCEL;

export const DEV_SANDBOX_AUTH_ID = "00000000-0000-4000-8000-000000000001";

function devSandboxAuthUser(): SupabaseUser {
  return {
    id: DEV_SANDBOX_AUTH_ID,
    email: "hero@questbound.local",
    aud: "authenticated",
    created_at: new Date(0).toISOString(),
    user_metadata: {
      display_name: "Sandbox Hero",
      class_key: "knight",
      timezone: "UTC",
    },
  } as unknown as SupabaseUser;
}

/**
 * Resolve the current app user from the Supabase session, provisioning the
 * profile on first login. Returns null for anonymous requests.
 */
export async function getSessionUser(): Promise<UserRow | null> {
  if (DEV_SANDBOX_AUTH) return ensureAppUser(devSandboxAuthUser());
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return ensureAppUser(user);
}
