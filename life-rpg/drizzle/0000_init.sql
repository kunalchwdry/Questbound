CREATE TYPE "public"."attribute" AS ENUM('strength', 'intellect', 'vitality', 'charisma', 'discipline', 'creativity');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('trivial', 'easy', 'medium', 'hard', 'epic');--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('title', 'theme', 'companion', 'badge', 'consumable');--> statement-breakpoint
CREATE TYPE "public"."quest_type" AS ENUM('daily', 'habit', 'once');--> statement-breakpoint
CREATE TYPE "public"."rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"mood" integer NOT NULL,
	"emotion" varchar(20) NOT NULL,
	"note" text,
	"day" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companion_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"emotion" varchar(20),
	"suggestions" text,
	"provider" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"quest_id" integer,
	"title" varchar(120) NOT NULL,
	"attribute" "attribute" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"xp" integer NOT NULL,
	"gold" integer NOT NULL,
	"crit" boolean DEFAULT false NOT NULL,
	"multiplier_pct" integer DEFAULT 100 NOT NULL,
	"streak_after" integer DEFAULT 0 NOT NULL,
	"completed_on" varchar(10) NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"category" "item_category" NOT NULL,
	"rarity" "rarity" DEFAULT 'common' NOT NULL,
	"price" integer NOT NULL,
	"icon" varchar(16) NOT NULL,
	"payload" varchar(64),
	"min_level" integer DEFAULT 1 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"max_stack" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"notes" text,
	"attribute" "attribute" NOT NULL,
	"difficulty" "difficulty" DEFAULT 'medium' NOT NULL,
	"type" "quest_type" DEFAULT 'once' NOT NULL,
	"due_date" varchar(10),
	"completed_at" timestamp with time zone,
	"last_completed_on" varchar(10),
	"times_completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_id" varchar(36),
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"display_name" varchar(40) NOT NULL,
	"class_key" varchar(20) DEFAULT 'knight' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 50 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_active_date" varchar(10),
	"boost_charges" integer DEFAULT 0 NOT NULL,
	"last_bounty_claim" varchar(10),
	"last_boss_claim_week" varchar(10),
	"onboarded_at" timestamp with time zone,
	"strength_xp" integer DEFAULT 0 NOT NULL,
	"intellect_xp" integer DEFAULT 0 NOT NULL,
	"vitality_xp" integer DEFAULT 0 NOT NULL,
	"charisma_xp" integer DEFAULT 0 NOT NULL,
	"discipline_xp" integer DEFAULT 0 NOT NULL,
	"creativity_xp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_messages" ADD CONSTRAINT "companion_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completions" ADD CONSTRAINT "completions_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkins_user_day_idx" ON "checkins" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "companion_user_idx" ON "companion_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "completions_user_idx" ON "completions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "completions_quest_day_idx" ON "completions" USING btree ("quest_id","completed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_user_item_idx" ON "inventory" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE INDEX "inventory_user_idx" ON "inventory" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "items_slug_idx" ON "items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "quests_user_idx" ON "quests" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");