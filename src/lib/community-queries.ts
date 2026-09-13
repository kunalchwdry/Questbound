import { pool } from "@/db";
import { ApiError } from "./api";
import {
  rows,
  one,
  postAccess,
  isModerator,
  transaction,
} from "./community-db";
import { levelFromXp, attributeProgress, ATTRIBUTES } from "./game";
import {
  CATEGORIES,
  POST_TYPES,
  type HeroPublic,
  type Post,
  type Comment,
  type Guild,
  type SharedQuest,
  type BoardCategory,
} from "./community-types";
const heroFields = `u.id,u.display_name,u.class_key,u.xp,CASE WHEN u.last_active_date >= to_char((now() AT TIME ZONE u.timezone)::date-1,'YYYY-MM-DD') THEN u.streak ELSE 0 END AS streak,
 coalesce(rep.reputation,0)::int reputation,coalesce(rep.helpful,0)::int helpful,coalesce(rep.solved,0)::int solved,g.name guild_name,g.id guild_id`;
const heroJoins = `LEFT JOIN (SELECT user_id,sum(delta) reputation,count(*) FILTER(WHERE reason='helpful_answer' AND delta>0) helpful,count(*) FILTER(WHERE reason='problem_solved' AND delta>0) solved FROM community_reputation_transactions GROUP BY user_id) rep ON rep.user_id=u.id LEFT JOIN guild_members gm ON gm.user_id=u.id LEFT JOIN guilds g ON g.id=gm.guild_id`;
const postFields = `p.id,p.author_id,u.display_name,u.class_key,u.xp,p.post_type,p.title,p.content,p.tried,p.category,p.is_solved,p.solved_comment_id,p.guild_id,g.name guild_name,p.created_at,
 (SELECT count(*)::int FROM community_comments cc WHERE cc.post_id=p.id AND cc.deleted_at IS NULL) comment_count,
 (SELECT count(*)::int FROM community_reactions cr WHERE cr.post_id=p.id) reaction_count,
 ARRAY(SELECT t.slug FROM community_post_tags pt JOIN community_tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id) tags,
 EXISTS(SELECT 1 FROM community_saved_posts s WHERE s.post_id=p.id AND s.user_id=$1) saved,
 ARRAY(SELECT cr.reaction::text FROM community_reactions cr WHERE cr.post_id=p.id AND cr.user_id=$1) reactions`;
const postFrom = `FROM community_posts p JOIN users u ON u.id=p.author_id LEFT JOIN guilds g ON g.id=p.guild_id`;
const pageNumber = (s: string | null) =>
  Math.max(0, Math.min(10000, Number(s) || 0)) | 0;
export async function feed(user: number, p: URLSearchParams) {
  const page = pageNumber(p.get("page"));
  const type = p.get("type") ?? "all";
  if (
    type !== "all" &&
    !POST_TYPES.includes(type as (typeof POST_TYPES)[number])
  )
    throw new ApiError("Invalid post filter");
  const order =
    p.get("sort") === "unanswered"
      ? "comment_count ASC,p.created_at DESC"
      : p.get("sort") === "active"
        ? "p.last_activity_at DESC,p.id DESC"
        : "p.created_at DESC,p.id DESC";
  const items = await rows<Post>(
    `SELECT ${postFields} ${postFrom} WHERE ${postAccess} AND ($2='all' OR p.post_type::text=$2) AND ($3='' OR p.title ILIKE $3 OR p.content ILIKE $3 OR EXISTS(SELECT 1 FROM community_post_tags pt JOIN community_tags t ON t.id=pt.tag_id WHERE pt.post_id=p.id AND t.slug ILIKE $3)) AND (NOT $4::boolean OR EXISTS(SELECT 1 FROM community_saved_posts s WHERE s.user_id=$1 AND s.post_id=p.id)) AND ($5::int IS NULL OR p.guild_id=$5) AND (NOT $6::boolean OR p.is_solved) ORDER BY ${order} LIMIT 13 OFFSET $7`,
    [
      user,
      type,
      p.get("q") ? "%" + p.get("q")!.slice(0, 100) + "%" : "",
      p.get("saved") === "true",
      p.get("guild") ? Number(p.get("guild")) : null,
      p.get("solved") === "true",
      page * 12,
    ],
  );
  return { posts: items.slice(0, 12), hasMore: items.length > 12, page };
}
export async function discussion(user: number, id: number, page = 0) {
  const post = await one<Post>(
    `SELECT ${postFields} ${postFrom} WHERE ${postAccess} AND p.id=$2`,
    [user, id],
  );
  const comments = await rows<Comment>(
    `SELECT c.id,c.post_id,c.author_id,u.display_name,u.class_key,CASE WHEN c.deleted_at IS NULL THEN c.content ELSE '[Response removed]' END content,c.parent_comment_id,c.is_solution,c.depth,c.deleted_at,c.created_at,
 (SELECT count(*)::int FROM community_reactions r WHERE r.comment_id=c.id AND r.reaction='helpful') helpful_count,
 ARRAY(SELECT r.reaction::text FROM community_reactions r WHERE r.comment_id=c.id AND r.user_id=$1) reactions
 FROM community_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$2 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=c.author_id) OR (b.blocked_id=$1 AND b.blocker_id=c.author_id)) ORDER BY c.created_at,c.id LIMIT 31 OFFSET $3`,
    [user, id, page * 30],
  );
  const canModerate =
    isModerator(user) ||
    Boolean(
      post.guild_id &&
        (
          await rows(
            `SELECT 1 FROM guild_members WHERE guild_id=$1 AND user_id=$2 AND role IN ('owner','moderator')`,
            [post.guild_id, user],
          )
        ).length,
    );
  return {
    post,
    comments: comments.slice(0, 30),
    hasMore: comments.length > 30,
    canModerate,
  };
}
export async function publicHero(user: number, id: number) {
  const h = await one<HeroPublic & Record<string, unknown>>(
    `SELECT ${heroFields},u.strength_xp,u.intellect_xp,u.vitality_xp,u.charisma_xp,u.discipline_xp,u.creativity_xp FROM users u ${heroJoins} WHERE u.id=$2 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id))`,
    [user, id],
  );
  const attributes = ATTRIBUTES.map((key) => ({
    key,
    xp: Number(h[key + "_xp"]),
    level: attributeProgress(Number(h[key + "_xp"])).level,
  }));
  for (const key of ATTRIBUTES) delete h[key + "_xp"];
  return { ...h, level: levelFromXp(h.xp).level, attributes };
}
const guildFields = `g.id,g.name,g.slug,g.description,g.motto,g.emblem,g.visibility,g.xp,1+g.xp/500 level,(SELECT count(*)::int FROM guild_members WHERE guild_id=g.id) member_count,m.role,
 coalesce((SELECT sum(c.guild_xp_awarded)::int FROM guild_quest_contributions c JOIN guild_quests q ON q.id=c.guild_quest_id WHERE q.guild_id=g.id AND c.created_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0) weekly_xp`;
export async function guildList(user: number, p: URLSearchParams) {
  const page = pageNumber(p.get("page"));
  const gs = await rows<Guild>(
    `SELECT ${guildFields} FROM guilds g LEFT JOIN guild_members m ON m.guild_id=g.id AND m.user_id=$1 WHERE g.name ILIKE $2 ORDER BY (m.role IS NOT NULL) DESC,g.xp DESC,g.id LIMIT 13 OFFSET $3`,
    [user, "%" + (p.get("q") ?? "").slice(0, 60) + "%", page * 12],
  );
  return { guilds: gs.slice(0, 12), hasMore: gs.length > 12 };
}
export async function guildDetail(user: number, id: number) {
  const guild = await one<Guild>(
    `SELECT ${guildFields} FROM guilds g LEFT JOIN guild_members m ON m.guild_id=g.id AND m.user_id=$1 WHERE g.id=$2`,
    [user, id],
  );
  if (!guild.role) return { guild, members: [], quests: [] };
  const members = await rows<
    HeroPublic & { role: string; contribution_xp: number }
  >(
    `SELECT ${heroFields},gm.role,gm.contribution_xp FROM users u ${heroJoins} WHERE gm.guild_id=$1 ORDER BY gm.contribution_xp DESC,u.id LIMIT 100`,
    [id],
  );
  const quests = await rows<SharedQuest>(
    `SELECT q.*,p.id IS NOT NULL joined,coalesce(p.contributions,0) contribution,coalesce(p.reward_claimed,false) reward_claimed,(SELECT count(*)::int FROM guild_quest_participants WHERE guild_quest_id=q.id) participants,CASE WHEN q.status='active' AND q.ends_at<=now() THEN 'expired' ELSE q.status::text END status FROM guild_quests q LEFT JOIN guild_quest_participants p ON p.guild_quest_id=q.id AND p.user_id=$1 WHERE q.guild_id=$2 ORDER BY q.created_at DESC LIMIT 30`,
    [user, id],
  );
  return {
    guild,
    members: members.map((h) => ({ ...h, level: levelFromXp(h.xp).level })),
    quests,
  };
}
export async function challenges(user: number, p: URLSearchParams) {
  const page = pageNumber(p.get("page"));
  const items = await rows<SharedQuest>(
    `SELECT q.*,p.id IS NOT NULL joined,coalesce(p.contribution,0) contribution,coalesce(p.reward_claimed,false) reward_claimed,(SELECT count(*)::int FROM community_challenge_participants WHERE challenge_id=q.id) participants,CASE WHEN q.status='active' AND q.ends_at<=now() THEN 'expired' ELSE q.status::text END status FROM community_challenges q LEFT JOIN community_challenge_participants p ON p.challenge_id=q.id AND p.user_id=$1 WHERE q.status<>'draft' ORDER BY (q.status='active' AND q.ends_at>now()) DESC,q.created_at DESC,q.id LIMIT 13 OFFSET $2`,
    [user, page * 12],
  );
  return {
    challenges: items.slice(0, 12),
    hasMore: items.length > 12,
    canCreate: isModerator(user),
  };
}
export async function inbox(user: number) {
  return {
    notifications: await rows(
      `SELECT id,kind,title,body,href,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [user],
    ),
    invites: await rows(
      `SELECT i.id,i.guild_id,g.name,u.display_name inviter FROM guild_invites i JOIN guilds g ON g.id=i.guild_id JOIN users u ON u.id=i.inviter_id WHERE i.invitee_id=$1 AND i.status='pending' ORDER BY i.created_at DESC LIMIT 30`,
      [user],
    ),
    blocks: await rows(
      `SELECT b.blocked_id id,u.display_name FROM user_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 LIMIT 100`,
      [user],
    ),
  };
}
export async function reports(user: number) {
  if (!isModerator(user)) throw new ApiError("Moderator access required.", 403);
  return {
    reports: await rows(
      `SELECT r.id,r.reason,r.details,r.created_at,r.post_id,r.comment_id,p.title FROM community_reports r LEFT JOIN community_posts p ON p.id=r.post_id WHERE r.status IN ('open','reviewing') ORDER BY r.created_at LIMIT 30`,
    ),
  };
}
export async function leaderboard(user: number, p: URLSearchParams) {
  const category = (p.get("category") ?? "community") as BoardCategory;
  if (!CATEGORIES.includes(category)) throw new ApiError("Unknown ranking");
  const page = pageNumber(p.get("page"));
  if (category === "guilds") {
    const gs = await guildList(
      user,
      new URLSearchParams({ page: String(page) }),
    );
    const ranked = await rows<Guild & { rank: number; score: number }>(
      `SELECT ${guildFields},row_number() OVER(ORDER BY g.xp DESC,g.id)::int rank,g.xp score FROM guilds g LEFT JOIN guild_members m ON m.guild_id=g.id AND m.user_id=$1 ORDER BY g.xp DESC,g.id LIMIT 13 OFFSET $2`,
      [user, page * 12],
    );
    return {
      ...gs,
      guilds: ranked.slice(0, 12),
      hasMore: ranked.length > 12,
      heroes: [],
      self: null,
      visible: true,
    };
  }
  const metric = (
    {
      overall: "u.xp",
      weekly: "coalesce(period.weekly,0)",
      monthly: "coalesce(period.monthly,0)",
      streak: `CASE WHEN u.last_active_date >= to_char((now() AT TIME ZONE u.timezone)::date-1,'YYYY-MM-DD') THEN u.streak ELSE 0 END`,
      community: "coalesce(rep.reputation,0)",
      solvers: "coalesce(rep.solved,0)",
    } as const
  )[category];
  // Period XP is explicitly completed-quest XP; historical bounty/boss bonuses were not logged.
  const cte = `WITH ranked AS(SELECT ${heroFields},(${metric})::int score,row_number() OVER(ORDER BY ${metric} DESC,u.id)::int rank FROM users u ${heroJoins} LEFT JOIN(SELECT user_id,sum(xp) FILTER(WHERE completed_at>=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') weekly,sum(xp) FILTER(WHERE completed_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') monthly FROM completions WHERE completed_at>=least(date_trunc('month',now() AT TIME ZONE 'UTC'),date_trunc('week',now() AT TIME ZONE 'UTC')) AT TIME ZONE 'UTC' GROUP BY user_id) period ON period.user_id=u.id WHERE u.leaderboard_visible AND NOT u.leaderboard_opt_out)`;
  const heroes = await rows<HeroPublic>(
    `${cte} SELECT * FROM ranked ORDER BY rank LIMIT 21 OFFSET $1`,
    [page * 20],
  );
  const self =
    (
      await rows<HeroPublic>(`${cte} SELECT * FROM ranked WHERE id=$1`, [user])
    )[0] ?? null;
  const visible = (
    await one<{ visible: boolean }>(
      `SELECT leaderboard_visible AND NOT leaderboard_opt_out visible FROM users WHERE id=$1`,
      [user],
    )
  ).visible;
  if (self)
    await transaction(user, async (c) => {
      const old = await rows<{ rank: number }>(
        `SELECT rank FROM leaderboard_rank_snapshots WHERE user_id=$1 AND category=$2 AND captured_on<to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY captured_on DESC LIMIT 1`,
        [user, category],
        c,
      );
      const best = await one<{ best: number | null }>(
        `SELECT min(rank)::int best FROM leaderboard_rank_snapshots WHERE user_id=$1 AND category=$2`,
        [user, category],
        c,
      );
      self.movement = old[0] ? old[0].rank - self.rank! : null;
      self.best = best.best !== null && self.rank! < best.best;
      await c.query(
        `INSERT INTO leaderboard_rank_snapshots(user_id,category,rank,metric_value,captured_on) VALUES($1,$2,$3,$4,to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')) ON CONFLICT DO NOTHING`,
        [user, category, self.rank, self.score],
      );
      if (self.movement && self.movement > 0)
        await c.query(
          `INSERT INTO notifications(user_id,kind,title,body,href,dedupe_key) VALUES($1,'leaderboard','Your contribution is growing',$2,'/leaderboard',$3) ON CONFLICT DO NOTHING`,
          [
            user,
            `You moved up ${self.movement} positions on the ${category} board.`,
            `rank:${user}:${category}:${new Date().toISOString().slice(0, 10)}`,
          ],
        );
    });
  return {
    heroes: heroes
      .slice(0, 20)
      .map((h) => ({ ...h, level: levelFromXp(h.xp).level })),
    hasMore: heroes.length > 20,
    self: self ? { ...self, level: levelFromXp(self.xp).level } : null,
    visible,
    guilds: [],
    period: "UTC · Monday week start · Weekly/monthly rankings count quest XP",
  };
}
export async function communityMeta(user: number) {
  return {
    userId: user,
    moderator: isModerator(user),
    guild:
      (
        await rows(
          `SELECT g.id,g.name,m.role FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.user_id=$1`,
          [user],
        )
      )[0] ?? null,
    unread: Number(
      (
        await pool.query(
          "SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL",
          [user],
        )
      ).rows[0].count,
    ),
  };
}

export async function searchHeroes(user: number, q: string) {
  if (q.trim().length < 2) return { heroes: [] };
  return {
    heroes: await rows(
      `SELECT u.id,u.display_name,u.class_key FROM users u WHERE u.id<>$1 AND u.display_name ILIKE $2 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocked_id=$1 AND b.blocker_id=u.id)) ORDER BY u.display_name,u.id LIMIT 10`,
      [user, "%" + q.trim().slice(0, 40) + "%"],
    ),
  };
}
