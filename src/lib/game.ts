/**
 * Questbound – pure game engine.
 *
 * Everything in here is deterministic & side-effect free so it can run on the
 * server (authoritative) AND on the client (optimistic previews).
 */

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------
export const ATTRIBUTES = [
  "strength",
  "intellect",
  "vitality",
  "charisma",
  "discipline",
  "creativity",
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_META: Record<
  Attribute,
  { label: string; icon: string; blurb: string; examples: string }
> = {
  strength: {
    label: "Strength",
    icon: "⚔️",
    blurb: "Training, sport, physical effort",
    examples: "Gym, run, stretch, lift",
  },
  intellect: {
    label: "Intellect",
    icon: "📜",
    blurb: "Study, reading, coding, learning",
    examples: "Read 20 pages, study, ship code",
  },
  vitality: {
    label: "Vitality",
    icon: "🌿",
    blurb: "Sleep, nutrition, health, rest",
    examples: "Sleep by 11, cook a meal, walk",
  },
  charisma: {
    label: "Charisma",
    icon: "🎭",
    blurb: "People, communication, kindness",
    examples: "Call a friend, network, help someone",
  },
  discipline: {
    label: "Discipline",
    icon: "🛡️",
    blurb: "Chores, finances, routines, order",
    examples: "Budget, tidy desk, inbox zero",
  },
  creativity: {
    label: "Creativity",
    icon: "🎨",
    blurb: "Art, music, writing, making",
    examples: "Sketch, write 300 words, practice guitar",
  },
};

export const ATTRIBUTE_COLUMNS = {
  strength: "strengthXp",
  intellect: "intellectXp",
  vitality: "vitalityXp",
  charisma: "charismaXp",
  discipline: "disciplineXp",
  creativity: "creativityXp",
} as const;

// ---------------------------------------------------------------------------
// Difficulty & quest types
// ---------------------------------------------------------------------------
export const DIFFICULTIES = ["trivial", "easy", "medium", "hard", "epic"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; xp: number; gold: number; pips: number; hint: string }
> = {
  trivial: { label: "Trivial", xp: 10, gold: 4, pips: 1, hint: "< 5 minutes" },
  easy: { label: "Easy", xp: 20, gold: 8, pips: 2, hint: "~15 minutes" },
  medium: { label: "Medium", xp: 40, gold: 16, pips: 3, hint: "~30-60 minutes" },
  hard: { label: "Hard", xp: 80, gold: 32, pips: 4, hint: "A few hours" },
  epic: { label: "Epic", xp: 150, gold: 64, pips: 5, hint: "A real milestone" },
};

export const QUEST_TYPES = ["daily", "habit", "once"] as const;
export type QuestType = (typeof QUEST_TYPES)[number];

export const QUEST_TYPE_META: Record<
  QuestType,
  { label: string; icon: string; blurb: string }
> = {
  daily: { label: "Daily", icon: "🌅", blurb: "Resets every dawn. Once per day." },
  habit: {
    label: "Habit",
    icon: "🔁",
    blurb: "Log it whenever you do it (up to 5× a day).",
  },
  once: { label: "One-off", icon: "🎯", blurb: "A single task. Complete it once." },
};

export const HABIT_DAILY_CAP = 5;

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------
export const CLASSES = {
  knight: {
    label: "Knight",
    icon: "⚔️",
    affinity: "strength" as Attribute,
    blurb: "Forged in the training yard.",
  },
  mage: {
    label: "Mage",
    icon: "🔮",
    affinity: "intellect" as Attribute,
    blurb: "Keeper of tomes and late-night study.",
  },
  ranger: {
    label: "Ranger",
    icon: "🏹",
    affinity: "vitality" as Attribute,
    blurb: "Sleeps under stars, eats well, walks far.",
  },
  bard: {
    label: "Bard",
    icon: "🎻",
    affinity: "charisma" as Attribute,
    blurb: "Knows everyone in every tavern.",
  },
  monk: {
    label: "Monk",
    icon: "🧘",
    affinity: "discipline" as Attribute,
    blurb: "Order, routine, quiet mastery.",
  },
  alchemist: {
    label: "Alchemist",
    icon: "⚗️",
    affinity: "creativity" as Attribute,
    blurb: "Turns odd ideas into gold.",
  },
} as const;
export type ClassKey = keyof typeof CLASSES;
export const CLASS_KEYS = Object.keys(CLASSES) as ClassKey[];

export function isClassKey(value: string): value is ClassKey {
  return value in CLASSES;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
export const MAX_LEVEL = 99;
export const BOUNTY_GOAL = 3;
export const BOUNTY_GOLD = 50;
export const BOUNTY_XP = 40;
/** Weekly boss: damage dealt = XP earned this ISO week. */
export const BOSS_BASE_HP = 400;
export const BOSS_HP_PER_LEVEL = 60;
export const BOSS_GOLD = 120;
export const BOSS_XP = 100;
export const BOSSES = [
  { name: "The Procrastinator Wyrm", icon: "🐉", taunt: "It feeds on 'tomorrow'." },
  { name: "The Doomscroll Hydra", icon: "🐍", taunt: "Cut one head, two feeds open." },
  { name: "The Snooze Golem", icon: "🗿", taunt: "Slow, heavy, hits at 6am." },
  { name: "The Inbox Lich", icon: "💀", taunt: "Undying. Always 'urgent'." },
  { name: "The Perfectionist Sphinx", icon: "🦁", taunt: "Its riddle has no finished answer." },
] as const;

export function bossForWeek(weekKey: string) {
  const n = Number(weekKey.replace(/\D/g, "")) || 0;
  return BOSSES[n % BOSSES.length];
}

export function bossHp(level: number): number {
  return BOSS_BASE_HP + BOSS_HP_PER_LEVEL * Math.max(0, level - 1);
}
export const CRIT_CHANCE = 0.1;
export const CRIT_XP_MULT = 1.5;
export const CRIT_GOLD_MULT = 2;
export const AFFINITY_MULT = 1.15;
export const BOOST_MULT = 2;
export const STREAK_STEP = 0.02; // +2% XP per streak day
export const STREAK_CAP_DAYS = 30; // multiplier caps at +60%
export const LEVEL_UP_GOLD = 25; // × new level
export const ELIXIR_CHARGES = 3;

// ---------------------------------------------------------------------------
// Character levelling (non-linear: each level costs more than the last)
// ---------------------------------------------------------------------------
export function xpForNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export interface LevelState {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
}

export function levelFromXp(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level += 1;
  }
  const xpForNext = xpForNextLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext,
    progress: Math.min(1, remaining / xpForNext),
  };
}

export function rankForLevel(level: number): string {
  if (level >= 50) return "Legend";
  if (level >= 30) return "Hero";
  if (level >= 20) return "Champion";
  if (level >= 15) return "Veteran";
  if (level >= 10) return "Adventurer";
  if (level >= 5) return "Apprentice";
  return "Novice";
}

// ---------------------------------------------------------------------------
// Attribute levelling (quadratic curve)
// ---------------------------------------------------------------------------
const ATTR_BASE = 40;

export interface AttributeProgress {
  level: number;
  into: number;
  needed: number;
  progress: number;
}

export function attributeProgress(xp: number): AttributeProgress {
  const safe = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(safe / ATTR_BASE)) + 1;
  const floorXp = ATTR_BASE * (level - 1) ** 2;
  const nextXp = ATTR_BASE * level ** 2;
  const needed = nextXp - floorXp;
  const into = safe - floorXp;
  return { level, into, needed, progress: Math.min(1, into / needed) };
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------
export function streakMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), STREAK_CAP_DAYS) * STREAK_STEP;
}

function parseDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `a` to `b` (positive if b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / 86_400_000);
}

export interface StreakAdvance {
  streak: number;
  extended: boolean;
  reset: boolean;
  usedShield: boolean;
}

/** What happens to the streak when the hero completes something `today`. */
export function advanceStreak(input: {
  lastActiveDate: string | null;
  today: string;
  streak: number;
  shields: number;
}): StreakAdvance {
  const { lastActiveDate, today, streak, shields } = input;
  if (!lastActiveDate) {
    return { streak: 1, extended: true, reset: false, usedShield: false };
  }
  const gap = diffDays(lastActiveDate, today);
  if (gap <= 0) {
    return {
      streak: Math.max(streak, 1),
      extended: false,
      reset: false,
      usedShield: false,
    };
  }
  if (gap === 1) {
    return { streak: streak + 1, extended: true, reset: false, usedShield: false };
  }
  if (gap === 2 && shields > 0) {
    return { streak: streak + 1, extended: true, reset: false, usedShield: true };
  }
  return { streak: 1, extended: true, reset: true, usedShield: false };
}

export interface StreakView {
  streak: number;
  activeToday: boolean;
  shieldPending: boolean;
}

/** Read-only view of the streak (used for display; never mutates). */
export function effectiveStreak(input: {
  lastActiveDate: string | null;
  today: string;
  streak: number;
  shields: number;
}): StreakView {
  const { lastActiveDate, today, streak, shields } = input;
  if (!lastActiveDate) return { streak: 0, activeToday: false, shieldPending: false };
  const gap = diffDays(lastActiveDate, today);
  if (gap <= 0) return { streak, activeToday: true, shieldPending: false };
  if (gap === 1) return { streak, activeToday: false, shieldPending: false };
  if (gap === 2 && shields > 0)
    return { streak, activeToday: false, shieldPending: true };
  return { streak: 0, activeToday: false, shieldPending: false };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
export interface RewardInput {
  difficulty: Difficulty;
  attribute: Attribute;
  classKey: string;
  streak: number;
  boosted: boolean;
  /** 0..1 – pass Math.random() on the server, 1 for a no-crit preview. */
  critRoll: number;
}

export interface Reward {
  xp: number;
  gold: number;
  crit: boolean;
  affinity: boolean;
  boosted: boolean;
  multiplier: number;
}

export function computeReward(input: RewardInput): Reward {
  const base = DIFFICULTY_META[input.difficulty];
  const affinity =
    isClassKey(input.classKey) && CLASSES[input.classKey].affinity === input.attribute;
  let multiplier = streakMultiplier(input.streak);
  if (affinity) multiplier *= AFFINITY_MULT;
  if (input.boosted) multiplier *= BOOST_MULT;
  const crit = input.critRoll < CRIT_CHANCE;
  const xp = Math.round(base.xp * multiplier * (crit ? CRIT_XP_MULT : 1));
  const gold = Math.round(base.gold * (crit ? CRIT_GOLD_MULT : 1));
  return {
    xp,
    gold,
    crit,
    affinity,
    boosted: input.boosted,
    multiplier: Math.round(multiplier * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------
export const RARITY_META = {
  common: { label: "Common", order: 0 },
  rare: { label: "Rare", order: 1 },
  epic: { label: "Epic", order: 2 },
  legendary: { label: "Legendary", order: 3 },
} as const;
export type Rarity = keyof typeof RARITY_META;

// ---------------------------------------------------------------------------
// Achievements (derived – no table needed)
// ---------------------------------------------------------------------------
export interface AchievementContext {
  totalCompletions: number;
  level: number;
  longestStreak: number;
  gold: number;
  itemsOwned: number;
  attributeLevels: Record<Attribute, number>;
}

export interface AchievementDef {
  key: string;
  name: string;
  icon: string;
  description: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first-blood",
    name: "First Steps",
    icon: "🥾",
    description: "Complete your first quest.",
    check: (c) => c.totalCompletions >= 1,
  },
  {
    key: "ten",
    name: "Getting Serious",
    icon: "📯",
    description: "Complete 10 quests.",
    check: (c) => c.totalCompletions >= 10,
  },
  {
    key: "fifty",
    name: "Guild Regular",
    icon: "🍻",
    description: "Complete 50 quests.",
    check: (c) => c.totalCompletions >= 50,
  },
  {
    key: "hundred",
    name: "Centurion",
    icon: "🏛️",
    description: "Complete 100 quests.",
    check: (c) => c.totalCompletions >= 100,
  },
  {
    key: "streak-3",
    name: "Kindling",
    icon: "🕯️",
    description: "Reach a 3-day streak.",
    check: (c) => c.longestStreak >= 3,
  },
  {
    key: "streak-7",
    name: "Week of Fire",
    icon: "🔥",
    description: "Reach a 7-day streak.",
    check: (c) => c.longestStreak >= 7,
  },
  {
    key: "streak-30",
    name: "Eternal Flame",
    icon: "☄️",
    description: "Reach a 30-day streak.",
    check: (c) => c.longestStreak >= 30,
  },
  {
    key: "level-5",
    name: "Apprentice",
    icon: "🎓",
    description: "Reach level 5.",
    check: (c) => c.level >= 5,
  },
  {
    key: "level-10",
    name: "Adventurer",
    icon: "🗺️",
    description: "Reach level 10.",
    check: (c) => c.level >= 10,
  },
  {
    key: "rich",
    name: "Dragon's Hoard",
    icon: "💰",
    description: "Hold 500 gold at once.",
    check: (c) => c.gold >= 500,
  },
  {
    key: "collector",
    name: "Collector",
    icon: "🧳",
    description: "Own 3 items from the Armory.",
    check: (c) => c.itemsOwned >= 3,
  },
  {
    key: "balanced",
    name: "Renaissance Soul",
    icon: "⚖️",
    description: "Raise every attribute to level 3.",
    check: (c) => ATTRIBUTES.every((a) => c.attributeLevels[a] >= 3),
  },
];

// ---------------------------------------------------------------------------
// Flavour text
// ---------------------------------------------------------------------------
const COMPLETE_LINES = [
  "The guild ledger records your deed.",
  "A small victory. They add up.",
  "Another line in your legend.",
  "The bards will sing of this (quietly).",
  "Steel sharpened. Onward.",
  "Done is better than perfect.",
];

export function flavourLine(seed: number): string {
  return COMPLETE_LINES[Math.abs(seed) % COMPLETE_LINES.length];
}
