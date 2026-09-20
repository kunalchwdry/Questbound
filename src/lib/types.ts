import type {
  Attribute,
  ClassKey,
  Difficulty,
  QuestType,
  Rarity,
} from "./game";

export type ItemCategory = "title" | "theme" | "companion" | "badge" | "consumable";

export interface AttributeState {
  key: Attribute;
  xp: number;
  level: number;
  into: number;
  needed: number;
  progress: number;
}

export interface Achievement {
  key: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
}

export interface Profile {
  id: number;
  displayName: string;
  email: string;
  classKey: ClassKey;
  level: number;
  rank: string;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
  gold: number;
  streak: number;
  longestStreak: number;
  streakActiveToday: boolean;
  shieldPending: boolean;
  lastActiveDate: string | null;
  boostCharges: number;
  shields: number;
  attributes: AttributeState[];
  title: string | null;
  theme: string;
  companion: string | null;
  badges: string[];
  achievements: Achievement[];
  totalCompletions: number;
  today: string;
  joinedAt: string;
  onboarded: boolean;
  bounty: {
    goal: number;
    progress: number;
    claimed: boolean;
    gold: number;
    xp: number;
  };
  boss: {
    weekKey: string;
    name: string;
    icon: string;
    taunt: string;
    hp: number;
    damage: number;
    defeated: boolean;
    claimed: boolean;
    gold: number;
    xp: number;
  };
  heatmap: { day: string; count: number; xp: number }[];
  week: { day: string; xp: number; count: number }[];
  checkins: Checkin[];
  oracleProvider: string | null;
}

export interface Checkin {
  id: number;
  mood: number;
  emotion: string;
  note: string | null;
  day: string;
  createdAt: string;
}

export interface OracleSuggestion {
  title: string;
  attribute: Attribute;
  difficulty: Difficulty;
  type: QuestType;
  why?: string;
}

export interface CompanionMessage {
  id: number;
  role: "user" | "oracle";
  content: string;
  emotion: string | null;
  suggestions: OracleSuggestion[];
  provider: string | null;
  createdAt: string;
  trace?: { step: string; detail: string }[];
}

export interface Quest {
  id: number;
  title: string;
  notes: string | null;
  attribute: Attribute;
  difficulty: Difficulty;
  type: QuestType;
  dueDate: string | null;
  completedAt: string | null;
  lastCompletedOn: string | null;
  timesCompleted: number;
  timesToday: number;
  createdAt: string;
  // ---- InnerLoop adaptive planning (nullable; only set for plan quests) ----
  parentQuestId?: number | null;
  goalId?: number | null;
  estimatedMinutes?: number | null;
  scheduledFor?: string | null;
  scheduledOrder?: number | null;
  planContext?: {
    source?: string;
    energy?: string;
    mood?: string | null;
    size?: string;
    splitFrom?: string;
  } | null;
  questStatus?: "active" | "postponed" | "split";
  /** 1-based position inside a group of siblings created by a split. */
  splitIndex?: number | null;
  /** Total siblings in the split group (for "2 of 3" display). */
  splitTotal?: number | null;
}

export interface HistoryEntry {
  id: number;
  questId: number | null;
  title: string;
  attribute: Attribute;
  difficulty: Difficulty;
  xp: number;
  gold: number;
  crit: boolean;
  multiplierPct: number;
  streakAfter: number;
  completedOn: string;
  completedAt: string;
}

export interface ShopItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  price: number;
  icon: string;
  payload: string | null;
  minLevel: number;
  stackable: boolean;
  maxStack: number;
  owned: boolean;
  quantity: number;
  equipped: boolean;
}

export interface Dashboard {
  profile: Profile;
  quests: Quest[];
  history: HistoryEntry[];
  shop: ShopItem[];
}

export interface CompleteResult {
  reward: {
    xp: number;
    gold: number;
    crit: boolean;
    affinity: boolean;
    boosted: boolean;
    multiplier: number;
  };
  levelUp: { from: number; to: number; bonusGold: number } | null;
  streak: { current: number; extended: boolean; reset: boolean; usedShield: boolean };
  flavour: string;
}

export interface QuestInput {
  title: string;
  notes?: string;
  attribute: Attribute;
  difficulty: Difficulty;
  type: QuestType;
  dueDate?: string | null;
}

// ---------------------------------------------------------------------------
// AI / LLM configuration (public, secret-free shape)
// ---------------------------------------------------------------------------
export type { AiProvider } from "./ai-providers";
import type { AiProvider } from "./ai-providers";

export interface AiConfigPublic {
  provider: AiProvider;
  label: string;
  model: string;
  baseUrl: string;
  /** true = last connection test passed; false = failed; null = untried. */
  connected: boolean | null;
  testedAt: string | null;
  hasApiKey: boolean;
  temperature: number;
  maxTokens: number;
}
