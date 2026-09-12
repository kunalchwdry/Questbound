import type { ClassKey, Attribute, Difficulty, QuestType } from "./game";

export interface StarterQuest {
  title: string;
  notes: string;
  attribute: Attribute;
  difficulty: Difficulty;
  type: QuestType;
}

const SHARED: StarterQuest[] = [
  {
    title: "Drink a glass of water",
    notes: "Tiny habits wire the loop. Seal this daily to light your streak.",
    attribute: "vitality",
    difficulty: "trivial",
    type: "daily",
  },
  {
    title: "Tidy one surface for 5 minutes",
    notes: "A habit you can log whenever the mess stares back (up to 5× a day).",
    attribute: "discipline",
    difficulty: "trivial",
    type: "habit",
  },
  {
    title: "Write three goals for this week",
    notes: "A one-off. Specific beats vague — name the deeds, then post more quests.",
    attribute: "discipline",
    difficulty: "easy",
    type: "once",
  },
];

const BY_CLASS: Record<ClassKey, StarterQuest> = {
  knight: {
    title: "Train your body for 20 minutes",
    notes: "Strength is your class affinity — this daily pays +15% XP.",
    attribute: "strength",
    difficulty: "medium",
    type: "daily",
  },
  mage: {
    title: "Read 10 pages (or study 20 minutes)",
    notes: "Intellect is your class affinity — this daily pays +15% XP.",
    attribute: "intellect",
    difficulty: "easy",
    type: "daily",
  },
  ranger: {
    title: "Walk outside for 15 minutes",
    notes: "Vitality is your class affinity — this daily pays +15% XP.",
    attribute: "vitality",
    difficulty: "easy",
    type: "daily",
  },
  bard: {
    title: "Reach out to someone you care about",
    notes: "Charisma is your class affinity — this daily pays +15% XP.",
    attribute: "charisma",
    difficulty: "easy",
    type: "daily",
  },
  monk: {
    title: "Keep one small promise to yourself",
    notes: "Discipline is your class affinity — this daily pays +15% XP.",
    attribute: "discipline",
    difficulty: "easy",
    type: "daily",
  },
  alchemist: {
    title: "Make something small (sketch, riff, note)",
    notes: "Creativity is your class affinity — this daily pays +15% XP.",
    attribute: "creativity",
    difficulty: "easy",
    type: "daily",
  },
};

export function starterQuestsFor(classKey: ClassKey): StarterQuest[] {
  return [BY_CLASS[classKey], ...SHARED];
}
