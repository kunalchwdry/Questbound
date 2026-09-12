"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastInput } from "@/components/ui/Toast";
import { api } from "@/lib/client-api";
import {
  HABIT_DAILY_CAP,
  advanceStreak,
  attributeProgress,
  computeReward,
  isClassKey,
  levelFromXp,
  rankForLevel,
  streakMultiplier,
  type ClassKey,
  type Reward,
} from "@/lib/game";
import type {
  CompleteResult,
  Dashboard,
  ItemCategory,
  Profile,
  Quest,
  QuestInput,
  ShopItem,
} from "@/lib/types";

export interface RewardFloat {
  id: number;
  questId: number;
  xp: number;
  gold: number;
  boosted: boolean;
}

export interface LevelUpEvent {
  from: number;
  to: number;
  bonusGold: number;
  rank: string;
}

interface Options {
  toast: (input: ToastInput) => void;
  announce: (message: string) => void;
  onLevelUp: (event: LevelUpEvent) => void;
}

export function isQuestDone(q: Quest, today: string): boolean {
  if (q.type === "once") return q.completedAt !== null;
  if (q.type === "daily") return q.lastCompletedOn === today;
  return q.timesToday >= HABIT_DAILY_CAP;
}

/** Client-side estimate of what a completion will pay (no crit). */
export function previewReward(
  profile: Profile,
  quest: Pick<Quest, "difficulty" | "attribute">,
): Reward {
  const next = advanceStreak({
    lastActiveDate: profile.lastActiveDate,
    today: profile.today,
    streak: profile.streak,
    shields: profile.shields,
  });
  return computeReward({
    difficulty: quest.difficulty,
    attribute: quest.attribute,
    classKey: profile.classKey,
    streak: next.streak,
    boosted: profile.boostCharges > 0,
    critRoll: 1,
  });
}

const EQUIPPABLE: ItemCategory[] = ["title", "theme", "companion"];

function deriveCosmetics(shop: ShopItem[]) {
  const equipped = (cat: ItemCategory) =>
    shop.find((i) => i.category === cat && i.equipped)?.payload ?? null;
  return {
    title: equipped("title"),
    theme: equipped("theme") ?? "midnight",
    companion: equipped("companion"),
    badges: shop
      .filter((i) => i.category === "badge" && i.owned)
      .map((i) => i.payload ?? i.icon),
    shields: shop.find((i) => i.payload === "streak_shield")?.quantity ?? 0,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Please try again.";
}

export function useGuild(initial: Dashboard, options: Options) {
  const [data, setDataState] = useState<Dashboard>(initial);
  const dataRef = useRef<Dashboard>(initial);
  const inflight = useRef(0);
  const floatSeq = useRef(0);
  const optionsRef = useRef(options);
  const [pendingQuests, setPendingQuests] = useState<Set<number>>(new Set());
  const [busyItems, setBusyItems] = useState<Set<number>>(new Set());
  const [floats, setFloats] = useState<RewardFloat[]>([]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const setData = useCallback(
    (next: Dashboard | ((prev: Dashboard) => Dashboard)) => {
      const value = typeof next === "function" ? next(dataRef.current) : next;
      dataRef.current = value;
      setDataState(value);
    },
    [],
  );

  /** Only trust a server snapshot when nothing else is still in flight. */
  const applyServer = useCallback(
    (dashboard: Dashboard) => {
      if (inflight.current <= 1) setData(dashboard);
    },
    [setData],
  );

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Dashboard>("/api/dashboard");
      if (inflight.current === 0) setData(fresh);
    } catch {
      /* stay on the optimistic state; the next action will resync */
    }
  }, [setData]);

  const markPending = (id: number, on: boolean) =>
    setPendingQuests((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const markBusyItem = (id: number, on: boolean) =>
    setBusyItems((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // -------------------------------------------------------------------------
  // Complete a quest (optimistic XP/gold/streak, authoritative reconcile)
  // -------------------------------------------------------------------------
  const completeQuest = useCallback(
    async (questId: number) => {
      const snapshot = dataRef.current;
      const quest = snapshot.quests.find((q) => q.id === questId);
      if (!quest || questId < 0) return;
      if (isQuestDone(quest, snapshot.profile.today)) return;

      const p = snapshot.profile;
      const nextStreak = advanceStreak({
        lastActiveDate: p.lastActiveDate,
        today: p.today,
        streak: p.streak,
        shields: p.shields,
      });
      const est = computeReward({
        difficulty: quest.difficulty,
        attribute: quest.attribute,
        classKey: p.classKey,
        streak: nextStreak.streak,
        boosted: p.boostCharges > 0,
        critRoll: 1,
      });
      const newXp = p.xp + est.xp;
      const ls = levelFromXp(newXp);
      const nowIso = new Date().toISOString();

      setData((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          xp: newXp,
          level: ls.level,
          rank: rankForLevel(ls.level),
          xpIntoLevel: ls.xpIntoLevel,
          xpForNext: ls.xpForNext,
          progress: ls.progress,
          gold: prev.profile.gold + est.gold,
          streak: nextStreak.streak,
          streakActiveToday: true,
          lastActiveDate: prev.profile.today,
          boostCharges: est.boosted
            ? Math.max(0, prev.profile.boostCharges - 1)
            : prev.profile.boostCharges,
          attributes: prev.profile.attributes.map((a) =>
            a.key === quest.attribute
              ? { ...a, xp: a.xp + est.xp, ...attributeProgress(a.xp + est.xp) }
              : a,
          ),
          totalCompletions: prev.profile.totalCompletions + 1,
          bounty: {
            ...prev.profile.bounty,
            progress: Math.min(
              prev.profile.bounty.goal,
              prev.profile.bounty.progress + 1,
            ),
          },
        },
        quests: prev.quests.map((q) =>
          q.id === questId
            ? {
                ...q,
                completedAt: q.type === "once" ? nowIso : q.completedAt,
                lastCompletedOn: prev.profile.today,
                timesCompleted: q.timesCompleted + 1,
                timesToday: q.timesToday + 1,
              }
            : q,
        ),
        history: [
          {
            id: -Date.now(),
            questId,
            title: quest.title,
            attribute: quest.attribute,
            difficulty: quest.difficulty,
            xp: est.xp,
            gold: est.gold,
            crit: false,
            multiplierPct: Math.round(est.multiplier * 100),
            streakAfter: nextStreak.streak,
            completedOn: prev.profile.today,
            completedAt: nowIso,
          },
          ...prev.history,
        ],
      }));

      const floatId = ++floatSeq.current;
      setFloats((f) => [
        ...f,
        { id: floatId, questId, xp: est.xp, gold: est.gold, boosted: est.boosted },
      ]);
      window.setTimeout(
        () => setFloats((f) => f.filter((x) => x.id !== floatId)),
        1500,
      );

      markPending(questId, true);
      inflight.current += 1;
      try {
        const res = await api<{ result: CompleteResult; dashboard: Dashboard }>(
          `/api/quests/${questId}/complete`,
          { method: "POST" },
        );
        applyServer(res.dashboard);
        const { reward, streak, levelUp, flavour } = res.result;
        const o = optionsRef.current;
        o.announce(
          `${quest.title} complete. Gained ${reward.xp} experience and ${reward.gold} gold.`,
        );
        if (reward.crit) {
          o.toast({
            title: "Critical hit!",
            body: `Double gold and 1.5× XP — +${reward.xp} XP, +${reward.gold} gold.`,
            variant: "gold",
          });
        }
        if (streak.usedShield) {
          o.toast({
            title: "Streak Shield consumed",
            body: "You missed a day, but your streak survived.",
            variant: "info",
          });
        }
        if (streak.extended && !streak.reset && streak.current > 1) {
          o.toast({
            title: `${streak.current}-day streak!`,
            body: `${flavour} XP multiplier is now ×${streakMultiplier(streak.current).toFixed(2)}.`,
          });
        } else if (streak.reset && p.longestStreak > 1) {
          o.toast({
            title: "A new streak begins",
            body: "Day one again. The Phoenix Sigil was made for this.",
            variant: "info",
          });
        }
        if (levelUp) {
          o.onLevelUp({ ...levelUp, rank: rankForLevel(levelUp.to) });
        }
      } catch (err) {
        setData(snapshot);
        optionsRef.current.toast({
          title: "Couldn't seal that quest",
          body: errorMessage(err),
          variant: "danger",
        });
        void refresh();
      } finally {
        inflight.current -= 1;
        markPending(questId, false);
      }
    },
    [applyServer, refresh, setData],
  );

  // -------------------------------------------------------------------------
  // Quest CRUD
  // -------------------------------------------------------------------------
  const createQuest = useCallback(
    async (input: QuestInput): Promise<boolean> => {
      const tempId = -Date.now();
      const optimistic: Quest = {
        id: tempId,
        title: input.title,
        notes: input.notes ? input.notes : null,
        attribute: input.attribute,
        difficulty: input.difficulty,
        type: input.type,
        dueDate: input.dueDate ?? null,
        completedAt: null,
        lastCompletedOn: null,
        timesCompleted: 0,
        timesToday: 0,
        createdAt: new Date().toISOString(),
      };
      setData((prev) => ({ ...prev, quests: [optimistic, ...prev.quests] }));
      try {
        const res = await api<{ quest: Quest }>("/api/quests", {
          method: "POST",
          body: JSON.stringify(input),
        });
        setData((prev) => ({
          ...prev,
          quests: prev.quests.map((q) => (q.id === tempId ? res.quest : q)),
        }));
        optionsRef.current.announce(`Quest posted: ${res.quest.title}`);
        return true;
      } catch (err) {
        setData((prev) => ({
          ...prev,
          quests: prev.quests.filter((q) => q.id !== tempId),
        }));
        optionsRef.current.toast({
          title: "The quest wasn't posted",
          body: errorMessage(err),
          variant: "danger",
        });
        return false;
      }
    },
    [setData],
  );

  const updateQuest = useCallback(
    async (id: number, patch: Partial<QuestInput>): Promise<boolean> => {
      const previous = dataRef.current.quests.find((q) => q.id === id);
      if (!previous || id < 0) return false;
      setData((prev) => ({
        ...prev,
        quests: prev.quests.map((q) =>
          q.id === id
            ? {
                ...q,
                ...patch,
                notes: patch.notes !== undefined ? patch.notes || null : q.notes,
                dueDate: patch.dueDate !== undefined ? (patch.dueDate ?? null) : q.dueDate,
              }
            : q,
        ),
      }));
      try {
        const res = await api<{ quest: Quest }>(`/api/quests/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setData((prev) => ({
          ...prev,
          quests: prev.quests.map((q) =>
            q.id === id ? { ...res.quest, timesToday: q.timesToday } : q,
          ),
        }));
        optionsRef.current.announce("Quest updated.");
        return true;
      } catch (err) {
        setData((prev) => ({
          ...prev,
          quests: prev.quests.map((q) => (q.id === id ? previous : q)),
        }));
        optionsRef.current.toast({
          title: "Changes weren't saved",
          body: errorMessage(err),
          variant: "danger",
        });
        return false;
      }
    },
    [setData],
  );

  const deleteQuest = useCallback(
    async (id: number) => {
      const current = dataRef.current;
      const index = current.quests.findIndex((q) => q.id === id);
      if (index < 0 || id < 0) return;
      const removed = current.quests[index];
      setData((prev) => ({ ...prev, quests: prev.quests.filter((q) => q.id !== id) }));
      try {
        await api(`/api/quests/${id}`, { method: "DELETE" });
        optionsRef.current.announce(`Quest abandoned: ${removed.title}`);
      } catch (err) {
        setData((prev) => {
          const list = [...prev.quests];
          list.splice(Math.min(index, list.length), 0, removed);
          return { ...prev, quests: list };
        });
        optionsRef.current.toast({
          title: "Couldn't abandon the quest",
          body: errorMessage(err),
          variant: "danger",
        });
      }
    },
    [setData],
  );

  // -------------------------------------------------------------------------
  // Armory
  // -------------------------------------------------------------------------
  const purchase = useCallback(
    async (itemId: number) => {
      const snapshot = dataRef.current;
      const item = snapshot.shop.find((i) => i.id === itemId);
      if (!item) return;
      if (snapshot.profile.gold < item.price) {
        optionsRef.current.toast({
          title: "Not enough gold",
          body: `You need ${item.price - snapshot.profile.gold} more. A few quests should do it.`,
          variant: "danger",
        });
        return;
      }
      setData((prev) => {
        const alreadyEquipped = prev.shop.some(
          (o) => o.category === item.category && o.equipped,
        );
        const shop = prev.shop.map((i) =>
          i.id === itemId
            ? {
                ...i,
                owned: true,
                quantity: i.quantity + 1,
                equipped:
                  i.equipped ||
                  (EQUIPPABLE.includes(i.category) && !alreadyEquipped),
              }
            : i,
        );
        return {
          ...prev,
          shop,
          profile: {
            ...prev.profile,
            gold: prev.profile.gold - item.price,
            ...deriveCosmetics(shop),
          },
        };
      });
      markBusyItem(itemId, true);
      inflight.current += 1;
      try {
        const res = await api<{ message: string; dashboard: Dashboard }>(
          "/api/shop/purchase",
          { method: "POST", body: JSON.stringify({ itemId }) },
        );
        applyServer(res.dashboard);
        optionsRef.current.toast({ title: res.message, body: `-${item.price} gold`, variant: "gold" });
        optionsRef.current.announce(res.message);
      } catch (err) {
        setData(snapshot);
        optionsRef.current.toast({
          title: "The merchant shakes his head",
          body: errorMessage(err),
          variant: "danger",
        });
        void refresh();
      } finally {
        inflight.current -= 1;
        markBusyItem(itemId, false);
      }
    },
    [applyServer, refresh, setData],
  );

  const equip = useCallback(
    async (itemId: number) => {
      const snapshot = dataRef.current;
      const item = snapshot.shop.find((i) => i.id === itemId);
      if (!item || !item.owned) return;
      const nowEquipped = !item.equipped;
      setData((prev) => {
        const shop = prev.shop.map((i) =>
          i.category === item.category
            ? { ...i, equipped: nowEquipped && i.id === itemId }
            : i,
        );
        return { ...prev, shop, profile: { ...prev.profile, ...deriveCosmetics(shop) } };
      });
      markBusyItem(itemId, true);
      inflight.current += 1;
      try {
        const res = await api<{ message: string; dashboard: Dashboard }>(
          "/api/inventory/equip",
          { method: "POST", body: JSON.stringify({ itemId }) },
        );
        applyServer(res.dashboard);
        optionsRef.current.announce(res.message);
      } catch (err) {
        setData(snapshot);
        optionsRef.current.toast({
          title: "Couldn't change equipment",
          body: errorMessage(err),
          variant: "danger",
        });
        void refresh();
      } finally {
        inflight.current -= 1;
        markBusyItem(itemId, false);
      }
    },
    [applyServer, refresh, setData],
  );

  const useConsumable = useCallback(
    async (itemId: number) => {
      const snapshot = dataRef.current;
      const item = snapshot.shop.find((i) => i.id === itemId);
      if (!item || !item.owned) return;
      setData((prev) => {
        const shop = prev.shop.map((i) =>
          i.id === itemId
            ? { ...i, quantity: i.quantity - 1, owned: i.quantity - 1 > 0 }
            : i,
        );
        return {
          ...prev,
          shop,
          profile: {
            ...prev.profile,
            boostCharges:
              item.payload === "xp_elixir"
                ? prev.profile.boostCharges + 3
                : prev.profile.boostCharges,
            ...deriveCosmetics(shop),
          },
        };
      });
      markBusyItem(itemId, true);
      inflight.current += 1;
      try {
        const res = await api<{ message: string; dashboard: Dashboard }>(
          "/api/inventory/use",
          { method: "POST", body: JSON.stringify({ itemId }) },
        );
        applyServer(res.dashboard);
        optionsRef.current.toast({ title: item.name, body: res.message, variant: "info" });
        optionsRef.current.announce(res.message);
      } catch (err) {
        setData(snapshot);
        optionsRef.current.toast({
          title: "Nothing happened",
          body: errorMessage(err),
          variant: "danger",
        });
        void refresh();
      } finally {
        inflight.current -= 1;
        markBusyItem(itemId, false);
      }
    },
    [applyServer, refresh, setData],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }, []);

  const [claimingBounty, setClaimingBounty] = useState(false);

  const claimBounty = useCallback(async () => {
    const snapshot = dataRef.current;
    const { bounty } = snapshot.profile;
    if (bounty.claimed || bounty.progress < bounty.goal) return;
    const newXp = snapshot.profile.xp + bounty.xp;
    const ls = levelFromXp(newXp);
    setData((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        xp: newXp,
        gold: prev.profile.gold + bounty.gold,
        level: ls.level,
        rank: rankForLevel(ls.level),
        xpIntoLevel: ls.xpIntoLevel,
        xpForNext: ls.xpForNext,
        progress: ls.progress,
        bounty: { ...prev.profile.bounty, claimed: true },
      },
    }));
    setClaimingBounty(true);
    inflight.current += 1;
    try {
      const res = await api<{
        result: { xp: number; gold: number; levelUp: { from: number; to: number; bonusGold: number } | null };
        dashboard: Dashboard;
      }>("/api/bounty/claim", { method: "POST" });
      applyServer(res.dashboard);
      const o = optionsRef.current;
      o.toast({
        title: "Guild contract fulfilled",
        body: `+${res.result.xp} XP · +${res.result.gold} gold`,
        variant: "gold",
      });
      o.announce(`Guild contract claimed. Gained ${res.result.xp} experience and ${res.result.gold} gold.`);
      if (res.result.levelUp) {
        o.onLevelUp({ ...res.result.levelUp, rank: rankForLevel(res.result.levelUp.to) });
      }
    } catch (err) {
      setData(snapshot);
      optionsRef.current.toast({
        title: "Couldn't claim the bounty",
        body: errorMessage(err),
        variant: "danger",
      });
      void refresh();
    } finally {
      inflight.current -= 1;
      setClaimingBounty(false);
    }
  }, [applyServer, refresh, setData]);

  const updateHero = useCallback(
    async (patch: { displayName: string; classKey: ClassKey }): Promise<boolean> => {
      const snapshot = dataRef.current;
      setData((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          displayName: patch.displayName,
          classKey: isClassKey(patch.classKey) ? patch.classKey : prev.profile.classKey,
        },
      }));
      inflight.current += 1;
      try {
        const res = await api<{ dashboard: Dashboard }>("/api/profile", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        applyServer(res.dashboard);
        optionsRef.current.announce("Hero ledger updated.");
        return true;
      } catch (err) {
        setData(snapshot);
        optionsRef.current.toast({
          title: "Couldn't update the ledger",
          body: errorMessage(err),
          variant: "danger",
        });
        return false;
      } finally {
        inflight.current -= 1;
      }
    },
    [applyServer, setData],
  );

  const [claimingBoss, setClaimingBoss] = useState(false);

  const claimBoss = useCallback(async () => {
    const snapshot = dataRef.current;
    const { boss } = snapshot.profile;
    if (boss.claimed || !boss.defeated) return;
    setData((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        gold: prev.profile.gold + boss.gold,
        boss: { ...prev.profile.boss, claimed: true },
      },
    }));
    setClaimingBoss(true);
    inflight.current += 1;
    try {
      const res = await api<{
        result: { xp: number; gold: number; name: string; levelUp: { from: number; to: number; bonusGold: number } | null };
        dashboard: Dashboard;
      }>("/api/boss/claim", { method: "POST" });
      applyServer(res.dashboard);
      const o = optionsRef.current;
      o.toast({
        title: `${res.result.name} slain!`,
        body: `+${res.result.xp} XP · +${res.result.gold} gold. The guild cheers.`,
        variant: "gold",
        duration: 6000,
      });
      o.announce(`Boss defeated. Gained ${res.result.xp} experience and ${res.result.gold} gold.`);
      if (res.result.levelUp) {
        o.onLevelUp({ ...res.result.levelUp, rank: rankForLevel(res.result.levelUp.to) });
      }
    } catch (err) {
      setData(snapshot);
      optionsRef.current.toast({ title: "The boss still stands", body: errorMessage(err), variant: "danger" });
      void refresh();
    } finally {
      inflight.current -= 1;
      setClaimingBoss(false);
    }
  }, [applyServer, refresh, setData]);

  const checkin = useCallback(
    async (input: { mood: number; note?: string }) => {
      inflight.current += 1;
      try {
        const res = await api<{
          result: { emotion: string; confidence: number; reply: string };
          dashboard: Dashboard;
        }>("/api/checkin", { method: "POST", body: JSON.stringify(input) });
        applyServer(res.dashboard);
        optionsRef.current.announce(`Mood recorded as ${res.result.emotion}.`);
        return res.result;
      } catch (err) {
        optionsRef.current.toast({ title: "Couldn't record your mood", body: errorMessage(err), variant: "danger" });
        return null;
      } finally {
        inflight.current -= 1;
      }
    },
    [applyServer],
  );

  const dismissBriefing = useCallback(async () => {
    setData((prev) => ({
      ...prev,
      profile: { ...prev.profile, onboarded: true },
    }));
    try {
      const res = await api<{ dashboard: Dashboard }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ onboarded: true }),
      });
      applyServer(res.dashboard);
    } catch {
      /* local dismiss is enough; next visit will show it again if the save failed */
    }
  }, [applyServer, setData]);

  return {
    data,
    floats,
    pendingQuests,
    busyItems,
    claimingBounty,
    refresh,
    completeQuest,
    createQuest,
    updateQuest,
    deleteQuest,
    purchase,
    equip,
    useConsumable,
    claimBounty,
    claimingBoss,
    claimBoss,
    checkin,
    updateHero,
    dismissBriefing,
    logout,
  };
}
