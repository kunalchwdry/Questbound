// InnerLoop adaptive engine schema — additive tables.
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import {
  attributeEnum,
  energyLevelEnum,
  questEventKindEnum,
  quests,
  users,
} from "./schema";

// ---------------------------------------------------------------------------
// Goals (campaigns)
// ---------------------------------------------------------------------------
export const goals = pgTable(
  "goals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    attribute: attributeEnum("attribute"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    deadline: varchar("deadline", { length: 10 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("goals_user_idx").on(t.userId, t.status)],
).enableRLS();

// ---------------------------------------------------------------------------
// Plan sessions — one row per "Plan my day" invocation
// ---------------------------------------------------------------------------
export const planSessions = pgTable(
  "plan_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: varchar("day", { length: 10 }).notNull(),
    goalText: text("goal_text"),
    energyLevel: energyLevelEnum("energy_level").notNull().default("medium"),
    moodTag: varchar("mood_tag", { length: 20 }),
    availableMinutes: integer("available_minutes").notNull().default(60),
    deadlines: text("deadlines"),
    note: text("note"),
    questIds: integer("quest_ids").array().notNull().default([]),
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plan_sessions_user_day_idx").on(t.userId, t.day)],
).enableRLS();

// ---------------------------------------------------------------------------
// Quest events — behavioural log
// ---------------------------------------------------------------------------
export const questEvents = pgTable(
  "quest_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questId: integer("quest_id").references(() => quests.id, {
      onDelete: "set null",
    }),
    event: questEventKindEnum("event").notNull(),
    scheduledFor: varchar("scheduled_for", { length: 10 }),
    fromDay: varchar("from_day", { length: 10 }),
    toDay: varchar("to_day", { length: 10 }),
    energyLevel: energyLevelEnum("energy_level"),
    moodTag: varchar("mood_tag", { length: 20 }),
    durationMin: integer("duration_min"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("quest_events_user_time_idx").on(t.userId, t.createdAt),
    index("quest_events_quest_idx").on(t.questId),
    index("quest_events_user_day_idx").on(t.userId, t.scheduledFor),
  ],
).enableRLS();

export type GoalRow = typeof goals.$inferSelect;
export type PlanSessionRow = typeof planSessions.$inferSelect;
export type QuestEventRow = typeof questEvents.$inferSelect;
