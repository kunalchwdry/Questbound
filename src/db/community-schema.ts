// Social tables already present in Supabase, captured without altering data.
// SQL migrations also own policies, functions, triggers and grants. Never use db:push on production.
import {
  pgTable,
  type PgTableExtraConfigValue,
  index,
  foreignKey,
  check,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  unique,
  primaryKey,
  pgView,
  pgEnum,
  pgPolicy,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users, attributeEnum as attribute } from "./schema";
export const challengeMetric = pgEnum("challenge_metric", [
  "sessions",
  "streak_days",
  "xp",
  "members",
]);

export const challengeStatus = pgEnum("challenge_status", [
  "draft",
  "active",
  "completed",
  "expired",
]);

export const communityPostStatus = pgEnum("community_post_status", [
  "open",
  "solved",
  "closed",
  "archived",
  "removed",
]);

export const communityPostType = pgEnum("community_post_type", [
  "help",
  "question",
  "discussion",
  "achievement",
  "tip",
  "goal",
  "challenge",
]);

export const communityReactionKind = pgEnum("community_reaction_kind", [
  "helpful",
  "motivating",
  "encouragement",
  "learned_something",
  "relatable",
]);

export const guildInviteStatus = pgEnum("guild_invite_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
]);

export const guildQuestStatus = pgEnum("guild_quest_status", [
  "active",
  "completed",
  "expired",
  "cancelled",
]);

export const guildRole = pgEnum("guild_role", ["owner", "moderator", "member"]);

export const guildVisibility = pgEnum("guild_visibility", [
  "public",
  "invite_only",
]);

export const notificationKind = pgEnum("notification_kind", [
  "reply",
  "helpful",
  "solved",
  "reputation",
  "leaderboard",
  "guild_quest",
  "guild_member",
  "guild_invite",
  "challenge",
  "achievement",
  "moderation",
]);

export const reportStatus = pgEnum("report_status", [
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);

export const reputationReason = pgEnum("reputation_reason", [
  "helpful_answer",
  "problem_solved",
  "useful_tip",
  "guild_contribution",
  "challenge_contribution",
  "moderator_contribution",
]);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: serial().primaryKey().notNull(),
    authorId: integer("author_id").notNull(),
    postType: communityPostType("post_type").default("discussion").notNull(),
    title: varchar({ length: 160 }).notNull(),
    content: text().notNull(),
    category: varchar({ length: 40 }),
    status: communityPostStatus().default("open").notNull(),
    isSolved: boolean("is_solved").default(false).notNull(),
    blockedOn: text("blocked_on"),
    tried: text(),
    guildId: integer("guild_id"),
    isPinned: boolean("is_pinned").default(false).notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    reactionCount: integer("reaction_count").default(0).notNull(),
    saveCount: integer("save_count").default(0).notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    solvedCommentId: integer("solved_comment_id"),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_posts_author_time_idx").on(
      table.authorId,
      table.createdAt.desc(),
    ),
    index("community_posts_activity_idx")
      .using("btree", table.lastActivityAt.desc().nullsFirst())
      .where(sql`(deleted_at IS NULL)`),
    index("community_posts_author_idx").using(
      "btree",
      table.authorId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("community_posts_created_idx")
      .using("btree", table.createdAt.desc().nullsFirst())
      .where(sql`(deleted_at IS NULL)`),
    index("community_posts_guild_idx")
      .using(
        "btree",
        table.guildId.asc().nullsLast(),
        table.createdAt.desc().nullsFirst(),
      )
      .where(sql`(guild_id IS NOT NULL)`),
    index("community_posts_search_idx").using(
      "gin",
      sql`to_tsvector('english'::regconfig, (((title)::text || ' '::text)`,
    ),
    index("community_posts_solved_comment_idx")
      .using("btree", table.solvedCommentId.asc().nullsLast())
      .where(sql`(solved_comment_id IS NOT NULL)`),
    index("community_posts_type_idx")
      .using(
        "btree",
        table.postType.asc().nullsLast(),
        table.createdAt.desc().nullsFirst(),
      )
      .where(sql`(deleted_at IS NULL)`),
    index("community_posts_unsolved_idx")
      .using("btree", table.createdAt.desc().nullsFirst())
      .where(
        sql`((deleted_at IS NULL) AND (is_solved = false) AND (status = 'open'::community_post_status) AND (post_type = ANY (ARRAY['help'::community_post_type, 'question'::community_post_type])))`,
      ),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: "community_posts_author_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.solvedCommentId],
      foreignColumns: [communityComments.id],
      name: "community_posts_solved_comment_fk",
    }).onDelete("set null"),
    check(
      "community_posts_body_len",
      sql`(char_length(content) >= 1) AND (char_length(content) <= 20000)`,
    ),
    check(
      "community_posts_counts_ok",
      sql`(comment_count >= 0) AND (reaction_count >= 0) AND (save_count >= 0) AND (view_count >= 0) AND (helpful_count >= 0)`,
    ),
    check(
      "community_posts_solved_kind",
      sql`(NOT is_solved) OR (post_type = ANY (ARRAY['help'::community_post_type, 'question'::community_post_type]))`,
    ),
    check(
      "community_posts_title_len",
      sql`(char_length((title)::text) >= 4) AND (char_length((title)::text) <= 160)`,
    ),
  ],
).enableRLS();

export const communityComments = pgTable(
  "community_comments",
  {
    id: serial().primaryKey().notNull(),
    postId: integer("post_id").notNull(),
    authorId: integer("author_id").notNull(),
    parentCommentId: integer("parent_comment_id"),
    content: text().notNull(),
    isSolution: boolean("is_solution").default(false).notNull(),
    depth: integer().default(1).notNull(),
    helpfulCount: integer("helpful_count").default(0).notNull(),
    reactionCount: integer("reaction_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_comments_author_time_idx").on(
      table.authorId,
      table.createdAt.desc(),
    ),
    index("community_comments_author_idx").using(
      "btree",
      table.authorId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("community_comments_parent_idx").using(
      "btree",
      table.parentCommentId.asc().nullsLast(),
    ),
    index("community_comments_post_idx")
      .using(
        "btree",
        table.postId.asc().nullsLast(),
        table.createdAt.asc().nullsLast(),
      )
      .where(sql`(deleted_at IS NULL)`),
    index("community_comments_solution_idx")
      .using("btree", table.authorId.asc().nullsLast())
      .where(sql`(is_solution = true)`),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: "community_comments_author_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
      name: "community_comments_parent_comment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.postId],
      foreignColumns: [communityPosts.id],
      name: "community_comments_post_id_fkey",
    }).onDelete("cascade"),
    check(
      "community_comments_body_len",
      sql`(char_length(content) >= 1) AND (char_length(content) <= 8000)`,
    ),
    check(
      "community_comments_counts_ok",
      sql`(helpful_count >= 0) AND (reaction_count >= 0)`,
    ),
    check("community_comments_depth_ok", sql`(depth >= 1) AND (depth <= 3)`),
  ],
).enableRLS();

export const communityReactions = pgTable(
  "community_reactions",
  {
    id: serial().primaryKey().notNull(),
    postId: integer("post_id"),
    commentId: integer("comment_id"),
    userId: integer("user_id").notNull(),
    reaction: communityReactionKind().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_reactions_comment_idx").using(
      "btree",
      table.commentId.asc().nullsLast(),
    ),
    index("community_reactions_post_idx").using(
      "btree",
      table.postId.asc().nullsLast(),
    ),
    uniqueIndex("community_reactions_user_comment_idx")
      .using(
        "btree",
        table.userId.asc().nullsLast(),
        table.commentId.asc().nullsLast(),
      )
      .where(sql`(comment_id IS NOT NULL)`),
    uniqueIndex("community_reactions_user_post_idx")
      .using(
        "btree",
        table.userId.asc().nullsLast(),
        table.postId.asc().nullsLast(),
      )
      .where(sql`(post_id IS NOT NULL)`),
    foreignKey({
      columns: [table.commentId],
      foreignColumns: [communityComments.id],
      name: "community_reactions_comment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.postId],
      foreignColumns: [communityPosts.id],
      name: "community_reactions_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "community_reactions_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "community_reactions_one_target",
      sql`((post_id IS NOT NULL) AND (comment_id IS NULL)) OR ((post_id IS NULL) AND (comment_id IS NOT NULL))`,
    ),
  ],
).enableRLS();

export const communityTags = pgTable(
  "community_tags",
  {
    id: serial().primaryKey().notNull(),
    slug: varchar({ length: 40 }).notNull(),
    label: varchar({ length: 40 }).notNull(),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("community_tags_slug_idx").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),
    index("community_tags_usage_idx").using(
      "btree",
      table.usageCount.desc().nullsFirst(),
    ),
    unique("community_tags_slug_unique").on(table.slug),
    check("community_tags_usage_nonneg", sql`usage_count >= 0`),
  ],
).enableRLS();

export const guilds = pgTable(
  "guilds",
  {
    id: serial().primaryKey().notNull(),
    slug: varchar({ length: 48 }).notNull(),
    name: varchar({ length: 60 }).notNull(),
    motto: varchar({ length: 140 }),
    description: text(),
    emblem: varchar({ length: 16 }).default("🛡️").notNull(),
    accent: varchar({ length: 20 }).default("gold").notNull(),
    ownerId: integer("owner_id").notNull(),
    visibility: guildVisibility().default("public").notNull(),
    joinPolicy: varchar("join_policy", { length: 16 })
      .default("open")
      .notNull(),
    xp: integer().default(0).notNull(),
    weeklyXp: integer("weekly_xp").default(0).notNull(),
    level: integer().default(1).notNull(),
    memberCount: integer("member_count").default(1).notNull(),
    maxMembers: integer("max_members").default(100).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("guilds_name_lower_idx").using(
      "btree",
      sql`lower((name)::text)`,
    ),
    uniqueIndex("guilds_slug_idx").using("btree", table.slug.asc().nullsLast()),
    index("guilds_weekly_xp_idx").using(
      "btree",
      table.weeklyXp.desc().nullsFirst(),
    ),
    index("guilds_xp_idx").using("btree", table.xp.desc().nullsFirst()),
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [users.id],
      name: "guilds_owner_id_fkey",
    }).onDelete("cascade"),
    check(
      "guilds_counters_ok",
      sql`(xp >= 0) AND (weekly_xp >= 0) AND (member_count >= 0) AND (max_members >= 1)`,
    ),
    check(
      "guilds_join_policy_check",
      sql`(join_policy)::text = ANY ((ARRAY['open'::character varying, 'request'::character varying])::text[])`,
    ),
    check(
      "guilds_name_len",
      sql`(char_length((name)::text) >= 3) AND (char_length((name)::text) <= 60)`,
    ),
  ],
).enableRLS();

export const guildMembers = pgTable(
  "guild_members",
  {
    id: serial().primaryKey().notNull(),
    guildId: integer("guild_id").notNull(),
    userId: integer("user_id").notNull(),
    role: guildRole().default("member").notNull(),
    contributionXp: integer("contribution_xp").default(0).notNull(),
    weeklyXp: integer("weekly_xp").default(0).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("guild_members_guild_role_idx").using(
      "btree",
      table.guildId.asc().nullsLast(),
      table.role.asc().nullsLast(),
    ),
    uniqueIndex("guild_members_guild_user_idx").using(
      "btree",
      table.guildId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
    index("guild_members_roster_idx").using(
      "btree",
      table.guildId.asc().nullsLast(),
      table.contributionXp.desc().nullsFirst(),
    ),
    uniqueIndex("guild_members_user_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.guildId],
      foreignColumns: [guilds.id],
      name: "guild_members_guild_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "guild_members_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "guild_members_contribution_ok",
      sql`(contribution_xp >= 0) AND (weekly_xp >= 0)`,
    ),
  ],
).enableRLS();

export const guildInvites = pgTable(
  "guild_invites",
  {
    id: serial().primaryKey().notNull(),
    guildId: integer("guild_id").notNull(),
    inviterId: integer("inviter_id").notNull(),
    inviteeId: integer("invitee_id").notNull(),
    role: guildRole().default("member").notNull(),
    status: guildInviteStatus().default("pending").notNull(),
    message: varchar({ length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table): PgTableExtraConfigValue[] => [
    index("guild_invites_invitee_idx").using(
      "btree",
      table.inviteeId.asc().nullsLast(),
      table.status.asc().nullsLast(),
    ),
    uniqueIndex("guild_invites_pending_idx")
      .using(
        "btree",
        table.guildId.asc().nullsLast(),
        table.inviteeId.asc().nullsLast(),
      )
      .where(sql`(status = 'pending'::guild_invite_status)`),
    foreignKey({
      columns: [table.guildId],
      foreignColumns: [guilds.id],
      name: "guild_invites_guild_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.inviteeId],
      foreignColumns: [users.id],
      name: "guild_invites_invitee_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.inviterId],
      foreignColumns: [users.id],
      name: "guild_invites_inviter_id_fkey",
    }).onDelete("cascade"),
    check("guild_invites_no_self", sql`inviter_id <> invitee_id`),
  ],
).enableRLS();

export const guildQuests = pgTable(
  "guild_quests",
  {
    id: serial().primaryKey().notNull(),
    guildId: integer("guild_id").notNull(),
    createdBy: integer("created_by").notNull(),
    title: varchar({ length: 120 }).notNull(),
    description: text(),
    icon: varchar({ length: 16 }).default("⚔️").notNull(),
    attribute: attribute(),
    target: integer().notNull(),
    progress: integer().default(0).notNull(),
    rewardXp: integer("reward_xp").default(0).notNull(),
    rewardGold: integer("reward_gold").default(0).notNull(),
    rewardReputation: integer("reward_reputation").default(0).notNull(),
    status: guildQuestStatus().default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("guild_quests_active_idx")
      .using(
        "btree",
        table.status.asc().nullsLast(),
        table.endsAt.asc().nullsLast(),
      )
      .where(sql`(status = 'active'::guild_quest_status)`),
    index("guild_quests_guild_status_idx").using(
      "btree",
      table.guildId.asc().nullsLast(),
      table.status.asc().nullsLast(),
      table.endsAt.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "guild_quests_created_by_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.guildId],
      foreignColumns: [guilds.id],
      name: "guild_quests_guild_id_fkey",
    }).onDelete("cascade"),
    check(
      "guild_quests_progress_ok",
      sql`(progress >= 0) AND (progress <= target)`,
    ),
    check("guild_quests_reward_gold_check", sql`reward_gold >= 0`),
    check("guild_quests_reward_reputation_check", sql`reward_reputation >= 0`),
    check("guild_quests_reward_xp_check", sql`reward_xp >= 0`),
    check(
      "guild_quests_target_check",
      sql`(target >= 1) AND (target <= 1000000)`,
    ),
    check(
      "guild_quests_title_len",
      sql`(char_length((title)::text) >= 3) AND (char_length((title)::text) <= 120)`,
    ),
  ],
).enableRLS();

export const guildQuestParticipants = pgTable(
  "guild_quest_participants",
  {
    id: serial().primaryKey().notNull(),
    guildQuestId: integer("guild_quest_id").notNull(),
    userId: integer("user_id").notNull(),
    contributions: integer().default(0).notNull(),
    guildXpAwarded: integer("guild_xp_awarded").default(0).notNull(),
    personalXpAwarded: integer("personal_xp_awarded").default(0).notNull(),
    rewardClaimed: boolean("reward_claimed").default(false).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("guild_quest_participants_board_idx").using(
      "btree",
      table.guildQuestId.asc().nullsLast(),
      table.contributions.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.guildQuestId],
      foreignColumns: [guildQuests.id],
      name: "guild_quest_participants_guild_quest_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "guild_quest_participants_user_id_fkey",
    }).onDelete("cascade"),
    unique("guild_quest_participants_guild_quest_id_user_id_key").on(
      table.guildQuestId,
      table.userId,
    ),
    check(
      "guild_quest_participants_contributions_check",
      sql`contributions >= 0`,
    ),
  ],
).enableRLS();

export const communityChallenges = pgTable(
  "community_challenges",
  {
    id: serial().primaryKey().notNull(),
    slug: varchar({ length: 64 }).notNull(),
    title: varchar({ length: 120 }).notNull(),
    description: text(),
    icon: varchar({ length: 16 }).default("🏆").notNull(),
    metric: challengeMetric().default("sessions").notNull(),
    target: integer().notNull(),
    progress: integer().default(0).notNull(),
    rewardXp: integer("reward_xp").default(0).notNull(),
    rewardGold: integer("reward_gold").default(0).notNull(),
    rewardReputation: integer("reward_reputation").default(0).notNull(),
    status: challengeStatus().default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_challenges_active_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.endsAt.asc().nullsLast(),
    ),
    uniqueIndex("community_challenges_slug_idx").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "community_challenges_created_by_fkey",
    }).onDelete("set null"),
    check("community_challenges_progress_check", sql`progress >= 0`),
    check("community_challenges_reward_gold_check", sql`reward_gold >= 0`),
    check(
      "community_challenges_reward_reputation_check",
      sql`reward_reputation >= 0`,
    ),
    check("community_challenges_reward_xp_check", sql`reward_xp >= 0`),
    check(
      "community_challenges_target_check",
      sql`(target >= 1) AND (target <= 100000000)`,
    ),
    check(
      "community_challenges_title_len",
      sql`(char_length((title)::text) >= 3) AND (char_length((title)::text) <= 120)`,
    ),
    check("community_challenges_window", sql`ends_at > starts_at`),
  ],
).enableRLS();

export const communityChallengeParticipants = pgTable(
  "community_challenge_participants",
  {
    id: serial().primaryKey().notNull(),
    challengeId: integer("challenge_id").notNull(),
    userId: integer("user_id").notNull(),
    contribution: integer().default(0).notNull(),
    rewardClaimed: boolean("reward_claimed").default(false).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_challenge_participants_idx").using(
      "btree",
      table.challengeId.asc().nullsLast(),
      table.contribution.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.challengeId],
      foreignColumns: [communityChallenges.id],
      name: "community_challenge_participants_challenge_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "community_challenge_participants_user_id_fkey",
    }).onDelete("cascade"),
    unique("community_challenge_participants_challenge_id_user_id_key").on(
      table.challengeId,
      table.userId,
    ),
    check(
      "community_challenge_participants_contribution_check",
      sql`contribution >= 0`,
    ),
  ],
).enableRLS();

export const communityReputationTransactions = pgTable(
  "community_reputation_transactions",
  {
    id: serial().primaryKey().notNull(),
    userId: integer("user_id").notNull(),
    delta: integer().notNull(),
    reason: reputationReason().notNull(),
    refType: varchar("ref_type", { length: 24 }),
    refId: integer("ref_id"),
    actorId: integer("actor_id"),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_reputation_reason_day_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.reason.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("community_reputation_user_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: "community_reputation_transactions_actor_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "community_reputation_transactions_user_id_fkey",
    }).onDelete("cascade"),
    unique("community_reputation_dedupe_unique").on(table.dedupeKey),
    check("community_reputation_transactions_delta_check", sql`delta <> 0`),
  ],
).enableRLS();

export const communityReports = pgTable(
  "community_reports",
  {
    id: serial().primaryKey().notNull(),
    reporterId: integer("reporter_id").notNull(),
    postId: integer("post_id"),
    commentId: integer("comment_id"),
    targetUserId: integer("target_user_id"),
    reason: varchar({ length: 40 }).notNull(),
    details: text(),
    status: reportStatus().default("open").notNull(),
    resolvedBy: integer("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex("community_reports_dedupe_idx")
      .using(
        "btree",
        sql`reporter_id`,
        sql`COALESCE(post_id, 0)`,
        sql`COALESCE(comment_id, 0)`,
        sql`COALESCE(target_user_id, 0)`,
      )
      .where(
        sql`(status = ANY (ARRAY['open'::report_status, 'reviewing'::report_status]))`,
      ),
    index("community_reports_open_idx").using(
      "btree",
      table.status.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.commentId],
      foreignColumns: [communityComments.id],
      name: "community_reports_comment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.postId],
      foreignColumns: [communityPosts.id],
      name: "community_reports_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.reporterId],
      foreignColumns: [users.id],
      name: "community_reports_reporter_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.resolvedBy],
      foreignColumns: [users.id],
      name: "community_reports_resolved_by_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.targetUserId],
      foreignColumns: [users.id],
      name: "community_reports_target_user_id_fkey",
    }).onDelete("set null"),
    check(
      "community_reports_one_target",
      sql`((((post_id IS NOT NULL))::integer + ((comment_id IS NOT NULL))::integer) + ((target_user_id IS NOT NULL))::integer) = 1`,
    ),
  ],
).enableRLS();

export const notifications = pgTable(
  "notifications",
  {
    id: serial().primaryKey().notNull(),
    userId: integer("user_id").notNull(),
    kind: notificationKind().notNull(),
    title: varchar({ length: 160 }).notNull(),
    body: varchar({ length: 400 }),
    href: varchar({ length: 200 }),
    actorId: integer("actor_id"),
    refType: varchar("ref_type", { length: 24 }),
    refId: integer("ref_id"),
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    pgPolicy("questbound_own_notifications", {
      for: "select",
      to: "authenticated",
      using: sql`user_id=(SELECT public.questbound_user_id())`,
    }),
    uniqueIndex("notifications_dedupe_idx").using(
      "btree",
      table.dedupeKey.asc().nullsLast(),
    ),
    index("notifications_inbox_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    index("notifications_unread_idx")
      .using("btree", table.userId.asc().nullsLast())
      .where(sql`(read_at IS NULL)`),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: "notifications_actor_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "notifications_user_id_fkey",
    }).onDelete("cascade"),
  ],
).enableRLS();

export const leaderboardRankSnapshots = pgTable(
  "leaderboard_rank_snapshots",
  {
    id: serial().primaryKey().notNull(),
    category: varchar({ length: 32 }).notNull(),
    userId: integer("user_id").notNull(),
    rank: integer().notNull(),
    metricValue: integer("metric_value").default(0).notNull(),
    capturedOn: varchar("captured_on", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("leaderboard_rank_snapshots_lookup_idx").using(
      "btree",
      table.category.asc().nullsLast(),
      table.capturedOn.asc().nullsLast(),
    ),
    uniqueIndex("leaderboard_rank_snapshots_unique").using(
      "btree",
      table.category.asc().nullsLast(),
      table.userId.asc().nullsLast(),
      table.capturedOn.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "leaderboard_rank_snapshots_user_id_users_id_fk",
    }).onDelete("cascade"),
  ],
).enableRLS();

export const communityChallengeContributions = pgTable(
  "community_challenge_contributions",
  {
    id: serial().primaryKey().notNull(),
    challengeId: integer("challenge_id").notNull(),
    userId: integer("user_id").notNull(),
    sourceCompletionId: integer("source_completion_id").notNull(),
    metricDelta: integer("metric_delta").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("challenge_contributions_board_idx").using(
      "btree",
      table.challengeId.asc().nullsLast(),
      table.userId.asc().nullsLast(),
    ),
    uniqueIndex("challenge_contributions_unique").using(
      "btree",
      table.challengeId.asc().nullsLast(),
      table.sourceCompletionId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.challengeId],
      foreignColumns: [communityChallenges.id],
      name: "community_challenge_contributions_challenge_id_community_challe",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "community_challenge_contributions_user_id_users_id_fk",
    }).onDelete("cascade"),
  ],
).enableRLS();

export const guildQuestContributions = pgTable(
  "guild_quest_contributions",
  {
    id: serial().primaryKey().notNull(),
    guildQuestId: integer("guild_quest_id").notNull(),
    userId: integer("user_id").notNull(),
    sourceCompletionId: integer("source_completion_id").notNull(),
    units: integer().default(1).notNull(),
    guildXpAwarded: integer("guild_xp_awarded").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("guild_quest_contributions_quest_idx").using(
      "btree",
      table.guildQuestId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
    ),
    uniqueIndex("guild_quest_contributions_source_unique").using(
      "btree",
      table.sourceCompletionId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.guildQuestId],
      foreignColumns: [guildQuests.id],
      name: "guild_quest_contributions_guild_quest_id_guild_quests_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "guild_quest_contributions_user_id_users_id_fk",
    }).onDelete("cascade"),
  ],
).enableRLS();

export const communityPostTags = pgTable(
  "community_post_tags",
  {
    postId: integer("post_id").notNull(),
    tagId: integer("tag_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_post_tags_tag_idx").using(
      "btree",
      table.tagId.asc().nullsLast(),
      table.postId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.postId],
      foreignColumns: [communityPosts.id],
      name: "community_post_tags_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.tagId],
      foreignColumns: [communityTags.id],
      name: "community_post_tags_tag_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.postId, table.tagId],
      name: "community_post_tags_pkey",
    }),
  ],
).enableRLS();

export const communitySavedPosts = pgTable(
  "community_saved_posts",
  {
    userId: integer("user_id").notNull(),
    postId: integer("post_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("community_saved_posts_user_idx").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
    ),
    foreignKey({
      columns: [table.postId],
      foreignColumns: [communityPosts.id],
      name: "community_saved_posts_post_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "community_saved_posts_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.userId, table.postId],
      name: "community_saved_posts_pkey",
    }),
  ],
).enableRLS();

export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: integer("blocker_id").notNull(),
    blockedId: integer("blocked_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table): PgTableExtraConfigValue[] => [
    index("user_blocks_blocked_idx").using(
      "btree",
      table.blockedId.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.blockedId],
      foreignColumns: [users.id],
      name: "user_blocks_blocked_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.blockerId],
      foreignColumns: [users.id],
      name: "user_blocks_blocker_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.blockerId, table.blockedId],
      name: "user_blocks_pkey",
    }),
    check("user_blocks_no_self", sql`blocker_id <> blocked_id`),
  ],
).enableRLS();

export const communityStats = pgView("community_stats", {
  userId: integer("user_id"),
  reputation: integer(),
  helpfulAnswers: integer("helpful_answers"),
  solvedProblems: integer("solved_problems"),
  postsAuthored: integer("posts_authored"),
  commentsAuthored: integer("comments_authored"),
  tipsAuthored: integer("tips_authored"),
}).as(
  sql`SELECT u.id AS user_id, COALESCE(rep.reputation, 0) AS reputation, COALESCE(ans.helpful_answers, 0) AS helpful_answers, COALESCE(sol.solved_problems, 0) AS solved_problems, COALESCE(pos.posts_authored, 0) AS posts_authored, COALESCE(cmt.comments_authored, 0) AS comments_authored, COALESCE(tip.tips_authored, 0) AS tips_authored FROM users u LEFT JOIN ( SELECT community_reputation_transactions.user_id, sum(community_reputation_transactions.delta)::integer AS reputation FROM community_reputation_transactions GROUP BY community_reputation_transactions.user_id) rep ON rep.user_id = u.id LEFT JOIN ( SELECT c.author_id, count(DISTINCT c.id)::integer AS helpful_answers FROM community_comments c JOIN community_reactions r ON r.comment_id = c.id AND r.reaction = 'helpful'::community_reaction_kind WHERE c.deleted_at IS NULL GROUP BY c.author_id) ans ON ans.author_id = u.id LEFT JOIN ( SELECT c.author_id, count(*)::integer AS solved_problems FROM community_comments c WHERE c.is_solution = true AND c.deleted_at IS NULL GROUP BY c.author_id) sol ON sol.author_id = u.id LEFT JOIN ( SELECT community_posts.author_id, count(*)::integer AS posts_authored FROM community_posts WHERE community_posts.deleted_at IS NULL GROUP BY community_posts.author_id) pos ON pos.author_id = u.id LEFT JOIN ( SELECT community_comments.author_id, count(*)::integer AS comments_authored FROM community_comments WHERE community_comments.deleted_at IS NULL GROUP BY community_comments.author_id) cmt ON cmt.author_id = u.id LEFT JOIN ( SELECT community_posts.author_id, count(*)::integer AS tips_authored FROM community_posts WHERE community_posts.deleted_at IS NULL AND community_posts.post_type = 'tip'::community_post_type GROUP BY community_posts.author_id) tip ON tip.author_id = u.id`,
);
export const communityRateLimits = pgTable(
  "community_rate_limits",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bucket: varchar("bucket", { length: 40 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bucket] })],
).enableRLS();
