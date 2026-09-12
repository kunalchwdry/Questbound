import { and, asc, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { checkins, completions, inventory, items, quests, users } from "@/db/schema";
import { ITEM_CATALOG } from "./catalog";
import { addDays, isoWeekKey, todayInTimeZone, weekStart } from "./dates";
import { getOracleConfig } from "./oracle";
import {
  ACHIEVEMENTS,
  ATTRIBUTES,
  ATTRIBUTE_COLUMNS,
  BOSS_GOLD,
  BOSS_XP,
  BOUNTY_GOAL,
  BOUNTY_GOLD,
  BOUNTY_XP,
  bossForWeek,
  bossHp,
  attributeProgress,
  effectiveStreak,
  isClassKey,
  levelFromXp,
  rankForLevel,
  type Attribute,
} from "./game";
import type {
  AttributeState,
  Dashboard,
  HistoryEntry,
  Profile,
  Quest,
  ShopItem,
} from "./types";

let seeded = false;

/** Idempotently seeds the Armory catalogue. */
export async function ensureItemsSeeded(): Promise<void> {
  if (seeded) return;
  const [{ n }] = await db.select({ n: count() }).from(items);
  if (n < ITEM_CATALOG.length) {
    await db
      .insert(items)
      .values(
        ITEM_CATALOG.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          category: c.category,
          rarity: c.rarity,
          price: c.price,
          icon: c.icon,
          payload: c.payload,
          minLevel: c.minLevel,
          stackable: c.stackable,
          maxStack: c.maxStack,
          sortOrder: c.sortOrder,
        })),
      )
      .onConflictDoNothing({ target: items.slug });
  }
  seeded = true;
}

export async function getDashboard(userId: number): Promise<Dashboard> {
  await ensureItemsSeeded();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");
  const today = todayInTimeZone(user.timezone);

  const [questRows, historyRows, invRows, itemRows, totalRow, todayRows] =
    await Promise.all([
      db
        .select()
        .from(quests)
        .where(eq(quests.userId, userId))
        .orderBy(desc(quests.createdAt)),
      db
        .select()
        .from(completions)
        .where(eq(completions.userId, userId))
        .orderBy(desc(completions.completedAt))
        .limit(40),
      db
        .select({ inv: inventory, item: items })
        .from(inventory)
        .innerJoin(items, eq(inventory.itemId, items.id))
        .where(eq(inventory.userId, userId)),
      db.select().from(items).orderBy(asc(items.sortOrder), asc(items.id)),
      db
        .select({ n: count() })
        .from(completions)
        .where(eq(completions.userId, userId)),
      db
        .select({ questId: completions.questId, n: count() })
        .from(completions)
        .where(
          and(eq(completions.userId, userId), eq(completions.completedOn, today)),
        )
        .groupBy(completions.questId),
    ]);

  const heatStart = addDays(today, -83); // 12 weeks
  const [dayRows, checkinRows] = await Promise.all([
    db
      .select({
        day: completions.completedOn,
        n: count(),
        xp: sum(completions.xp),
      })
      .from(completions)
      .where(and(eq(completions.userId, userId), gte(completions.completedOn, heatStart)))
      .groupBy(completions.completedOn),
    db
      .select()
      .from(checkins)
      .where(eq(checkins.userId, userId))
      .orderBy(desc(checkins.createdAt))
      .limit(30),
  ]);
  const byDay = new Map(dayRows.map((r) => [r.day, { count: Number(r.n), xp: Number(r.xp ?? 0) }]));
  const heatmap: { day: string; count: number; xp: number }[] = [];
  for (let i = 0; i < 84; i++) {
    const day = addDays(heatStart, i);
    const v = byDay.get(day);
    heatmap.push({ day, count: v?.count ?? 0, xp: v?.xp ?? 0 });
  }
  const monday = weekStart(today);
  const week: { day: string; xp: number; count: number }[] = [];
  let weekXp = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const v = byDay.get(day);
    week.push({ day, xp: v?.xp ?? 0, count: v?.count ?? 0 });
    weekXp += v?.xp ?? 0;
  }
  const weekKey = isoWeekKey(today);
  const bossDef = bossForWeek(weekKey);

  const todayCounts = new Map<number, number>();
  for (const row of todayRows) {
    if (row.questId != null) todayCounts.set(row.questId, Number(row.n));
  }

  const equippedPayload = (category: string): string | null =>
    invRows.find((r) => r.item.category === category && r.inv.equipped)?.item
      .payload ?? null;

  const shields =
    invRows.find((r) => r.item.payload === "streak_shield")?.inv.quantity ?? 0;

  const levelState = levelFromXp(user.xp);
  const streakView = effectiveStreak({
    lastActiveDate: user.lastActiveDate,
    today,
    streak: user.streak,
    shields,
  });

  const attributes: AttributeState[] = ATTRIBUTES.map((key) => {
    const xp = user[ATTRIBUTE_COLUMNS[key]];
    const p = attributeProgress(xp);
    return { key, xp, ...p };
  });
  const attributeLevels = Object.fromEntries(
    attributes.map((a) => [a.key, a.level]),
  ) as Record<Attribute, number>;

  const totalCompletions = Number(totalRow[0]?.n ?? 0);
  const achievementCtx = {
    totalCompletions,
    level: levelState.level,
    longestStreak: user.longestStreak,
    gold: user.gold,
    itemsOwned: invRows.length,
    attributeLevels,
  };

  const profile: Profile = {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    classKey: isClassKey(user.classKey) ? user.classKey : "knight",
    level: levelState.level,
    rank: rankForLevel(levelState.level),
    xp: user.xp,
    xpIntoLevel: levelState.xpIntoLevel,
    xpForNext: levelState.xpForNext,
    progress: levelState.progress,
    gold: user.gold,
    streak: streakView.streak,
    longestStreak: user.longestStreak,
    streakActiveToday: streakView.activeToday,
    shieldPending: streakView.shieldPending,
    lastActiveDate: user.lastActiveDate,
    boostCharges: user.boostCharges,
    shields,
    attributes,
    title: equippedPayload("title"),
    theme: equippedPayload("theme") ?? "midnight",
    companion: equippedPayload("companion"),
    badges: invRows
      .filter((r) => r.item.category === "badge")
      .map((r) => r.item.payload ?? r.item.icon),
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      name: a.name,
      icon: a.icon,
      description: a.description,
      unlocked: a.check(achievementCtx),
    })),
    totalCompletions,
    today,
    joinedAt: user.createdAt.toISOString(),
    onboarded: Boolean(user.onboardedAt),
    bounty: {
      goal: BOUNTY_GOAL,
      progress: Math.min(
        BOUNTY_GOAL,
        todayRows.reduce((sum, row) => sum + Number(row.n), 0),
      ),
      claimed: user.lastBountyClaim === today,
      gold: BOUNTY_GOLD,
      xp: BOUNTY_XP,
    },
    boss: {
      weekKey,
      name: bossDef.name,
      icon: bossDef.icon,
      taunt: bossDef.taunt,
      hp: bossHp(levelState.level),
      damage: Math.min(weekXp, bossHp(levelState.level)),
      defeated: weekXp >= bossHp(levelState.level),
      claimed: user.lastBossClaimWeek === weekKey,
      gold: BOSS_GOLD,
      xp: BOSS_XP,
    },
    heatmap,
    week,
    checkins: checkinRows.map((c) => ({
      id: c.id,
      mood: c.mood,
      emotion: c.emotion,
      note: c.note,
      day: c.day,
      createdAt: c.createdAt.toISOString(),
    })),
    oracleProvider: getOracleConfig()?.label ?? null,
  };

  const questList: Quest[] = questRows.map((q) => ({
    id: q.id,
    title: q.title,
    notes: q.notes,
    attribute: q.attribute,
    difficulty: q.difficulty,
    type: q.type,
    dueDate: q.dueDate,
    completedAt: q.completedAt ? q.completedAt.toISOString() : null,
    lastCompletedOn: q.lastCompletedOn,
    timesCompleted: q.timesCompleted,
    timesToday: todayCounts.get(q.id) ?? 0,
    createdAt: q.createdAt.toISOString(),
  }));

  const history: HistoryEntry[] = historyRows.map((c) => ({
    id: c.id,
    questId: c.questId,
    title: c.title,
    attribute: c.attribute,
    difficulty: c.difficulty,
    xp: c.xp,
    gold: c.gold,
    crit: c.crit,
    multiplierPct: c.multiplierPct,
    streakAfter: c.streakAfter,
    completedOn: c.completedOn,
    completedAt: c.completedAt.toISOString(),
  }));

  const shop: ShopItem[] = itemRows.map((it) => {
    const owned = invRows.find((r) => r.item.id === it.id);
    return {
      id: it.id,
      slug: it.slug,
      name: it.name,
      description: it.description,
      category: it.category,
      rarity: it.rarity,
      price: it.price,
      icon: it.icon,
      payload: it.payload,
      minLevel: it.minLevel,
      stackable: it.stackable,
      maxStack: it.maxStack,
      owned: Boolean(owned),
      quantity: owned?.inv.quantity ?? 0,
      equipped: owned?.inv.equipped ?? false,
    };
  });

  return { profile, quests: questList, history, shop };
}

export function serializeQuest(q: typeof quests.$inferSelect, timesToday = 0): Quest {
  return {
    id: q.id,
    title: q.title,
    notes: q.notes,
    attribute: q.attribute,
    difficulty: q.difficulty,
    type: q.type,
    dueDate: q.dueDate,
    completedAt: q.completedAt ? q.completedAt.toISOString() : null,
    lastCompletedOn: q.lastCompletedOn,
    timesCompleted: q.timesCompleted,
    timesToday,
    createdAt: q.createdAt.toISOString(),
  };
}
