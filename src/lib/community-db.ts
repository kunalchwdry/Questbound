import { pool } from "@/db";
import type { PoolClient, QueryResultRow } from "pg";
import { ApiError } from "./api";
export type SqlClient = Pick<PoolClient, "query">;
export async function rows<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  c: SqlClient = pool,
): Promise<T[]> {
  return (await c.query<T>(sql, params)).rows;
}
export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  c: SqlClient = pool,
): Promise<T> {
  const result = await rows<T>(sql, params, c);
  if (!result[0])
    throw new ApiError("Not found or unavailable to this hero.", 404);
  return result[0];
}
export function isModerator(id: number) {
  return (process.env.COMMUNITY_MODERATOR_IDS ?? "")
    .split(",")
    .some((v) => v.trim() === String(id));
}
export async function transaction<T>(
  actor: number,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='8s'");
    await c.query("SET LOCAL statement_timeout='15s'");
    await c.query("SELECT pg_advisory_xact_lock(71342,$1)", [actor]);
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    if (e && typeof e === "object" && "code" in e) {
      if (e.code === "23505")
        throw new ApiError(
          "This already exists. Refresh the hall and try again.",
          409,
        );
      if (e.code === "55P03" || e.code === "40P01")
        throw new ApiError("The hall is busy. Please retry.", 409);
    }
    throw e;
  } finally {
    c.release();
  }
}
export async function throttle(
  c: SqlClient,
  user: number,
  bucket: string,
  limit: number,
) {
  const r = await one<{ hits: number }>(
    `INSERT INTO community_rate_limits(user_id,bucket,window_start,hits) VALUES($1,$2,date_trunc('hour',now()),1) ON CONFLICT(user_id,bucket) DO UPDATE SET hits=CASE WHEN community_rate_limits.window_start=date_trunc('hour',now()) THEN community_rate_limits.hits+1 ELSE 1 END,window_start=date_trunc('hour',now()) RETURNING hits`,
    [user, bucket],
    c,
  );
  if (r.hits > limit)
    throw new ApiError(
      "Take a breather. This hourly action limit keeps the hall useful.",
      429,
    );
}
export const postAccess = `p.deleted_at IS NULL AND p.status NOT IN ('removed','archived') AND (p.guild_id IS NULL OR EXISTS(SELECT 1 FROM guild_members gm WHERE gm.guild_id=p.guild_id AND gm.user_id=$1)) AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.author_id) OR (b.blocked_id=$1 AND b.blocker_id=p.author_id))`;
export async function accessiblePost(c: SqlClient, user: number, id: number) {
  return one(
    `SELECT p.* FROM community_posts p WHERE p.id=$2 AND ${postAccess} FOR UPDATE`,
    [user, id],
    c,
  );
}
export async function guildRole(
  c: SqlClient,
  user: number,
  id: number,
  roles = ["owner", "moderator", "member"],
) {
  const r = await one(
    `SELECT g.*,m.role FROM guilds g JOIN guild_members m ON m.guild_id=g.id WHERE g.id=$1 AND m.user_id=$2 FOR UPDATE OF g`,
    [id, user],
    c,
  );
  if (!roles.includes(r.role))
    throw new ApiError("Your guild role cannot perform that action.", 403);
  return r;
}
export async function notify(
  c: SqlClient,
  user: number,
  actor: number,
  kind: string,
  title: string,
  body: string,
  href: string,
  key: string,
) {
  if (user === actor) return;
  await c.query(
    `INSERT INTO notifications(user_id,actor_id,kind,title,body,href,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
    [user, actor, kind, title.slice(0, 120), body.slice(0, 240), href, key],
  );
}
// Recipient locking serializes the daily/pair budgets across different actors.
export async function reputation(
  c: SqlClient,
  user: number,
  actor: number,
  delta: number,
  reason: string,
  refType: string,
  refId: number,
  key: string,
) {
  if (user === actor) return false;
  await c.query("SELECT pg_advisory_xact_lock(71343,$1)", [user]);
  const budget = await one<{ daily: number; pair: number }>(
    `SELECT coalesce(sum(greatest(delta,0)),0)::int daily,coalesce(sum(greatest(delta,0)) FILTER(WHERE actor_id=$2),0)::int pair FROM community_reputation_transactions WHERE user_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [user, actor],
    c,
  );
  if (budget.daily + delta > 50 || budget.pair + delta > 20) return false;
  const award = await rows(
    `INSERT INTO community_reputation_transactions(user_id,actor_id,delta,reason,ref_type,ref_id,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
    [user, actor, delta, reason, refType, refId, key],
    c,
  );
  if (award.length)
    await notify(
      c,
      user,
      actor,
      "reputation",
      `+${delta} community reputation`,
      "Your contribution helped another hero.",
      refType === "comment" ? "/community" : "/community",
      `rep:${key}`,
    );
  return award.length > 0;
}
