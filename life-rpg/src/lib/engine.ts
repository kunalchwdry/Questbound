import { and, count, eq, gte, sum } from "drizzle-orm";
import { db } from "@/db";
import { checkins, completions, inventory, items, quests, users } from "@/db/schema";
import { ApiError } from "./api";
import { isValidTimeZone, isoWeekKey, todayInTimeZone, weekStart } from "./dates";
import { classifyEmotion, fallbackReply, type Emotion } from "./emotion";
import {
  ATTRIBUTE_COLUMNS,
  BOSS_GOLD,
  BOSS_XP,
  bossForWeek,
  bossHp,
  BOUNTY_GOAL,
  BOUNTY_GOLD,
  BOUNTY_XP,
  ELIXIR_CHARGES,
  HABIT_DAILY_CAP,
  LEVEL_UP_GOLD,
  advanceStreak,
  computeReward,
  flavourLine,
  isClassKey,
  levelFromXp,
  type Attribute,
  type ClassKey,
} from "./game";
import type { CompleteResult } from "./types";

type AttrColumn = (typeof ATTRIBUTE_COLUMNS)[Attribute];

/**
 * Authoritative quest completion. Runs in a transaction with row locks so two
 * concurrent taps cannot double-claim a reward.
 */
export async function completeQuest(
  userId: number,
  questId: number,
): Promise<CompleteResult> {
  return db.transaction(async (tx) => {
    const [hero] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!hero) throw new ApiError("Hero not found", 404);

    const [quest] = await tx
      .select()
      .from(quests)
      .where(and(eq(quests.id, questId), eq(quests.userId, userId)))
      .for("update");
    if (!quest) throw new ApiError("Quest not found", 404);

    const today = todayInTimeZone(hero.timezone);

    if (quest.type === "once" && quest.completedAt) {
      throw new ApiError("That quest is already complete.", 409);
    }
    if (quest.type === "daily" && quest.lastCompletedOn === today) {
      throw new ApiError("Already done today — this daily returns at dawn.", 409);
    }
    if (quest.type === "habit") {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(completions)
        .where(
          and(eq(completions.questId, quest.id), eq(completions.completedOn, today)),
        );
      if (Number(n) >= HABIT_DAILY_CAP) {
        throw new ApiError(
          `A habit can be logged ${HABIT_DAILY_CAP} times a day. Rest, hero.`,
          409,
        );
      }
    }

    const shieldRows = await tx
      .select({ id: inventory.id, quantity: inventory.quantity })
      .from(inventory)
      .innerJoin(items, eq(inventory.itemId, items.id))
      .where(and(eq(inventory.userId, userId), eq(items.payload, "streak_shield")))
      .limit(1);
    const shield = shieldRows[0];

    const streak = advanceStreak({
      lastActiveDate: hero.lastActiveDate,
      today,
      streak: hero.streak,
      shields: shield?.quantity ?? 0,
    });

    const boosted = hero.boostCharges > 0;
    const reward = computeReward({
      difficulty: quest.difficulty,
      attribute: quest.attribute,
      classKey: hero.classKey,
      streak: streak.streak,
      boosted,
      critRoll: Math.random(),
    });

    const before = levelFromXp(hero.xp);
    const after = levelFromXp(hero.xp + reward.xp);
    const levelUp =
      after.level > before.level
        ? { from: before.level, to: after.level, bonusGold: LEVEL_UP_GOLD * after.level }
        : null;

    const attrCol: AttrColumn = ATTRIBUTE_COLUMNS[quest.attribute];
    const attrUpdate = {
      [attrCol]: hero[attrCol] + reward.xp,
    } as Partial<Record<AttrColumn, number>>;

    await tx
      .update(users)
      .set({
        xp: hero.xp + reward.xp,
        gold: hero.gold + reward.gold + (levelUp?.bonusGold ?? 0),
        streak: streak.streak,
        longestStreak: Math.max(hero.longestStreak, streak.streak),
        lastActiveDate: today,
        boostCharges: boosted ? hero.boostCharges - 1 : hero.boostCharges,
        ...attrUpdate,
      })
      .where(eq(users.id, userId));

    await tx
      .update(quests)
      .set({
        completedAt: quest.type === "once" ? new Date() : quest.completedAt,
        lastCompletedOn: today,
        timesCompleted: quest.timesCompleted + 1,
        updatedAt: new Date(),
      })
      .where(eq(quests.id, quest.id));

    await tx.insert(completions).values({
      userId,
      questId: quest.id,
      title: quest.title,
      attribute: quest.attribute,
      difficulty: quest.difficulty,
      xp: reward.xp,
      gold: reward.gold,
      crit: reward.crit,
      multiplierPct: Math.round(reward.multiplier * 100),
      streakAfter: streak.streak,
      completedOn: today,
    });

    if (streak.usedShield && shield) {
      if (shield.quantity <= 1) {
        await tx.delete(inventory).where(eq(inventory.id, shield.id));
      } else {
        await tx
          .update(inventory)
          .set({ quantity: shield.quantity - 1 })
          .where(eq(inventory.id, shield.id));
      }
    }

    return {
      reward: {
        xp: reward.xp,
        gold: reward.gold,
        crit: reward.crit,
        affinity: reward.affinity,
        boosted: reward.boosted,
        multiplier: reward.multiplier,
      },
      levelUp,
      streak: {
        current: streak.streak,
        extended: streak.extended,
        reset: streak.reset,
        usedShield: streak.usedShield,
      },
      flavour: flavourLine(quest.id + hero.xp),
    };
  });
}

export async function purchaseItem(
  userId: number,
  itemId: number,
): Promise<{ message: string }> {
  return db.transaction(async (tx) => {
    const [hero] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!hero) throw new ApiError("Hero not found", 404);

    const [item] = await tx.select().from(items).where(eq(items.id, itemId));
    if (!item) throw new ApiError("That item is not for sale.", 404);

    const { level } = levelFromXp(hero.xp);
    if (level < item.minLevel) {
      throw new ApiError(`The merchant eyes you: "Come back at level ${item.minLevel}."`, 403);
    }

    const [existing] = await tx
      .select()
      .from(inventory)
      .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));

    if (existing && !item.stackable) {
      throw new ApiError("You already own this.", 409);
    }
    if (existing && existing.quantity >= item.maxStack) {
      throw new ApiError(`You can carry at most ${item.maxStack} of these.`, 409);
    }
    if (hero.gold < item.price) {
      throw new ApiError(
        `Not enough gold — you need ${item.price - hero.gold} more.`,
        402,
      );
    }

    await tx
      .update(users)
      .set({ gold: hero.gold - item.price })
      .where(eq(users.id, userId));

    if (existing) {
      await tx
        .update(inventory)
        .set({ quantity: existing.quantity + 1 })
        .where(eq(inventory.id, existing.id));
    } else {
      let equipped = false;
      if (
        item.category === "title" ||
        item.category === "theme" ||
        item.category === "companion"
      ) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(inventory)
          .innerJoin(items, eq(inventory.itemId, items.id))
          .where(
            and(
              eq(inventory.userId, userId),
              eq(inventory.equipped, true),
              eq(items.category, item.category),
            ),
          );
        equipped = Number(n) === 0;
      }
      await tx.insert(inventory).values({ userId, itemId, quantity: 1, equipped });
    }

    return { message: `${item.name} is yours.` };
  });
}

export async function equipItem(
  userId: number,
  itemId: number,
): Promise<{ message: string; equipped: boolean }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ inv: inventory, item: items })
      .from(inventory)
      .innerJoin(items, eq(inventory.itemId, items.id))
      .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
    const target = rows[0];
    if (!target) throw new ApiError("You don't own that yet.", 404);
    const category = target.item.category;
    if (category !== "title" && category !== "theme" && category !== "companion") {
      throw new ApiError("That item is always on display.", 400);
    }

    const nowEquipped = !target.inv.equipped;

    const sameCategory = await tx
      .select({ id: inventory.id })
      .from(inventory)
      .innerJoin(items, eq(inventory.itemId, items.id))
      .where(and(eq(inventory.userId, userId), eq(items.category, category)));

    for (const row of sameCategory) {
      await tx
        .update(inventory)
        .set({ equipped: nowEquipped && row.id === target.inv.id })
        .where(eq(inventory.id, row.id));
    }

    return {
      message: nowEquipped ? `${target.item.name} equipped.` : `${target.item.name} unequipped.`,
      equipped: nowEquipped,
    };
  });
}

export async function useItem(
  userId: number,
  itemId: number,
): Promise<{ message: string }> {
  return db.transaction(async (tx) => {
    const [hero] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!hero) throw new ApiError("Hero not found", 404);

    const rows = await tx
      .select({ inv: inventory, item: items })
      .from(inventory)
      .innerJoin(items, eq(inventory.itemId, items.id))
      .where(and(eq(inventory.userId, userId), eq(inventory.itemId, itemId)));
    const target = rows[0];
    if (!target) throw new ApiError("You don't own that.", 404);
    if (target.item.category !== "consumable") {
      throw new ApiError("That item can't be consumed.", 400);
    }
    if (target.item.payload === "streak_shield") {
      throw new ApiError("Streak Shields activate on their own when you need them.", 400);
    }
    if (target.item.payload !== "xp_elixir") {
      throw new ApiError("Nothing happens.", 400);
    }

    await tx
      .update(users)
      .set({ boostCharges: hero.boostCharges + ELIXIR_CHARGES })
      .where(eq(users.id, userId));

    if (target.inv.quantity <= 1) {
      await tx.delete(inventory).where(eq(inventory.id, target.inv.id));
    } else {
      await tx
        .update(inventory)
        .set({ quantity: target.inv.quantity - 1 })
        .where(eq(inventory.id, target.inv.id));
    }

    return {
      message: `You drink the elixir. Your next ${ELIXIR_CHARGES} quests grant double XP.`,
    };
  });
}

export async function claimBounty(userId: number): Promise<{
  xp: number;
  gold: number;
  levelUp: { from: number; to: number; bonusGold: number } | null;
}> {
  return db.transaction(async (tx) => {
    const [hero] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!hero) throw new ApiError("Hero not found", 404);

    const today = todayInTimeZone(hero.timezone);
    if (hero.lastBountyClaim === today) {
      throw new ApiError("Today's guild contract is already claimed.", 409);
    }

    const [{ n }] = await tx
      .select({ n: count() })
      .from(completions)
      .where(and(eq(completions.userId, userId), eq(completions.completedOn, today)));
    if (Number(n) < BOUNTY_GOAL) {
      throw new ApiError(
        `Seal ${BOUNTY_GOAL - Number(n)} more quest${BOUNTY_GOAL - Number(n) === 1 ? "" : "s"} today first.`,
        409,
      );
    }

    const before = levelFromXp(hero.xp);
    const after = levelFromXp(hero.xp + BOUNTY_XP);
    const levelUp =
      after.level > before.level
        ? { from: before.level, to: after.level, bonusGold: LEVEL_UP_GOLD * after.level }
        : null;

    await tx
      .update(users)
      .set({
        xp: hero.xp + BOUNTY_XP,
        gold: hero.gold + BOUNTY_GOLD + (levelUp?.bonusGold ?? 0),
        lastBountyClaim: today,
      })
      .where(eq(users.id, userId));

    return { xp: BOUNTY_XP, gold: BOUNTY_GOLD, levelUp };
  });
}

export async function claimBoss(userId: number): Promise<{
  xp: number;
  gold: number;
  name: string;
  levelUp: { from: number; to: number; bonusGold: number } | null;
}> {
  return db.transaction(async (tx) => {
    const [hero] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!hero) throw new ApiError("Hero not found", 404);
    const today = todayInTimeZone(hero.timezone);
    const weekKey = isoWeekKey(today);
    if (hero.lastBossClaimWeek === weekKey) {
      throw new ApiError("This week's boss is already slain.", 409);
    }
    const monday = weekStart(today);
    const [{ xp }] = await tx
      .select({ xp: sum(completions.xp) })
      .from(completions)
      .where(and(eq(completions.userId, userId), gte(completions.completedOn, monday)));
    const level = levelFromXp(hero.xp).level;
    const hp = bossHp(level);
    const dealt = Number(xp ?? 0);
    if (dealt < hp) {
      throw new ApiError(`The boss still has ${hp - dealt} HP. Earn that much XP this week.`, 409);
    }
    const before = levelFromXp(hero.xp);
    const after = levelFromXp(hero.xp + BOSS_XP);
    const levelUp =
      after.level > before.level
        ? { from: before.level, to: after.level, bonusGold: LEVEL_UP_GOLD * after.level }
        : null;
    await tx
      .update(users)
      .set({
        xp: hero.xp + BOSS_XP,
        gold: hero.gold + BOSS_GOLD + (levelUp?.bonusGold ?? 0),
        lastBossClaimWeek: weekKey,
      })
      .where(eq(users.id, userId));
    return { xp: BOSS_XP, gold: BOSS_GOLD, name: bossForWeek(weekKey).name, levelUp };
  });
}

export async function recordCheckin(
  userId: number,
  input: { mood: number; note?: string },
): Promise<{ emotion: Emotion; confidence: number; reply: string }> {
  const [hero] = await db.select().from(users).where(eq(users.id, userId));
  if (!hero) throw new ApiError("Hero not found", 404);
  const today = todayInTimeZone(hero.timezone);
  const text = input.note?.trim() ?? "";
  // Blend the numeric mood with the text model so a bare "2/5" still gets a label.
  const moodEmotion: Emotion =
    input.mood <= 1 ? "sad" : input.mood === 2 ? "tired" : input.mood === 3 ? "neutral" : input.mood === 4 ? "calm" : "joy";
  const pred = text.length > 3 ? classifyEmotion(text) : { emotion: moodEmotion, confidence: 0.5 };
  const emotion = text.length > 3 && pred.confidence >= 0.35 ? pred.emotion : moodEmotion;
  await db.insert(checkins).values({
    userId,
    mood: input.mood,
    emotion,
    note: text || null,
    day: today,
  });
  const reply = fallbackReply({
    emotion,
    name: hero.displayName,
    openQuests: 0,
    streak: hero.streak,
    streakAtRisk: hero.lastActiveDate !== today && hero.streak > 0,
  });
  return { emotion, confidence: pred.confidence, reply };
}

export async function updateHero(
  userId: number,
  patch: {
    displayName?: string;
    classKey?: string;
    timezone?: string;
    onboarded?: boolean;
  },
): Promise<void> {
  const [hero] = await db.select().from(users).where(eq(users.id, userId));
  if (!hero) throw new ApiError("Hero not found", 404);

  const next: Partial<typeof users.$inferInsert> = {};
  if (patch.displayName !== undefined) next.displayName = patch.displayName;
  if (patch.classKey !== undefined) {
    if (!isClassKey(patch.classKey)) throw new ApiError("Unknown class", 422);
    next.classKey = patch.classKey as ClassKey;
  }
  if (patch.timezone !== undefined && isValidTimeZone(patch.timezone)) {
    next.timezone = patch.timezone;
  }
  if (patch.onboarded === true && !hero.onboardedAt) {
    next.onboardedAt = new Date();
  }
  if (Object.keys(next).length === 0) return;
  await db.update(users).set(next).where(eq(users.id, userId));
}
