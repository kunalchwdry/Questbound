/**
 * InnerLoop — quest sizing.
 *
 * Deterministic mapping from (size bucket) ⇄ (difficulty, minutes).
 * Everything here is pure; side-effect free. Used by both the planning
 * engine and the client UI.
 */
import {
  DIFFICULTIES,
  type Attribute,
  type Difficulty,
} from "../game";

export type Energy = "high" | "medium" | "low";
export type MoodTag =
  | "calm"
  | "focused"
  | "tired"
  | "anxious"
  | "overwhelmed"
  | "frustrated"
  | "neutral";
export type SizeBucket = "tiny" | "small" | "medium" | "large" | "epic";

export interface SizeMeta {
  bucket: SizeBucket;
  /** Suggested Questbound difficulty that best matches this size. */
  difficulty: Difficulty;
  /** Nominal duration in minutes. */
  minutes: number;
  /** Acceptable min/max duration for the bucket. */
  minMinutes: number;
  maxMinutes: number;
  label: string;
}

export const SIZE_BUCKETS: Record<SizeBucket, SizeMeta> = {
  tiny: {
    bucket: "tiny",
    difficulty: "trivial",
    minutes: 10,
    minMinutes: 5,
    maxMinutes: 15,
    label: "Tiny",
  },
  small: {
    bucket: "small",
    difficulty: "easy",
    minutes: 20,
    minMinutes: 15,
    maxMinutes: 30,
    label: "Small",
  },
  medium: {
    bucket: "medium",
    difficulty: "medium",
    minutes: 45,
    minMinutes: 30,
    maxMinutes: 60,
    label: "Medium",
  },
  large: {
    bucket: "large",
    difficulty: "hard",
    minutes: 90,
    minMinutes: 60,
    maxMinutes: 120,
    label: "Large",
  },
  epic: {
    bucket: "epic",
    difficulty: "epic",
    minutes: 150,
    minMinutes: 120,
    maxMinutes: 600,
    label: "Epic",
  },
};

/** Map a difficulty to its default InnerLoop size (best-effort; can be overridden by estimatedMinutes). */
export function sizeFromDifficulty(diff: Difficulty): SizeMeta {
  switch (diff) {
    case "trivial":
      return SIZE_BUCKETS.tiny;
    case "easy":
      return SIZE_BUCKETS.small;
    case "medium":
      return SIZE_BUCKETS.medium;
    case "hard":
      return SIZE_BUCKETS.large;
    case "epic":
      return SIZE_BUCKETS.epic;
  }
}

/** Map a duration in minutes to the closest size bucket. */
export function sizeFromMinutes(mins: number): SizeMeta {
  const m = Math.max(5, Math.min(600, Math.round(mins)));
  const ordered: SizeBucket[] = ["tiny", "small", "medium", "large", "epic"];
  let best = SIZE_BUCKETS.tiny;
  let bestDist = Infinity;
  for (const k of ordered) {
    const s = SIZE_BUCKETS[k];
    if (m >= s.minMinutes && m <= s.maxMinutes) return s;
    const d = Math.min(Math.abs(m - s.minMinutes), Math.abs(m - s.maxMinutes));
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/** Choose difficulty for a given number of minutes. */
export function difficultyForMinutes(mins: number): Difficulty {
  return sizeFromMinutes(mins).difficulty;
}

/**
 * Which size buckets are appropriate given energy and mood.
 * Overwhelmed/tired/anxious push sizes downward; high/focused allows bigger.
 */
export function allowedSizes(energy: Energy, mood?: MoodTag | null): SizeBucket[] {
  if (mood === "overwhelmed") return ["tiny"];
  if (mood === "anxious" || mood === "frustrated") return ["tiny", "small"];
  if (energy === "low" || mood === "tired") return ["tiny", "small", "medium"];
  if (energy === "high" || mood === "focused")
    return ["small", "medium", "large", "epic"];
  // medium energy / calm / neutral / default
  return ["tiny", "small", "medium", "large"];
}

/**
 * Given an available time budget (minutes) and the user's energy/mood, return
 * a deterministic pack of size buckets that fills the budget realistically.
 * Uses a simple greedy: largest allowed first, then fills gaps with smaller.
 * Always leaves ~10% slack to avoid over-booking.
 */
export function packBudget(input: {
  availableMinutes: number;
  energy: Energy;
  mood?: MoodTag | null;
}): SizeBucket[] {
  const { availableMinutes, energy, mood } = input;
  const effective = Math.max(10, Math.floor(availableMinutes * 0.9)); // slack
  const allowed = allowedSizes(energy, mood);
  // Order allowed buckets by descending minutes for greedy packing
  const ordered = [...allowed].sort(
    (a, b) => SIZE_BUCKETS[b].minutes - SIZE_BUCKETS[a].minutes,
  );
  const result: SizeBucket[] = [];
  let remaining = effective;
  // Don't schedule more than 5 quests in a day (cognitive cap)
  for (let i = 0; i < 5 && remaining > 0; i++) {
    // Pick the largest bucket whose minutes fit; if nothing fits, fall through to smallest.
    const pick =
      ordered.find((b) => SIZE_BUCKETS[b].minutes <= remaining) ??
      ordered[ordered.length - 1];
    const meta = SIZE_BUCKETS[pick];
    // If only tiny is left and we've used 4 quests already, let the small remainder go.
    if (remaining < meta.minMinutes && result.length > 0) break;
    result.push(pick);
    remaining -= meta.minutes;
    // After picking a "large" in medium energy, prefer smaller companions.
    if (pick === "large" && energy !== "high") {
      // close out large options for this pack
      const idx = ordered.indexOf("large");
      if (idx >= 0) ordered.splice(idx, 1);
    }
  }
  return result;
}

/** Default attribute heuristic if the AI doesn't specify one. */
export function defaultAttributeForGoal(goal: string): Attribute {
  const g = goal.toLowerCase();
  if (/(study|learn|read|code|math|ml|ai|research|school|exam|class)/.test(g))
    return "intellect";
  if (/(gym|run|workout|walk|stretch|sport|swim|lift)/.test(g)) return "strength";
  if (/(sleep|eat|cook|water|meditate|rest|walk outside)/.test(g))
    return "vitality";
  if (/(call|friend|email|message|network|interview|talk)/.test(g))
    return "charisma";
  if (/(clean|tidy|budget|organize|plan|inbox|chore|errand)/.test(g))
    return "discipline";
  if (/(write|draw|paint|music|design|create|sketch|practice guitar)/.test(g))
    return "creativity";
  return "discipline";
}

/** Splits a size bucket into N child buckets that sum (approximately) to it. */
export function splitSize(bucket: SizeBucket, into = 3): SizeBucket[] {
  const parent = SIZE_BUCKETS[bucket];
  const perTarget = parent.minutes / into;
  // Pick a single smaller bucket for the children, rounding down.
  const childSize = sizeFromMinutes(perTarget);
  return Array.from({ length: into }, () => childSize.bucket);
}

export { DIFFICULTIES };
