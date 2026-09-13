import { randomUUID } from "node:crypto";
import { ApiError } from "./api";
import {
  one,
  rows,
  transaction,
  throttle,
  accessiblePost,
  guildRole,
  notify,
  reputation,
  isModerator,
  type SqlClient,
} from "./community-db";
import type { CommunityAction } from "./community-validation";
import { levelFromXp, LEVEL_UP_GOLD } from "./game";
async function established(c: SqlClient, user: number) {
  const r = await one<{ ok: boolean }>(
    `SELECT created_at<now()-interval '24 hours' AND (SELECT count(*) FROM completions WHERE user_id=$1)>=5 ok FROM users WHERE id=$1`,
    [user],
    c,
  );
  return r.ok;
}
async function notBlocked(c: SqlClient, a: number, b: number) {
  if (
    (
      await rows(
        "SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)",
        [a, b],
        c,
      )
    ).length
  )
    throw new ApiError("This interaction is unavailable.", 403);
}
async function canModerate(c: SqlClient, user: number, guild: number | null) {
  return (
    isModerator(user) ||
    Boolean(
      guild &&
        (
          await rows(
            `SELECT 1 FROM guild_members WHERE guild_id=$1 AND user_id=$2 AND role IN ('owner','moderator')`,
            [guild, user],
            c,
          )
        ).length,
    )
  );
}
async function joinGuild(
  c: SqlClient,
  user: number,
  id: number,
  invited = false,
) {
  const g = await one("SELECT * FROM guilds WHERE id=$1 FOR UPDATE", [id], c);
  if (!invited && (g.visibility !== "public" || g.join_policy !== "open"))
    throw new ApiError("This guild requires an invitation.", 403);
  if (
    (await rows("SELECT 1 FROM guild_members WHERE user_id=$1", [user], c))
      .length
  )
    throw new ApiError(
      "You already belong to a guild. Leave it before joining another.",
      409,
    );
  const n = await one<{ n: number }>(
    "SELECT count(*)::int n FROM guild_members WHERE guild_id=$1",
    [id],
    c,
  );
  if (n.n >= g.max_members) throw new ApiError("The guild is full.", 409);
  await c.query(
    `INSERT INTO guild_members(guild_id,user_id,role) VALUES($1,$2,'member')`,
    [id, user],
  );
  await c.query(
    "UPDATE guilds SET member_count=$2,updated_at=now() WHERE id=$1",
    [id, n.n + 1],
  );
  await notify(
    c,
    g.owner_id,
    user,
    "guild_member",
    "A hero joined your guild",
    "Welcome your new guildmate.",
    "/guilds",
    `member:${id}:${user}:${randomUUID()}`,
  );
}
export async function communityAction(user: number, a: CommunityAction) {
  return transaction(user, async (c) => {
    await throttle(c, user, "social", 120);
    switch (a.action) {
      case "post": {
        await throttle(c, user, "post", 5);
        if (a.guildId) await guildRole(c, user, a.guildId);
        const p = await one(
          `INSERT INTO community_posts(author_id,post_type,title,content,tried,guild_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [user, a.type, a.title, a.content, a.tried || null, a.guildId],
          c,
        );
        for (const tag of [...new Set(a.tags)]) {
          const t = await one(
            `INSERT INTO community_tags(slug,label) VALUES($1,$1) ON CONFLICT(slug) DO UPDATE SET slug=excluded.slug RETURNING id`,
            [tag],
            c,
          );
          await c.query(
            "INSERT INTO community_post_tags(post_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [p.id, t.id],
          );
        }
        return { id: p.id, message: "Your message is on the noticeboard." };
      }
      case "editPost":
      case "deletePost": {
        const p = await accessiblePost(c, user, a.id);
        if (p.author_id !== user)
          throw new ApiError("Only the author can edit this post.", 403);
        if (a.action === "deletePost")
          await c.query(
            `UPDATE community_posts SET deleted_at=now(),status='removed',updated_at=now() WHERE id=$1`,
            [a.id],
          );
        else
          await c.query(
            "UPDATE community_posts SET title=$2,content=$3,updated_at=now(),edited_at=now() WHERE id=$1",
            [a.id, a.title, a.content],
          );
        return {
          message:
            a.action === "deletePost" ? "Post removed." : "Post updated.",
        };
      }
      case "comment": {
        await throttle(c, user, "comment", 20);
        const p = await accessiblePost(c, user, a.postId);
        if (p.status === "closed")
          throw new ApiError("This discussion is closed.", 409);
        let depth = 1;
        let recipient = p.author_id;
        if (a.parentId) {
          const parent = await one(
            "SELECT * FROM community_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL",
            [a.parentId, a.postId],
            c,
          );
          await notBlocked(c, user, parent.author_id);
          depth = parent.depth + 1;
          if (depth > 3)
            throw new ApiError(
              "Reply to a higher-level response; threads have three levels.",
            );
          recipient = parent.author_id;
        }
        const comment = await one(
          `INSERT INTO community_comments(post_id,author_id,parent_comment_id,content,depth) VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [a.postId, user, a.parentId, a.content, depth],
          c,
        );
        await c.query(
          "UPDATE community_posts SET last_activity_at=now() WHERE id=$1",
          [a.postId],
        );
        await notify(
          c,
          recipient,
          user,
          "reply",
          "A guildmate replied",
          p.title,
          `/community?post=${a.postId}`,
          `reply:${comment.id}:${recipient}`,
        );
        if (recipient !== p.author_id)
          await notify(
            c,
            p.author_id,
            user,
            "reply",
            "Your discussion has a new reply",
            p.title,
            `/community?post=${a.postId}`,
            `reply:${comment.id}:${p.author_id}`,
          );
        return {
          id: comment.id,
          message: "Response sent. Thank you for helping.",
        };
      }
      case "editComment":
      case "deleteComment": {
        const cc = await one(
          "SELECT post_id FROM community_comments WHERE id=$1",
          [a.id],
          c,
        );
        await accessiblePost(c, user, cc.post_id);
        const cm = await one(
          "SELECT * FROM community_comments WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [a.id],
          c,
        );
        if (cm.author_id !== user)
          throw new ApiError("Only the author can edit this response.", 403);
        if (a.action === "editComment") {
          if (cm.is_solution)
            throw new ApiError(
              "Accepted solutions are preserved. Add a follow-up instead.",
              409,
            );
          await c.query(
            "UPDATE community_comments SET content=$2,updated_at=now(),edited_at=now() WHERE id=$1",
            [a.id, a.content],
          );
        } else
          await c.query(
            "UPDATE community_comments SET deleted_at=now(),updated_at=now() WHERE id=$1",
            [a.id],
          );
        return { message: "Response updated." };
      }
      case "solution": {
        const p = await accessiblePost(c, user, a.postId);
        if (p.author_id !== user && !(await canModerate(c, user, p.guild_id)))
          throw new ApiError(
            "Only the post author or an authorized moderator can accept a solution.",
            403,
          );
        if (!["help", "question"].includes(p.post_type))
          throw new ApiError("Only problems and questions can be solved.");
        if (p.solved_comment_id) {
          if (p.solved_comment_id === a.commentId)
            return { message: "This solution is already accepted." };
          throw new ApiError(
            "A solution is already accepted. Add a follow-up rather than cycling rewards.",
            409,
          );
        }
        const cm = await one(
          "SELECT * FROM community_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL FOR UPDATE",
          [a.commentId, a.postId],
          c,
        );
        await notBlocked(c, user, cm.author_id);
        if (cm.author_id === p.author_id || cm.author_id === user)
          throw new ApiError("You cannot award a solution to yourself.", 403);
        await c.query(
          `UPDATE community_posts SET is_solved=true,status='solved',solved_comment_id=$2,updated_at=now(),last_activity_at=now() WHERE id=$1`,
          [a.postId, a.commentId],
        );
        await c.query(
          "UPDATE community_comments SET is_solution=true WHERE id=$1",
          [a.commentId],
        );
        const awarded =
          (await established(c, p.author_id)) &&
          (await reputation(
            c,
            cm.author_id,
            p.author_id,
            15,
            "problem_solved",
            "comment",
            cm.id,
            `solution:${p.id}`,
          ));
        await notify(
          c,
          cm.author_id,
          user,
          "solved",
          "Your answer became a solution",
          p.title,
          `/community?post=${p.id}`,
          `solution:${p.id}`,
        );
        return {
          message: awarded
            ? "Solution accepted · +15 reputation awarded."
            : "Solution accepted. Reputation requires an established author and available daily budget.",
        };
      }
      case "react": {
        const p = await accessiblePost(c, user, a.postId);
        let recipient = p.author_id;
        let target = a.postId;
        if (a.commentId) {
          const cm = await one(
            "SELECT * FROM community_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL",
            [a.commentId, a.postId],
            c,
          );
          recipient = cm.author_id;
          target = cm.id;
        }
        if (recipient === user)
          throw new ApiError(
            "Encourage another hero rather than reacting to yourself.",
          );
        await notBlocked(c, user, recipient);
        const removed = await rows(
          `DELETE FROM community_reactions WHERE user_id=$1 AND reaction=$2 AND ${a.commentId ? "comment_id" : "post_id"}=$3 RETURNING id`,
          [user, a.reaction, target],
          c,
        );
        if (removed.length) return { message: "Reaction removed." };
        await c.query(
          `DELETE FROM community_reactions WHERE user_id=$1 AND ${a.commentId ? "comment_id" : "post_id"}=$2`,
          [user, target],
        );
        await c.query(
          "INSERT INTO community_reactions(user_id,post_id,comment_id,reaction) VALUES($1,$2,$3,$4)",
          [user, a.commentId ? null : a.postId, a.commentId, a.reaction],
        );
        if (
          a.reaction === "helpful" &&
          a.commentId &&
          p.author_id === user &&
          (await established(c, user))
        ) {
          await reputation(
            c,
            recipient,
            user,
            5,
            "helpful_answer",
            "comment",
            target,
            `helpful:${target}`,
          );
          await notify(
            c,
            recipient,
            user,
            "helpful",
            "Your answer helped a hero",
            p.title,
            `/community?post=${p.id}`,
            `helpful:${target}`,
          );
        }
        if (
          !a.commentId &&
          p.post_type === "tip" &&
          ["helpful", "learned_something"].includes(a.reaction)
        ) {
          const quorum = await one<{ n: number }>(
            `SELECT count(DISTINCT r.user_id)::int n FROM community_reactions r JOIN users u ON u.id=r.user_id WHERE r.post_id=$1 AND r.user_id<>$2 AND r.reaction IN ('helpful','learned_something') AND u.created_at<now()-interval '24 hours' AND (SELECT count(*) FROM completions WHERE user_id=u.id)>=5`,
            [p.id, recipient],
            c,
          );
          if (quorum.n >= 3)
            await reputation(
              c,
              recipient,
              user,
              3,
              "useful_tip",
              "post",
              p.id,
              `tip:${p.id}`,
            );
        }
        return { message: "Encouragement sent." };
      }
      case "save": {
        await accessiblePost(c, user, a.postId);
        const old = await rows(
          "DELETE FROM community_saved_posts WHERE user_id=$1 AND post_id=$2 RETURNING post_id",
          [user, a.postId],
          c,
        );
        if (!old.length)
          await c.query(
            "INSERT INTO community_saved_posts(user_id,post_id) VALUES($1,$2)",
            [user, a.postId],
          );
        return {
          message: old.length
            ? "Removed from your saved scrolls."
            : "Saved for later.",
        };
      }
      case "createGuild": {
        await throttle(c, user, "guild-create", 1);
        if (
          (
            await rows(
              "SELECT 1 FROM guild_members WHERE user_id=$1",
              [user],
              c,
            )
          ).length
        )
          throw new ApiError("Leave your current guild first.", 409);
        const g = await one(
          `INSERT INTO guilds(name,slug,description,owner_id,visibility,join_policy) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            a.name,
            a.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 45) +
              "-" +
              randomUUID().slice(0, 8),
            a.description,
            user,
            a.visibility,
            a.visibility === "public" ? "open" : "request",
          ],
          c,
        );
        await c.query(
          `INSERT INTO guild_members(guild_id,user_id,role) VALUES($1,$2,'owner')`,
          [g.id, user],
        );
        return { id: g.id, message: "Your guild has a home." };
      }
      case "joinGuild": {
        await joinGuild(c, user, a.id);
        return { message: "Welcome to your guild." };
      }
      case "leaveGuild": {
        const g = await guildRole(c, user, a.id);
        if (g.role === "owner")
          throw new ApiError(
            "Transfer ownership to a guildmate before leaving.",
            409,
          );
        await c.query(
          "DELETE FROM guild_members WHERE guild_id=$1 AND user_id=$2",
          [a.id, user],
        );
        await c.query(
          "UPDATE guilds SET member_count=(SELECT count(*) FROM guild_members WHERE guild_id=$1) WHERE id=$1",
          [a.id],
        );
        return {
          message:
            "You left the guild. Your contributions remain in its history.",
        };
      }
      case "invite": {
        await throttle(c, user, "invite", 10);
        await guildRole(c, user, a.guildId, ["owner", "moderator"]);
        await notBlocked(c, user, a.userId);
        if (user === a.userId) throw new ApiError("Choose another hero.");
        await one("SELECT id FROM users WHERE id=$1", [a.userId], c);
        if (
          (
            await rows(
              `SELECT 1 FROM guild_invites WHERE guild_id=$1 AND invitee_id=$2 AND status='pending'`,
              [a.guildId, a.userId],
              c,
            )
          ).length
        )
          throw new ApiError(
            "This hero already has a pending invitation.",
            409,
          );
        const i = await one(
          `INSERT INTO guild_invites(guild_id,inviter_id,invitee_id,role) VALUES($1,$2,$3,'member') RETURNING id`,
          [a.guildId, user, a.userId],
          c,
        );
        await notify(
          c,
          a.userId,
          user,
          "guild_invite",
          "An invitation to adventure",
          "A guild has invited you to join.",
          "/community?inbox=true",
          `invite:${i.id}`,
        );
        return { message: "Invitation delivered." };
      }
      case "respondInvite": {
        const i = await one(
          `SELECT * FROM guild_invites WHERE id=$1 AND invitee_id=$2 AND status='pending' FOR UPDATE`,
          [a.id, user],
          c,
        );
        if (a.accept) {
          await notBlocked(c, user, i.inviter_id);
          await joinGuild(c, user, i.guild_id, true);
        }
        await c.query(
          "UPDATE guild_invites SET status=$2,responded_at=now() WHERE id=$1",
          [a.id, a.accept ? "accepted" : "declined"],
        );
        return {
          message: a.accept ? "Invitation accepted." : "Invitation declined.",
        };
      }
      case "role": {
        await guildRole(c, user, a.guildId, ["owner"]);
        if (a.userId === user)
          throw new ApiError("Change another member’s role.");
        await one(
          "SELECT id FROM guild_members WHERE guild_id=$1 AND user_id=$2",
          [a.guildId, a.userId],
          c,
        );
        if (a.role === "owner") {
          await c.query(
            `UPDATE guild_members SET role='moderator' WHERE guild_id=$1 AND user_id=$2`,
            [a.guildId, user],
          );
          await c.query("UPDATE guilds SET owner_id=$2 WHERE id=$1", [
            a.guildId,
            a.userId,
          ]);
        }
        await c.query(
          "UPDATE guild_members SET role=$3 WHERE guild_id=$1 AND user_id=$2",
          [a.guildId, a.userId, a.role],
        );
        return { message: "Guild role updated." };
      }
      case "createGuildQuest": {
        await guildRole(c, user, a.guildId, ["owner", "moderator"]);
        if (
          (
            await rows(
              `SELECT 1 FROM guild_quests WHERE guild_id=$1 AND created_at>now()-interval '7 days'`,
              [a.guildId],
              c,
            )
          ).length
        )
          throw new ApiError(
            "One shared quest per seven days keeps rewards meaningful.",
            409,
          );
        const q = await one(
          `INSERT INTO guild_quests(guild_id,created_by,title,description,attribute,target,reward_xp,reward_gold,reward_reputation,ends_at) VALUES($1,$2,$3,$4,$5,$6,500,50,5,now()+$7*interval '1 day') RETURNING id`,
          [
            a.guildId,
            user,
            a.title,
            a.description,
            a.attribute,
            a.target,
            a.days,
          ],
          c,
        );
        return {
          id: q.id,
          message: "A new shared quest is ready for volunteers.",
        };
      }
      case "joinQuest": {
        const q = await one(
          "SELECT * FROM guild_quests WHERE id=$1",
          [a.id],
          c,
        );
        await guildRole(c, user, q.guild_id);
        if (
          q.status !== "active" ||
          (q.ends_at && new Date(q.ends_at) <= new Date())
        )
          throw new ApiError(
            "This quest is no longer accepting participants.",
            409,
          );
        await c.query(
          "INSERT INTO guild_quest_participants(guild_quest_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [a.id, user],
        );
        return {
          message:
            "Enrolled. Your next matching real-life quest contributes automatically.",
        };
      }
      case "joinChallenge": {
        const ch = await one(
          `SELECT * FROM community_challenges WHERE id=$1 AND status='active' AND ends_at>now()`,
          [a.id],
          c,
        );
        await c.query(
          "INSERT INTO community_challenge_participants(challenge_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [ch.id, user],
        );
        return {
          message:
            "Challenge joined. Future completed quests count automatically.",
        };
      }
      case "claimQuest":
      case "claimChallenge": {
        const guild = a.action === "claimQuest";
        // Same user-first lock order as existing quest/boss completion code.
        const hero = await one(
          "SELECT * FROM users WHERE id=$1 FOR UPDATE",
          [user],
          c,
        );
        const q = await one(
          `SELECT q.*,p.id participant_id,p.reward_claimed,p.${guild ? "contributions" : "contribution"} contribution FROM ${guild ? "guild_quests" : "community_challenges"} q JOIN ${guild ? "guild_quest_participants" : "community_challenge_participants"} p ON p.${guild ? "guild_quest_id" : "challenge_id"}=q.id AND p.user_id=$2 WHERE q.id=$1 FOR UPDATE OF p`,
          [a.id, user],
          c,
        );
        if (guild) await guildRole(c, user, q.guild_id);
        if (q.status !== "completed" || q.contribution < 1)
          throw new ApiError(
            "Contribute to a completed quest before claiming its reward.",
            409,
          );
        if (q.reward_claimed)
          return { message: "This reward was already claimed." };
        // Existing stored rewards are respected but bounded by the current server policy.
        const gold = Math.min(50, q.reward_gold);
        const xp = guild ? 0 : Math.min(100, q.reward_xp);
        const before = levelFromXp(hero.xp);
        const after = levelFromXp(hero.xp + xp);
        const bonus =
          after.level > before.level ? LEVEL_UP_GOLD * after.level : 0;
        await c.query("UPDATE users SET gold=gold+$2,xp=xp+$3 WHERE id=$1", [
          user,
          gold + bonus,
          xp,
        ]);
        await c.query(
          `UPDATE ${guild ? "guild_quest_participants" : "community_challenge_participants"} SET reward_claimed=true WHERE id=$1`,
          [q.participant_id],
        );
        const reason = guild ? "guild_contribution" : "challenge_contribution";
        // System rewards have no actor; dedupe is per enrolled contributor and source.
        await c.query("SELECT pg_advisory_xact_lock(71343,$1)", [user]);
        await c.query(
          `INSERT INTO community_reputation_transactions(user_id,delta,reason,ref_type,ref_id,dedupe_key) SELECT $1,$2,$3,$4,$5,$6 WHERE $2::int>0 AND (SELECT coalesce(sum(greatest(delta,0)),0) FROM community_reputation_transactions WHERE user_id=$1 AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')+$2<=50 ON CONFLICT DO NOTHING`,
          [
            user,
            Math.min(5, q.reward_reputation),
            reason,
            guild ? "guild_quest" : "challenge",
            a.id,
            `${reason}:${a.id}:${user}`,
          ],
        );
        return {
          message: `Reward claimed · +${gold + bonus} gold${xp ? ` · +${xp} XP` : ""}. Your character sheet is up to date.`,
        };
      }
      case "createChallenge": {
        if (!isModerator(user))
          throw new ApiError(
            "Only community moderators can create global challenges.",
            403,
          );
        await throttle(c, user, "challenge-create", 2);
        const q = await one(
          `INSERT INTO community_challenges(title,slug,description,metric,target,reward_xp,reward_gold,reward_reputation,ends_at,created_by) VALUES($1,$2,$3,$4,$5,100,50,5,now()+$6*interval '1 day',$7) RETURNING id`,
          [
            a.title,
            "challenge-" + randomUUID(),
            a.description,
            a.metric,
            a.target,
            a.days,
            user,
          ],
          c,
        );
        return { id: q.id, message: "A community challenge is live." };
      }
      case "report": {
        await throttle(c, user, "report", 5);
        await accessiblePost(c, user, a.postId);
        if (a.commentId)
          await one(
            "SELECT id FROM community_comments WHERE id=$1 AND post_id=$2",
            [a.commentId, a.postId],
            c,
          );
        await c.query(
          "INSERT INTO community_reports(reporter_id,post_id,comment_id,reason,details) VALUES($1,$2,$3,$4,$5)",
          [user, a.postId, a.commentId, a.reason, a.details],
        );
        return { message: "Private report sent to the moderation team." };
      }
      case "resolveReport": {
        if (!isModerator(user))
          throw new ApiError("Moderator access required.", 403);
        const r = await one(
          "SELECT * FROM community_reports WHERE id=$1 FOR UPDATE",
          [a.id],
          c,
        );
        if (a.remove) {
          if (r.comment_id)
            await c.query(
              "UPDATE community_comments SET deleted_at=now() WHERE id=$1",
              [r.comment_id],
            );
          else if (r.post_id)
            await c.query(
              `UPDATE community_posts SET status='removed',deleted_at=now() WHERE id=$1`,
              [r.post_id],
            );
        }
        await c.query(
          `UPDATE community_reports SET status=$2,resolved_by=$3,resolved_at=now() WHERE id=$1`,
          [a.id, a.remove ? "resolved" : "dismissed", user],
        );
        return { message: "Report reviewed." };
      }
      case "block": {
        if (a.userId === user) throw new ApiError("You cannot block yourself.");
        if (a.blocked)
          await c.query(
            "INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [user, a.userId],
          );
        else
          await c.query(
            "DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2",
            [user, a.userId],
          );
        return {
          message: a.blocked
            ? "Hero blocked. Their posts and replies are hidden."
            : "Hero unblocked.",
        };
      }
      case "readNotice": {
        await c.query(
          "UPDATE notifications SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND ($2::int IS NULL OR id=$2)",
          [user, a.id ?? null],
        );
        return { message: "Notifications marked as read." };
      }
      case "visibility": {
        await c.query(
          "UPDATE users SET leaderboard_visible=$2,leaderboard_opt_out=NOT $2 WHERE id=$1",
          [user, a.visible],
        );
        return {
          message: a.visible
            ? "You are visible on ranking boards."
            : "You are hidden from ranking boards. Your progress still matters.",
        };
      }
    }
  });
}
