import type { ItemCategory } from "./types";
import type { Rarity } from "./game";

export interface CatalogItem {
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
  sortOrder: number;
}

const item = (
  partial: Partial<CatalogItem> & Pick<CatalogItem, "slug" | "name" | "category" | "price" | "icon" | "description">,
  sortOrder: number,
): CatalogItem => ({
  rarity: "common",
  payload: null,
  minLevel: 1,
  stackable: false,
  maxStack: 1,
  ...partial,
  sortOrder,
});

export const ITEM_CATALOG: CatalogItem[] = [
  // Consumables --------------------------------------------------------------
  item(
    {
      slug: "streak-shield",
      name: "Streak Shield",
      category: "consumable",
      rarity: "rare",
      price: 150,
      icon: "🛡️",
      payload: "streak_shield",
      stackable: true,
      maxStack: 3,
      description:
        "Life happens. If you miss a single day, a shield is consumed automatically and your streak survives.",
    },
    0,
  ),
  item(
    {
      slug: "elixir-insight",
      name: "Elixir of Insight",
      category: "consumable",
      rarity: "rare",
      price: 120,
      icon: "⚗️",
      payload: "xp_elixir",
      stackable: true,
      maxStack: 5,
      description: "Drink to double the XP of your next 3 quest completions.",
    },
    1,
  ),
  // Titles -------------------------------------------------------------------
  item(
    {
      slug: "title-diligent",
      name: "Title: the Diligent",
      category: "title",
      price: 60,
      icon: "📛",
      payload: "the Diligent",
      description: "A modest title for a hero who simply shows up.",
    },
    10,
  ),
  item(
    {
      slug: "title-slayer",
      name: "Title: Slayer of Procrastination",
      category: "title",
      rarity: "rare",
      price: 180,
      icon: "🗡️",
      payload: "Slayer of Procrastination",
      minLevel: 3,
      description: "Earned by those who did the thing instead of thinking about it.",
    },
    11,
  ),
  item(
    {
      slug: "title-archmage",
      name: "Title: Archmage of Focus",
      category: "title",
      rarity: "epic",
      price: 420,
      icon: "🧙",
      payload: "Archmage of Focus",
      minLevel: 6,
      description: "Distractions flee before you.",
    },
    12,
  ),
  item(
    {
      slug: "title-legend",
      name: "Title: Legend of the Guild",
      category: "title",
      rarity: "legendary",
      price: 1200,
      icon: "👑",
      payload: "Legend of the Guild",
      minLevel: 12,
      description: "Your name is carved above the guild hall door.",
    },
    13,
  ),
  // Themes -------------------------------------------------------------------
  item(
    {
      slug: "theme-ember",
      name: "Ember Forge",
      category: "theme",
      rarity: "rare",
      price: 220,
      icon: "🔥",
      payload: "ember",
      description: "Warm coals and molten gold. A theme for the forge-hearted.",
    },
    20,
  ),
  item(
    {
      slug: "theme-verdant",
      name: "Verdant Grove",
      category: "theme",
      rarity: "rare",
      price: 220,
      icon: "🌿",
      payload: "verdant",
      description: "Moss, deep forest and fireflies. A calmer guild hall.",
    },
    21,
  ),
  item(
    {
      slug: "theme-arcane",
      name: "Arcane Void",
      category: "theme",
      rarity: "epic",
      price: 380,
      icon: "🌌",
      payload: "arcane",
      minLevel: 4,
      description: "Violet starlight and humming runes.",
    },
    22,
  ),
  item(
    {
      slug: "theme-parchment",
      name: "Dawn Parchment",
      category: "theme",
      rarity: "rare",
      price: 260,
      icon: "📜",
      payload: "parchment",
      description: "A bright, paper-and-ink light theme for daytime questing.",
    },
    23,
  ),
  // Companions ---------------------------------------------------------------
  item(
    {
      slug: "companion-cat",
      name: "Hearth Cat",
      category: "companion",
      price: 110,
      icon: "🐈‍⬛",
      payload: "🐈‍⬛",
      description: "Sits on your keyboard. Judges you gently.",
    },
    30,
  ),
  item(
    {
      slug: "companion-owl",
      name: "Owl Familiar",
      category: "companion",
      price: 140,
      icon: "🦉",
      payload: "🦉",
      description: "Wise, nocturnal, disapproves of doom-scrolling.",
    },
    31,
  ),
  item(
    {
      slug: "companion-fox",
      name: "Ember Fox",
      category: "companion",
      rarity: "rare",
      price: 160,
      icon: "🦊",
      payload: "🦊",
      description: "Quick, clever, and always up for a walk.",
    },
    32,
  ),
  item(
    {
      slug: "companion-dragon",
      name: "Dragon Whelp",
      category: "companion",
      rarity: "epic",
      price: 650,
      icon: "🐉",
      payload: "🐉",
      minLevel: 8,
      description: "Small now. Give it a few hundred quests.",
    },
    33,
  ),
  // Badges -------------------------------------------------------------------
  item(
    {
      slug: "badge-iron",
      name: "Crest of Iron",
      category: "badge",
      price: 90,
      icon: "⚙️",
      payload: "⚙️",
      description: "A badge for the profile of someone who lifts heavy things.",
    },
    40,
  ),
  item(
    {
      slug: "badge-wisdom",
      name: "Crest of Wisdom",
      category: "badge",
      price: 90,
      icon: "📖",
      payload: "📖",
      description: "Displayed proudly by scholars of the guild.",
    },
    41,
  ),
  item(
    {
      slug: "badge-phoenix",
      name: "Phoenix Sigil",
      category: "badge",
      rarity: "epic",
      price: 300,
      icon: "🔱",
      payload: "🔱",
      minLevel: 5,
      description: "For heroes who rose again after a broken streak.",
    },
    42,
  ),
];
