-- InnerLoop adaptive engine — additive migration for Questbound.
-- All changes are safe, nullable, defaulted, and additive. Nothing is dropped.
-- Apply idempotently with IF NOT EXISTS / guarded ALTER TABLE.

-- ---------------------------------------------------------------------------
-- Energy level enum (used by both plan sessions and quest events)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE energy_level AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quest_event_kind AS ENUM (
    'started',
    'completed',
    'abandoned',
    'postponed',
    'rescheduled',
    'split',
    'scheduled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('active', 'postponed', 'split');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Extend quests with planning metadata (all nullable, safe defaults)
-- ---------------------------------------------------------------------------
ALTER TABLE quests ADD COLUMN IF NOT EXISTS parent_quest_id integer;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS scheduled_for varchar(10);
ALTER TABLE quests ADD COLUMN IF NOT EXISTS scheduled_order integer;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS plan_context jsonb;

DO $$ BEGIN
  ALTER TABLE quests ADD COLUMN quest_status plan_status NOT NULL DEFAULT 'active';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Self-reference for split quests
DO $$ BEGIN
  ALTER TABLE quests
    ADD CONSTRAINT quests_parent_fk FOREIGN KEY (parent_quest_id)
    REFERENCES quests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS quests_user_scheduled_idx
  ON quests (user_id, scheduled_for);

CREATE INDEX IF NOT EXISTS quests_parent_idx
  ON quests (parent_quest_id);

-- ---------------------------------------------------------------------------
-- plan_sessions — one record each time the hero taps "Plan My Day"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  day varchar(10) NOT NULL,
  goal_text text,
  energy_level energy_level NOT NULL DEFAULT 'medium',
  mood_tag varchar(20),
  available_minutes integer NOT NULL DEFAULT 60,
  deadlines text,
  note text,
  quest_ids integer[] NOT NULL DEFAULT '{}',
  explanation text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_sessions_user_day_idx
  ON plan_sessions (user_id, day);

-- ---------------------------------------------------------------------------
-- quest_events — append-only behavioural log for insights & replanning
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quest_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  quest_id integer REFERENCES quests(id) ON DELETE set null,
  event quest_event_kind NOT NULL,
  scheduled_for varchar(10),
  from_day varchar(10),
  to_day varchar(10),
  energy_level energy_level,
  mood_tag varchar(20),
  duration_min integer,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quest_events_user_time_idx
  ON quest_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quest_events_quest_idx
  ON quest_events (quest_id);
CREATE INDEX IF NOT EXISTS quest_events_user_day_idx
  ON quest_events (user_id, scheduled_for);

-- ---------------------------------------------------------------------------
-- goals — long-term campaigns (lightweight; P0 scope is minimal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  title varchar(160) NOT NULL,
  attribute attribute,
  status varchar(16) NOT NULL DEFAULT 'active',
  deadline varchar(10),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS goals_user_idx
  ON goals (user_id, status);

DO $$ BEGIN
  ALTER TABLE quests ADD COLUMN goal_id integer;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE quests
    ADD CONSTRAINT quests_goal_fk FOREIGN KEY (goal_id)
    REFERENCES goals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
