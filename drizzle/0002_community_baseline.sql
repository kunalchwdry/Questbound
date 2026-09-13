-- Reconcile social schema already present in the existing Supabase project.
-- Catalog capture 2026-09-13. Additive and safe on populated databases.
DO $$ BEGIN CREATE TYPE public.challenge_metric AS ENUM ('sessions','streak_days','xp','members'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.challenge_status AS ENUM ('draft','active','completed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.community_post_status AS ENUM ('open','solved','closed','archived','removed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.community_post_type AS ENUM ('help','question','discussion','achievement','tip','goal','challenge'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.community_reaction_kind AS ENUM ('helpful','motivating','encouragement','learned_something','relatable'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.guild_invite_status AS ENUM ('pending','accepted','declined','revoked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.guild_quest_status AS ENUM ('active','completed','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.guild_role AS ENUM ('owner','moderator','member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.guild_visibility AS ENUM ('public','invite_only'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.notification_kind AS ENUM ('reply','helpful','solved','reputation','leaderboard','guild_quest','guild_member','guild_invite','challenge','achievement','moderation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.report_status AS ENUM ('open','reviewing','resolved','dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.reputation_reason AS ENUM ('helpful_answer','problem_solved','useful_tip','guild_contribution','challenge_contribution','moderator_contribution'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.community_posts (
  id serial NOT NULL,
  author_id integer NOT NULL,
  post_type community_post_type DEFAULT 'discussion'::community_post_type NOT NULL,
  title character varying(160) NOT NULL,
  content text NOT NULL,
  category character varying(40),
  status community_post_status DEFAULT 'open'::community_post_status NOT NULL,
  is_solved boolean DEFAULT false NOT NULL,
  blocked_on text,
  tried text,
  guild_id integer,
  is_pinned boolean DEFAULT false NOT NULL,
  comment_count integer DEFAULT 0 NOT NULL,
  reaction_count integer DEFAULT 0 NOT NULL,
  save_count integer DEFAULT 0 NOT NULL,
  view_count integer DEFAULT 0 NOT NULL,
  helpful_count integer DEFAULT 0 NOT NULL,
  last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone,
  solved_comment_id integer
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id serial NOT NULL,
  post_id integer NOT NULL,
  author_id integer NOT NULL,
  parent_comment_id integer,
  content text NOT NULL,
  is_solution boolean DEFAULT false NOT NULL,
  depth integer DEFAULT 1 NOT NULL,
  helpful_count integer DEFAULT 0 NOT NULL,
  reaction_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  edited_at timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.community_reactions (
  id serial NOT NULL,
  post_id integer,
  comment_id integer,
  user_id integer NOT NULL,
  reaction community_reaction_kind NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_tags (
  id serial NOT NULL,
  slug character varying(40) NOT NULL,
  label character varying(40) NOT NULL,
  usage_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_post_tags (
  post_id integer NOT NULL,
  tag_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_saved_posts (
  user_id integer NOT NULL,
  post_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guilds (
  id serial NOT NULL,
  slug character varying(48) NOT NULL,
  name character varying(60) NOT NULL,
  motto character varying(140),
  description text,
  emblem character varying(16) DEFAULT '🛡️'::character varying NOT NULL,
  accent character varying(20) DEFAULT 'gold'::character varying NOT NULL,
  owner_id integer NOT NULL,
  visibility guild_visibility DEFAULT 'public'::guild_visibility NOT NULL,
  join_policy character varying(16) DEFAULT 'open'::character varying NOT NULL,
  xp integer DEFAULT 0 NOT NULL,
  weekly_xp integer DEFAULT 0 NOT NULL,
  level integer DEFAULT 1 NOT NULL,
  member_count integer DEFAULT 1 NOT NULL,
  max_members integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guild_members (
  id serial NOT NULL,
  guild_id integer NOT NULL,
  user_id integer NOT NULL,
  role guild_role DEFAULT 'member'::guild_role NOT NULL,
  contribution_xp integer DEFAULT 0 NOT NULL,
  weekly_xp integer DEFAULT 0 NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guild_invites (
  id serial NOT NULL,
  guild_id integer NOT NULL,
  inviter_id integer NOT NULL,
  invitee_id integer NOT NULL,
  role guild_role DEFAULT 'member'::guild_role NOT NULL,
  status guild_invite_status DEFAULT 'pending'::guild_invite_status NOT NULL,
  message character varying(280),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.guild_quests (
  id serial NOT NULL,
  guild_id integer NOT NULL,
  created_by integer NOT NULL,
  title character varying(120) NOT NULL,
  description text,
  icon character varying(16) DEFAULT '⚔️'::character varying NOT NULL,
  attribute attribute,
  target integer NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  reward_xp integer DEFAULT 0 NOT NULL,
  reward_gold integer DEFAULT 0 NOT NULL,
  reward_reputation integer DEFAULT 0 NOT NULL,
  status guild_quest_status DEFAULT 'active'::guild_quest_status NOT NULL,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guild_quest_participants (
  id serial NOT NULL,
  guild_quest_id integer NOT NULL,
  user_id integer NOT NULL,
  contributions integer DEFAULT 0 NOT NULL,
  guild_xp_awarded integer DEFAULT 0 NOT NULL,
  personal_xp_awarded integer DEFAULT 0 NOT NULL,
  reward_claimed boolean DEFAULT false NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_challenges (
  id serial NOT NULL,
  slug character varying(64) NOT NULL,
  title character varying(120) NOT NULL,
  description text,
  icon character varying(16) DEFAULT '🏆'::character varying NOT NULL,
  metric challenge_metric DEFAULT 'sessions'::challenge_metric NOT NULL,
  target integer NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  reward_xp integer DEFAULT 0 NOT NULL,
  reward_gold integer DEFAULT 0 NOT NULL,
  reward_reputation integer DEFAULT 0 NOT NULL,
  status challenge_status DEFAULT 'active'::challenge_status NOT NULL,
  starts_at timestamp with time zone DEFAULT now() NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_challenge_participants (
  id serial NOT NULL,
  challenge_id integer NOT NULL,
  user_id integer NOT NULL,
  contribution integer DEFAULT 0 NOT NULL,
  reward_claimed boolean DEFAULT false NOT NULL,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_reputation_transactions (
  id serial NOT NULL,
  user_id integer NOT NULL,
  delta integer NOT NULL,
  reason reputation_reason NOT NULL,
  ref_type character varying(24),
  ref_id integer,
  actor_id integer,
  dedupe_key character varying(160) NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id serial NOT NULL,
  reporter_id integer NOT NULL,
  post_id integer,
  comment_id integer,
  target_user_id integer,
  reason character varying(40) NOT NULL,
  details text,
  status report_status DEFAULT 'open'::report_status NOT NULL,
  resolved_by integer,
  resolved_at timestamp with time zone,
  resolution_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id integer NOT NULL,
  blocked_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id serial NOT NULL,
  user_id integer NOT NULL,
  kind notification_kind NOT NULL,
  title character varying(160) NOT NULL,
  body character varying(400),
  href character varying(200),
  actor_id integer,
  ref_type character varying(24),
  ref_id integer,
  dedupe_key character varying(160),
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.leaderboard_rank_snapshots (
  id serial NOT NULL,
  category character varying(32) NOT NULL,
  user_id integer NOT NULL,
  rank integer NOT NULL,
  metric_value integer DEFAULT 0 NOT NULL,
  captured_on character varying(10) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.community_challenge_contributions (
  id serial NOT NULL,
  challenge_id integer NOT NULL,
  user_id integer NOT NULL,
  source_completion_id integer NOT NULL,
  metric_delta integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guild_quest_contributions (
  id serial NOT NULL,
  guild_quest_id integer NOT NULL,
  user_id integer NOT NULL,
  source_completion_id integer NOT NULL,
  units integer DEFAULT 1 NOT NULL,
  guild_xp_awarded integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_body_len') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_body_len" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 20000))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_counts_ok') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_counts_ok" CHECK (((comment_count >= 0) AND (reaction_count >= 0) AND (save_count >= 0) AND (view_count >= 0) AND (helpful_count >= 0))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_pkey') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_solved_kind') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_solved_kind" CHECK (((NOT is_solved) OR (post_type = ANY (ARRAY['help'::community_post_type, 'question'::community_post_type])))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_title_len') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_title_len" CHECK (((char_length((title)::text) >= 4) AND (char_length((title)::text) <= 160))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_body_len') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_body_len" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 8000))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_counts_ok') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_counts_ok" CHECK (((helpful_count >= 0) AND (reaction_count >= 0))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_depth_ok') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_depth_ok" CHECK (((depth >= 1) AND (depth <= 3))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_pkey') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reactions'::regclass AND conname='community_reactions_one_target') THEN ALTER TABLE public.community_reactions ADD CONSTRAINT "community_reactions_one_target" CHECK ((((post_id IS NOT NULL) AND (comment_id IS NULL)) OR ((post_id IS NULL) AND (comment_id IS NOT NULL)))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reactions'::regclass AND conname='community_reactions_pkey') THEN ALTER TABLE public.community_reactions ADD CONSTRAINT "community_reactions_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_tags'::regclass AND conname='community_tags_pkey') THEN ALTER TABLE public.community_tags ADD CONSTRAINT "community_tags_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_tags'::regclass AND conname='community_tags_slug_unique') THEN ALTER TABLE public.community_tags ADD CONSTRAINT "community_tags_slug_unique" UNIQUE (slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_tags'::regclass AND conname='community_tags_usage_nonneg') THEN ALTER TABLE public.community_tags ADD CONSTRAINT "community_tags_usage_nonneg" CHECK ((usage_count >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_post_tags'::regclass AND conname='community_post_tags_pkey') THEN ALTER TABLE public.community_post_tags ADD CONSTRAINT "community_post_tags_pkey" PRIMARY KEY (post_id, tag_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_saved_posts'::regclass AND conname='community_saved_posts_pkey') THEN ALTER TABLE public.community_saved_posts ADD CONSTRAINT "community_saved_posts_pkey" PRIMARY KEY (user_id, post_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guilds'::regclass AND conname='guilds_counters_ok') THEN ALTER TABLE public.guilds ADD CONSTRAINT "guilds_counters_ok" CHECK (((xp >= 0) AND (weekly_xp >= 0) AND (member_count >= 0) AND (max_members >= 1))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guilds'::regclass AND conname='guilds_join_policy_check') THEN ALTER TABLE public.guilds ADD CONSTRAINT "guilds_join_policy_check" CHECK (((join_policy)::text = ANY ((ARRAY['open'::character varying, 'request'::character varying])::text[]))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guilds'::regclass AND conname='guilds_name_len') THEN ALTER TABLE public.guilds ADD CONSTRAINT "guilds_name_len" CHECK (((char_length((name)::text) >= 3) AND (char_length((name)::text) <= 60))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guilds'::regclass AND conname='guilds_pkey') THEN ALTER TABLE public.guilds ADD CONSTRAINT "guilds_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_members'::regclass AND conname='guild_members_contribution_ok') THEN ALTER TABLE public.guild_members ADD CONSTRAINT "guild_members_contribution_ok" CHECK (((contribution_xp >= 0) AND (weekly_xp >= 0))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_members'::regclass AND conname='guild_members_pkey') THEN ALTER TABLE public.guild_members ADD CONSTRAINT "guild_members_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_invites'::regclass AND conname='guild_invites_no_self') THEN ALTER TABLE public.guild_invites ADD CONSTRAINT "guild_invites_no_self" CHECK ((inviter_id <> invitee_id)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_invites'::regclass AND conname='guild_invites_pkey') THEN ALTER TABLE public.guild_invites ADD CONSTRAINT "guild_invites_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_pkey') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_progress_ok') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_progress_ok" CHECK (((progress >= 0) AND (progress <= target))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_reward_gold_check') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_reward_gold_check" CHECK ((reward_gold >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_reward_reputation_check') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_reward_reputation_check" CHECK ((reward_reputation >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_reward_xp_check') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_reward_xp_check" CHECK ((reward_xp >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_target_check') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_target_check" CHECK (((target >= 1) AND (target <= 1000000))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_title_len') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_title_len" CHECK (((char_length((title)::text) >= 3) AND (char_length((title)::text) <= 120))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_participants'::regclass AND conname='guild_quest_participants_contributions_check') THEN ALTER TABLE public.guild_quest_participants ADD CONSTRAINT "guild_quest_participants_contributions_check" CHECK ((contributions >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_participants'::regclass AND conname='guild_quest_participants_guild_quest_id_user_id_key') THEN ALTER TABLE public.guild_quest_participants ADD CONSTRAINT "guild_quest_participants_guild_quest_id_user_id_key" UNIQUE (guild_quest_id, user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_participants'::regclass AND conname='guild_quest_participants_pkey') THEN ALTER TABLE public.guild_quest_participants ADD CONSTRAINT "guild_quest_participants_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_pkey') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_progress_check') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_progress_check" CHECK ((progress >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_reward_gold_check') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_reward_gold_check" CHECK ((reward_gold >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_reward_reputation_check') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_reward_reputation_check" CHECK ((reward_reputation >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_reward_xp_check') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_reward_xp_check" CHECK ((reward_xp >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_target_check') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_target_check" CHECK (((target >= 1) AND (target <= 100000000))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_title_len') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_title_len" CHECK (((char_length((title)::text) >= 3) AND (char_length((title)::text) <= 120))); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_window') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_window" CHECK ((ends_at > starts_at)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_participants'::regclass AND conname='community_challenge_participants_challenge_id_user_id_key') THEN ALTER TABLE public.community_challenge_participants ADD CONSTRAINT "community_challenge_participants_challenge_id_user_id_key" UNIQUE (challenge_id, user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_participants'::regclass AND conname='community_challenge_participants_contribution_check') THEN ALTER TABLE public.community_challenge_participants ADD CONSTRAINT "community_challenge_participants_contribution_check" CHECK ((contribution >= 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_participants'::regclass AND conname='community_challenge_participants_pkey') THEN ALTER TABLE public.community_challenge_participants ADD CONSTRAINT "community_challenge_participants_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reputation_transactions'::regclass AND conname='community_reputation_dedupe_unique') THEN ALTER TABLE public.community_reputation_transactions ADD CONSTRAINT "community_reputation_dedupe_unique" UNIQUE (dedupe_key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reputation_transactions'::regclass AND conname='community_reputation_transactions_delta_check') THEN ALTER TABLE public.community_reputation_transactions ADD CONSTRAINT "community_reputation_transactions_delta_check" CHECK ((delta <> 0)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reputation_transactions'::regclass AND conname='community_reputation_transactions_pkey') THEN ALTER TABLE public.community_reputation_transactions ADD CONSTRAINT "community_reputation_transactions_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_one_target') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_one_target" CHECK ((((((post_id IS NOT NULL))::integer + ((comment_id IS NOT NULL))::integer) + ((target_user_id IS NOT NULL))::integer) = 1)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_pkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_blocks'::regclass AND conname='user_blocks_no_self') THEN ALTER TABLE public.user_blocks ADD CONSTRAINT "user_blocks_no_self" CHECK ((blocker_id <> blocked_id)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_blocks'::regclass AND conname='user_blocks_pkey') THEN ALTER TABLE public.user_blocks ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY (blocker_id, blocked_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_pkey') THEN ALTER TABLE public.notifications ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.leaderboard_rank_snapshots'::regclass AND conname='leaderboard_rank_snapshots_pkey') THEN ALTER TABLE public.leaderboard_rank_snapshots ADD CONSTRAINT "leaderboard_rank_snapshots_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_contributions'::regclass AND conname='community_challenge_contributions_pkey') THEN ALTER TABLE public.community_challenge_contributions ADD CONSTRAINT "community_challenge_contributions_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_contributions'::regclass AND conname='guild_quest_contributions_pkey') THEN ALTER TABLE public.guild_quest_contributions ADD CONSTRAINT "guild_quest_contributions_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_author_id_fkey') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_posts'::regclass AND conname='community_posts_solved_comment_fk') THEN ALTER TABLE public.community_posts ADD CONSTRAINT "community_posts_solved_comment_fk" FOREIGN KEY (solved_comment_id) REFERENCES community_comments(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_author_id_fkey') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_parent_comment_id_fkey') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_parent_comment_id_fkey" FOREIGN KEY (parent_comment_id) REFERENCES community_comments(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_comments'::regclass AND conname='community_comments_post_id_fkey') THEN ALTER TABLE public.community_comments ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reactions'::regclass AND conname='community_reactions_comment_id_fkey') THEN ALTER TABLE public.community_reactions ADD CONSTRAINT "community_reactions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_comments(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reactions'::regclass AND conname='community_reactions_post_id_fkey') THEN ALTER TABLE public.community_reactions ADD CONSTRAINT "community_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reactions'::regclass AND conname='community_reactions_user_id_fkey') THEN ALTER TABLE public.community_reactions ADD CONSTRAINT "community_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_post_tags'::regclass AND conname='community_post_tags_post_id_fkey') THEN ALTER TABLE public.community_post_tags ADD CONSTRAINT "community_post_tags_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_post_tags'::regclass AND conname='community_post_tags_tag_id_fkey') THEN ALTER TABLE public.community_post_tags ADD CONSTRAINT "community_post_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES community_tags(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_saved_posts'::regclass AND conname='community_saved_posts_post_id_fkey') THEN ALTER TABLE public.community_saved_posts ADD CONSTRAINT "community_saved_posts_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_saved_posts'::regclass AND conname='community_saved_posts_user_id_fkey') THEN ALTER TABLE public.community_saved_posts ADD CONSTRAINT "community_saved_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guilds'::regclass AND conname='guilds_owner_id_fkey') THEN ALTER TABLE public.guilds ADD CONSTRAINT "guilds_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_members'::regclass AND conname='guild_members_guild_id_fkey') THEN ALTER TABLE public.guild_members ADD CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_members'::regclass AND conname='guild_members_user_id_fkey') THEN ALTER TABLE public.guild_members ADD CONSTRAINT "guild_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_invites'::regclass AND conname='guild_invites_guild_id_fkey') THEN ALTER TABLE public.guild_invites ADD CONSTRAINT "guild_invites_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_invites'::regclass AND conname='guild_invites_invitee_id_fkey') THEN ALTER TABLE public.guild_invites ADD CONSTRAINT "guild_invites_invitee_id_fkey" FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_invites'::regclass AND conname='guild_invites_inviter_id_fkey') THEN ALTER TABLE public.guild_invites ADD CONSTRAINT "guild_invites_inviter_id_fkey" FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_created_by_fkey') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quests'::regclass AND conname='guild_quests_guild_id_fkey') THEN ALTER TABLE public.guild_quests ADD CONSTRAINT "guild_quests_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_participants'::regclass AND conname='guild_quest_participants_guild_quest_id_fkey') THEN ALTER TABLE public.guild_quest_participants ADD CONSTRAINT "guild_quest_participants_guild_quest_id_fkey" FOREIGN KEY (guild_quest_id) REFERENCES guild_quests(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_participants'::regclass AND conname='guild_quest_participants_user_id_fkey') THEN ALTER TABLE public.guild_quest_participants ADD CONSTRAINT "guild_quest_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenges'::regclass AND conname='community_challenges_created_by_fkey') THEN ALTER TABLE public.community_challenges ADD CONSTRAINT "community_challenges_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_participants'::regclass AND conname='community_challenge_participants_challenge_id_fkey') THEN ALTER TABLE public.community_challenge_participants ADD CONSTRAINT "community_challenge_participants_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES community_challenges(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_participants'::regclass AND conname='community_challenge_participants_user_id_fkey') THEN ALTER TABLE public.community_challenge_participants ADD CONSTRAINT "community_challenge_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reputation_transactions'::regclass AND conname='community_reputation_transactions_actor_id_fkey') THEN ALTER TABLE public.community_reputation_transactions ADD CONSTRAINT "community_reputation_transactions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reputation_transactions'::regclass AND conname='community_reputation_transactions_user_id_fkey') THEN ALTER TABLE public.community_reputation_transactions ADD CONSTRAINT "community_reputation_transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_comment_id_fkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_comments(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_post_id_fkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_reporter_id_fkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_resolved_by_fkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_reports'::regclass AND conname='community_reports_target_user_id_fkey') THEN ALTER TABLE public.community_reports ADD CONSTRAINT "community_reports_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_blocks'::regclass AND conname='user_blocks_blocked_id_fkey') THEN ALTER TABLE public.user_blocks ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_blocks'::regclass AND conname='user_blocks_blocker_id_fkey') THEN ALTER TABLE public.user_blocks ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_actor_id_fkey') THEN ALTER TABLE public.notifications ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND conname='notifications_user_id_fkey') THEN ALTER TABLE public.notifications ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.leaderboard_rank_snapshots'::regclass AND conname='leaderboard_rank_snapshots_user_id_users_id_fk') THEN ALTER TABLE public.leaderboard_rank_snapshots ADD CONSTRAINT "leaderboard_rank_snapshots_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_contributions'::regclass AND conname='community_challenge_contributions_challenge_id_community_challe') THEN ALTER TABLE public.community_challenge_contributions ADD CONSTRAINT "community_challenge_contributions_challenge_id_community_challe" FOREIGN KEY (challenge_id) REFERENCES community_challenges(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.community_challenge_contributions'::regclass AND conname='community_challenge_contributions_user_id_users_id_fk') THEN ALTER TABLE public.community_challenge_contributions ADD CONSTRAINT "community_challenge_contributions_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_contributions'::regclass AND conname='guild_quest_contributions_guild_quest_id_guild_quests_id_fk') THEN ALTER TABLE public.guild_quest_contributions ADD CONSTRAINT "guild_quest_contributions_guild_quest_id_guild_quests_id_fk" FOREIGN KEY (guild_quest_id) REFERENCES guild_quests(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.guild_quest_contributions'::regclass AND conname='guild_quest_contributions_user_id_users_id_fk') THEN ALTER TABLE public.guild_quest_contributions ADD CONSTRAINT "guild_quest_contributions_user_id_users_id_fk" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS community_posts_pkey ON public.community_posts USING btree (id);
CREATE INDEX IF NOT EXISTS community_posts_created_idx ON public.community_posts USING btree (created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS community_posts_activity_idx ON public.community_posts USING btree (last_activity_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS community_posts_author_idx ON public.community_posts USING btree (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_type_idx ON public.community_posts USING btree (post_type, created_at DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS community_posts_unsolved_idx ON public.community_posts USING btree (created_at DESC) WHERE ((deleted_at IS NULL) AND (is_solved = false) AND (status = 'open'::community_post_status) AND (post_type = ANY (ARRAY['help'::community_post_type, 'question'::community_post_type])));
CREATE INDEX IF NOT EXISTS community_posts_guild_idx ON public.community_posts USING btree (guild_id, created_at DESC) WHERE (guild_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS community_posts_search_idx ON public.community_posts USING gin (to_tsvector('english'::regconfig, (((title)::text || ' '::text) || content)));
CREATE INDEX IF NOT EXISTS community_posts_solved_comment_idx ON public.community_posts USING btree (solved_comment_id) WHERE (solved_comment_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS community_comments_pkey ON public.community_comments USING btree (id);
CREATE INDEX IF NOT EXISTS community_comments_post_idx ON public.community_comments USING btree (post_id, created_at) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS community_comments_parent_idx ON public.community_comments USING btree (parent_comment_id);
CREATE INDEX IF NOT EXISTS community_comments_author_idx ON public.community_comments USING btree (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_comments_solution_idx ON public.community_comments USING btree (author_id) WHERE (is_solution = true);
CREATE UNIQUE INDEX IF NOT EXISTS community_reactions_pkey ON public.community_reactions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_reactions_user_post_idx ON public.community_reactions USING btree (user_id, post_id) WHERE (post_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS community_reactions_user_comment_idx ON public.community_reactions USING btree (user_id, comment_id) WHERE (comment_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS community_reactions_post_idx ON public.community_reactions USING btree (post_id);
CREATE INDEX IF NOT EXISTS community_reactions_comment_idx ON public.community_reactions USING btree (comment_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_tags_pkey ON public.community_tags USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_tags_slug_unique ON public.community_tags USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS community_tags_slug_idx ON public.community_tags USING btree (slug);
CREATE INDEX IF NOT EXISTS community_tags_usage_idx ON public.community_tags USING btree (usage_count DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_post_tags_pkey ON public.community_post_tags USING btree (post_id, tag_id);
CREATE INDEX IF NOT EXISTS community_post_tags_tag_idx ON public.community_post_tags USING btree (tag_id, post_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_saved_posts_pkey ON public.community_saved_posts USING btree (user_id, post_id);
CREATE INDEX IF NOT EXISTS community_saved_posts_user_idx ON public.community_saved_posts USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_pkey ON public.guilds USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_slug_idx ON public.guilds USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS guilds_name_lower_idx ON public.guilds USING btree (lower((name)::text));
CREATE INDEX IF NOT EXISTS guilds_xp_idx ON public.guilds USING btree (xp DESC);
CREATE INDEX IF NOT EXISTS guilds_weekly_xp_idx ON public.guilds USING btree (weekly_xp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS guild_members_pkey ON public.guild_members USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_members_user_idx ON public.guild_members USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_members_guild_user_idx ON public.guild_members USING btree (guild_id, user_id);
CREATE INDEX IF NOT EXISTS guild_members_roster_idx ON public.guild_members USING btree (guild_id, contribution_xp DESC);
CREATE INDEX IF NOT EXISTS guild_members_guild_role_idx ON public.guild_members USING btree (guild_id, role);
CREATE UNIQUE INDEX IF NOT EXISTS guild_invites_pkey ON public.guild_invites USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_invites_pending_idx ON public.guild_invites USING btree (guild_id, invitee_id) WHERE (status = 'pending'::guild_invite_status);
CREATE INDEX IF NOT EXISTS guild_invites_invitee_idx ON public.guild_invites USING btree (invitee_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS guild_quests_pkey ON public.guild_quests USING btree (id);
CREATE INDEX IF NOT EXISTS guild_quests_guild_status_idx ON public.guild_quests USING btree (guild_id, status, ends_at);
CREATE INDEX IF NOT EXISTS guild_quests_active_idx ON public.guild_quests USING btree (status, ends_at) WHERE (status = 'active'::guild_quest_status);
CREATE UNIQUE INDEX IF NOT EXISTS guild_quest_participants_pkey ON public.guild_quest_participants USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_quest_participants_guild_quest_id_user_id_key ON public.guild_quest_participants USING btree (guild_quest_id, user_id);
CREATE INDEX IF NOT EXISTS guild_quest_participants_board_idx ON public.guild_quest_participants USING btree (guild_quest_id, contributions DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_challenges_pkey ON public.community_challenges USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_challenges_slug_idx ON public.community_challenges USING btree (slug);
CREATE INDEX IF NOT EXISTS community_challenges_active_idx ON public.community_challenges USING btree (status, ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS community_challenge_participants_pkey ON public.community_challenge_participants USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_challenge_participants_challenge_id_user_id_key ON public.community_challenge_participants USING btree (challenge_id, user_id);
CREATE INDEX IF NOT EXISTS community_challenge_participants_idx ON public.community_challenge_participants USING btree (challenge_id, contribution DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_reputation_transactions_pkey ON public.community_reputation_transactions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_reputation_dedupe_unique ON public.community_reputation_transactions USING btree (dedupe_key);
CREATE INDEX IF NOT EXISTS community_reputation_user_idx ON public.community_reputation_transactions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_reputation_reason_day_idx ON public.community_reputation_transactions USING btree (user_id, reason, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS community_reports_pkey ON public.community_reports USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS community_reports_dedupe_idx ON public.community_reports USING btree (reporter_id, COALESCE(post_id, 0), COALESCE(comment_id, 0), COALESCE(target_user_id, 0)) WHERE (status = ANY (ARRAY['open'::report_status, 'reviewing'::report_status]));
CREATE INDEX IF NOT EXISTS community_reports_open_idx ON public.community_reports USING btree (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_pkey ON public.user_blocks USING btree (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks USING btree (blocked_id);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_pkey ON public.notifications USING btree (id);
CREATE INDEX IF NOT EXISTS notifications_inbox_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON public.notifications USING btree (dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_rank_snapshots_pkey ON public.leaderboard_rank_snapshots USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_rank_snapshots_unique ON public.leaderboard_rank_snapshots USING btree (category, user_id, captured_on);
CREATE INDEX IF NOT EXISTS leaderboard_rank_snapshots_lookup_idx ON public.leaderboard_rank_snapshots USING btree (category, captured_on);
CREATE UNIQUE INDEX IF NOT EXISTS community_challenge_contributions_pkey ON public.community_challenge_contributions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_contributions_unique ON public.community_challenge_contributions USING btree (challenge_id, source_completion_id);
CREATE INDEX IF NOT EXISTS challenge_contributions_board_idx ON public.community_challenge_contributions USING btree (challenge_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_quest_contributions_pkey ON public.guild_quest_contributions USING btree (id);
CREATE UNIQUE INDEX IF NOT EXISTS guild_quest_contributions_source_unique ON public.guild_quest_contributions USING btree (source_completion_id);
CREATE INDEX IF NOT EXISTS guild_quest_contributions_quest_idx ON public.guild_quest_contributions USING btree (guild_quest_id, created_at);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS leaderboard_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS leaderboard_opt_out boolean NOT NULL DEFAULT false;

DO $$ BEGIN IF to_regclass('public.community_stats') IS NULL THEN
CREATE VIEW public.community_stats AS SELECT u.id AS user_id, COALESCE(rep.reputation, 0) AS reputation, COALESCE(ans.helpful_answers, 0) AS helpful_answers, COALESCE(sol.solved_problems, 0) AS solved_problems, COALESCE(pos.posts_authored, 0) AS posts_authored, COALESCE(cmt.comments_authored, 0) AS comments_authored, COALESCE(tip.tips_authored, 0) AS tips_authored FROM users u LEFT JOIN ( SELECT community_reputation_transactions.user_id, sum(community_reputation_transactions.delta)::integer AS reputation FROM community_reputation_transactions GROUP BY community_reputation_transactions.user_id) rep ON rep.user_id = u.id LEFT JOIN ( SELECT c.author_id, count(DISTINCT c.id)::integer AS helpful_answers FROM community_comments c JOIN community_reactions r ON r.comment_id = c.id AND r.reaction = 'helpful'::community_reaction_kind WHERE c.deleted_at IS NULL GROUP BY c.author_id) ans ON ans.author_id = u.id LEFT JOIN ( SELECT c.author_id, count(*)::integer AS solved_problems FROM community_comments c WHERE c.is_solution = true AND c.deleted_at IS NULL GROUP BY c.author_id) sol ON sol.author_id = u.id LEFT JOIN ( SELECT community_posts.author_id, count(*)::integer AS posts_authored FROM community_posts WHERE community_posts.deleted_at IS NULL GROUP BY community_posts.author_id) pos ON pos.author_id = u.id LEFT JOIN ( SELECT community_comments.author_id, count(*)::integer AS comments_authored FROM community_comments WHERE community_comments.deleted_at IS NULL GROUP BY community_comments.author_id) cmt ON cmt.author_id = u.id LEFT JOIN ( SELECT community_posts.author_id, count(*)::integer AS tips_authored FROM community_posts WHERE community_posts.deleted_at IS NULL AND community_posts.post_type = 'tip'::community_post_type GROUP BY community_posts.author_id) tip ON tip.author_id = u.id;
END IF; END $$;
