import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const attributeEnum = pgEnum("attribute", [
  "strength",
  "intellect",
  "vitality",
  "charisma",
  "discipline",
  "creativity",
]);

export const difficultyEnum = pgEnum("difficulty", [
  "trivial",
  "easy",
  "medium",
  "hard",
  "epic",
]);

export const questTypeEnum = pgEnum("quest_type", ["daily", "habit", "once"]);

export const itemCategoryEnum = pgEnum("item_category", [
  "title",
  "theme",
  "companion",
  "badge",
  "consumable",
]);

export const rarityEnum = pgEnum("rarity", [
  "common",
  "rare",
  "epic",
  "legendary",
]);

// ---------------------------------------------------------------------------
// Users: account + character sheet
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    // Supabase Auth (GoTrue) user id (auth.users.id). Null only for legacy
    // rows created before the Supabase migration.
    authId: varchar("auth_id", { length: 36 }).unique(),
    email: varchar("email", { length: 255 }).notNull(),
    // Deprecated: passwords are managed by Supabase Auth now. Kept nullable for
    // legacy accounts.
    passwordHash: text("password_hash"),
    displayName: varchar("display_name", { length: 40 }).notNull(),
    classKey: varchar("class_key", { length: 20 }).notNull().default("knight"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),

    // Progression (all values are only ever mutated server-side)
    xp: integer("xp").notNull().default(0),
    gold: integer("gold").notNull().default(50),
    streak: integer("streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveDate: varchar("last_active_date", { length: 10 }),
    boostCharges: integer("boost_charges").notNull().default(0),
    lastBountyClaim: varchar("last_bounty_claim", { length: 10 }),
    lastBossClaimWeek: varchar("last_boss_claim_week", { length: 10 }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),

    // Attribute XP
    strengthXp: integer("strength_xp").notNull().default(0),
    intellectXp: integer("intellect_xp").notNull().default(0),
    vitalityXp: integer("vitality_xp").notNull().default(0),
    charismaXp: integer("charisma_xp").notNull().default(0),
    disciplineXp: integer("discipline_xp").notNull().default(0),
    creativityXp: integer("creativity_xp").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

// ---------------------------------------------------------------------------
// Sessions: opaque token (hashed) -> user
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Quests: the user's tasks
// ---------------------------------------------------------------------------
export const quests = pgTable(
  "quests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    notes: text("notes"),
    attribute: attributeEnum("attribute").notNull(),
    difficulty: difficultyEnum("difficulty").notNull().default("medium"),
    type: questTypeEnum("type").notNull().default("once"),
    dueDate: varchar("due_date", { length: 10 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastCompletedOn: varchar("last_completed_on", { length: 10 }),
    timesCompleted: integer("times_completed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("quests_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Completions: immutable historical log (the Chronicle)
// ---------------------------------------------------------------------------
export const completions = pgTable(
  "completions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questId: integer("quest_id").references(() => quests.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 120 }).notNull(),
    attribute: attributeEnum("attribute").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    xp: integer("xp").notNull(),
    gold: integer("gold").notNull(),
    crit: boolean("crit").notNull().default(false),
    multiplierPct: integer("multiplier_pct").notNull().default(100),
    streakAfter: integer("streak_after").notNull().default(0),
    completedOn: varchar("completed_on", { length: 10 }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("completions_user_idx").on(t.userId),
    index("completions_quest_day_idx").on(t.questId, t.completedOn),
  ],
);

// ---------------------------------------------------------------------------
// Items: the Armory catalogue
// ---------------------------------------------------------------------------
export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description").notNull(),
    category: itemCategoryEnum("category").notNull(),
    rarity: rarityEnum("rarity").notNull().default("common"),
    price: integer("price").notNull(),
    icon: varchar("icon", { length: 16 }).notNull(),
    payload: varchar("payload", { length: 64 }),
    minLevel: integer("min_level").notNull().default(1),
    stackable: boolean("stackable").notNull().default(false),
    maxStack: integer("max_stack").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("items_slug_idx").on(t.slug)],
);

// ---------------------------------------------------------------------------
// Inventory: what each hero owns
// ---------------------------------------------------------------------------
export const inventory = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    equipped: boolean("equipped").notNull().default(false),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_user_item_idx").on(t.userId, t.itemId),
    index("inventory_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Check-ins: mood journal (Finch / Daylio style)
// ---------------------------------------------------------------------------
export const checkins = pgTable(
  "checkins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mood: integer("mood").notNull(), // 1..5
    emotion: varchar("emotion", { length: 20 }).notNull(),
    note: text("note"),
    day: varchar("day", { length: 10 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("checkins_user_day_idx").on(t.userId, t.day)],
);

// ---------------------------------------------------------------------------
// Companion messages: persisted Oracle conversation
// ---------------------------------------------------------------------------
export const companionMessages = pgTable(
  "companion_messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 10 }).notNull(), // user | oracle
    content: text("content").notNull(),
    emotion: varchar("emotion", { length: 20 }),
    suggestions: text("suggestions"), // JSON array of quest suggestions
    provider: varchar("provider", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("companion_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Per-user AI / LLM configuration (Oracle provider overrides)
// ---------------------------------------------------------------------------
// One row per hero. The API key is stored AES-256-GCM encrypted (see
// lib/crypto.ts), never sent to the browser, and never logged. Absence of a
// row (or provider = "keyless") means "use the server's default ensemble".
export const aiConfigs = pgTable("ai_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  // keyless | local | openai | gemini | anthropic | nvidia | custom
  provider: varchar("provider", { length: 20 }).notNull().default("keyless"),
  model: varchar("model", { length: 120 }),
  baseUrl: varchar("base_url", { length: 255 }),
  /** AES-256-GCM envelope: v1:iv:tag:ciphertext (base64). Server-only. */
  apiKeyCipher: text("api_key_cipher"),
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(600),
  lastTestOk: boolean("last_test_ok"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type AiConfigRow = typeof aiConfigs.$inferSelect;
export type QuestRow = typeof quests.$inferSelect;
export type CompletionRow = typeof completions.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type InventoryRow = typeof inventory.$inferSelect;
