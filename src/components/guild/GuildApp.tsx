"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { useCountUp, useOnline } from "@/lib/hooks";
import type { Dashboard, Profile } from "@/lib/types";
import { Armory } from "./Armory";
import { BossBattle } from "./BossBattle";
import { Briefing } from "./Briefing";
import { CharacterSheet } from "./CharacterSheet";
import { Chronicle } from "./Chronicle";
import { DailyPlanStrip } from "./DailyPlanStrip";
import { GuildContract } from "./GuildContract";
import { HeroSettings } from "./HeroSettings";
import { LevelUpOverlay } from "./LevelUpOverlay";
import { QuestBoard } from "./QuestBoard";
import { Sanctum } from "./Sanctum";
import { SettingsHall } from "./SettingsHall";
import { isQuestDone, useGuild, type LevelUpEvent } from "./useGuild";

type TabKey = "quests" | "sanctum" | "armory" | "chronicle" | "settings";

const TABS: { key: TabKey; label: string; short: string; icon: string; hotkey: string }[] = [
  { key: "quests", label: "Quest Board", short: "Quests", icon: "📜", hotkey: "1" },
  { key: "sanctum", label: "Sanctum", short: "Sanctum", icon: "🔮", hotkey: "2" },
  { key: "armory", label: "Armory", short: "Armory", icon: "🏪", hotkey: "3" },
  { key: "chronicle", label: "Chronicle", short: "Chron", icon: "📖", hotkey: "4" },
  { key: "settings", label: "Settings", short: "Settings", icon: "⚙️", hotkey: "5" },
];

export function GuildApp({ initial }: { initial: Dashboard }) {
  return (
    <ToastProvider>
      <GuildInner initial={initial} />
    </ToastProvider>
  );
}

function GuildInner({ initial }: { initial: Dashboard }) {
  const { toast } = useToast();
  const [announcement, setAnnouncement] = useState("");
  const [levelUp, setLevelUp] = useState<LevelUpEvent | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [newQuestSignal, setNewQuestSignal] = useState(0);
  const [planSignal, setPlanSignal] = useState(0);
  const [focusQuestId, setFocusQuestId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("quests");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    quests: null,
    sanctum: null,
    armory: null,
    chronicle: null,
    settings: null,
  });
  const online = useOnline();

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  }, []);
  const onLevelUp = useCallback((event: LevelUpEvent) => setLevelUp(event), []);
  const closeLevelUp = useCallback(() => setLevelUp(null), []);

  const options = useMemo(() => ({ toast, announce, onLevelUp }), [toast, announce, onLevelUp]);
  const guild = useGuild(initial, options);
  const { refresh } = guild;

  // Resync when the tab regains focus, comes back online, or the day rolls over.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    const interval = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  // Global keyboard shortcuts (ignored while typing or when a dialog is open).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const hit = TABS.find((t) => t.hotkey === e.key);
      if (hit) {
        setTab(hit.key);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setTab("quests");
        setNewQuestSignal((s) => s + 1);
      } else if (e.key === "?") {
        setBriefingOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { profile, quests, history, shop } = guild.data;
  const activeCount = quests.filter((q) => !isQuestDone(q, profile.today)).length;
  const showBriefing = briefingOpen || !profile.onboarded;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((t) => t.key === tab);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const key = TABS[next].key;
    setTab(key);
    tabRefs.current[key]?.focus();
  };

  return (
    <div className="app-bg min-h-dvh" data-theme={profile.theme}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {!online && (
        <div
          role="status"
          className="sticky top-0 z-[70] border-b border-danger/40 bg-danger/15 px-4 py-2 text-center text-sm font-semibold text-danger backdrop-blur"
        >
          You&apos;re offline. You can keep reading, but quests won&apos;t sync until you reconnect.
        </div>
      )}

      <Header profile={profile} onLogout={guild.logout} onNewQuest={() => { setTab("quests"); setNewQuestSignal((s) => s + 1); }} />

      <nav aria-label="Explore the world" className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 pt-4 sm:px-6 lg:px-8">
        <Link className="btn btn-ghost" href="/community">🏰 Guild Hall</Link>
        <Link className="btn btn-ghost" href="/guilds">🛡 Guilds</Link>
        <Link className="btn btn-ghost" href="/challenges">⚔ Challenges</Link>
        <Link className="btn btn-ghost" href="/leaderboard">🏆 Heroes</Link>
      </nav>
      <main
        id="main"
        className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-28 pt-5 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8 lg:pb-24"
      >
        <aside aria-label="Character sheet" className="lg:sticky lg:top-24 lg:self-start">
          <CharacterSheet
            profile={profile}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenBriefing={() => setBriefingOpen(true)}
          />
        </aside>

        <section aria-label="Guild hall" className="min-w-0">
          <TodayStrip profile={profile} activeCount={activeCount} />

          <div
            role="tablist"
            aria-label="Guild sections"
            className="mb-4 hidden gap-1 rounded-2xl border border-line bg-panel p-1 sm:flex"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls={`panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1}
                className="tab flex flex-1 items-center justify-center gap-2 whitespace-nowrap"
                onClick={() => setTab(t.key)}
                onKeyDown={onTabKey}
                title={`Shortcut: ${t.hotkey}`}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
                {t.key === "quests" && activeCount > 0 && (
                  <span className="rounded-full bg-gold px-1.5 py-0.5 font-body text-[10px] font-black text-gold-ink">
                    {activeCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="rise" key={tab}>
            {tab === "quests" && (
              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <GuildContract profile={profile} claiming={guild.claimingBounty} onClaim={guild.claimBounty} />
                  <BossBattle profile={profile} claiming={guild.claimingBoss} onClaim={guild.claimBoss} />
                </div>
                <DailyPlanStrip
                  profile={profile}
                  refreshSignal={planSignal}
                  toast={toast}
                  onStartQuest={(id) => {
                    setFocusQuestId(id);
                    setTab("sanctum");
                  }}
                />
                <QuestBoard
                  profile={profile}
                  quests={quests}
                  floats={guild.floats}
                  pending={guild.pendingQuests}
                  onComplete={guild.completeQuest}
                  onCreate={guild.createQuest}
                  onUpdate={guild.updateQuest}
                  onDelete={guild.deleteQuest}
                  onSplit={guild.splitQuest}
                  openSignal={newQuestSignal}
                />
              </div>
            )}
            {tab === "sanctum" && (
              <Sanctum
                profile={profile}
                quests={quests}
                onCreate={guild.createQuest}
                onComplete={guild.completeQuest}
                onCheckin={guild.checkin}
                toast={toast}
                focusQuestId={focusQuestId}
                onFocusHandled={() => setFocusQuestId(null)}
                onPlanAccepted={() => {
                  void guild.refresh();
                  setPlanSignal((s) => s + 1);
                  setTab("quests");
                }}
              />
            )}
            {tab === "armory" && (
              <Armory
                profile={profile}
                shop={shop}
                busy={guild.busyItems}
                onBuy={guild.purchase}
                onEquip={guild.equip}
                onUse={guild.useConsumable}
              />
            )}
            {tab === "chronicle" && <Chronicle history={history} profile={profile} />}
            {tab === "settings" && (
              <SettingsHall
                profile={profile}
                onEditHero={() => setSettingsOpen(true)}
                onLogout={guild.logout}
                toast={toast}
              />
            )}
          </div>
        </section>
      </main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Guild sections" className="bottom-nav sm:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="bottom-nav-item"
            aria-current={tab === t.key ? "page" : undefined}
            onClick={() => {
              setTab(t.key);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span aria-hidden="true" className="text-xl">
              {t.icon}
            </span>
            <span>{t.short}</span>
            {t.key === "quests" && activeCount > 0 && (
              <span className="absolute right-3 top-1 rounded-full bg-gold px-1.5 text-[10px] font-black text-gold-ink">
                {activeCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <LevelUpOverlay event={levelUp} onClose={closeLevelUp} />
      <HeroSettings open={settingsOpen} profile={profile} onClose={() => setSettingsOpen(false)} onSave={guild.updateHero} />
      <Briefing
        open={showBriefing}
        onFinish={() => {
          setBriefingOpen(false);
          if (!profile.onboarded) void guild.dismissBriefing();
        }}
      />
    </div>
  );
}

function TodayStrip({ profile, activeCount }: { profile: Profile; activeCount: number }) {
  const todayXp = profile.week.find((d) => d.day === profile.today)?.xp ?? 0;
  const items = [
    { label: "Open quests", value: String(activeCount), icon: "📜" },
    { label: "XP today", value: `+${todayXp}`, icon: "✨", tone: "var(--xp-2)" },
    { label: "Contract", value: `${profile.bounty.progress}/${profile.bounty.goal}`, icon: "📯" },
    { label: "Boss HP", value: `${Math.max(0, profile.boss.hp - profile.boss.damage)}`, icon: profile.boss.icon },
  ];
  return (
    <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Today at a glance">
      {items.map((it) => (
        <div key={it.label} className="panel flex items-center gap-3 px-3 py-2.5">
          <span aria-hidden="true" className="text-xl">
            {it.icon}
          </span>
          <div className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{it.label}</dt>
            <dd className="font-display text-base font-bold tabular-nums" style={it.tone ? { color: it.tone } : undefined}>
              {it.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function Header({ profile, onLogout, onNewQuest }: { profile: Profile; onLogout: () => void; onNewQuest: () => void }) {
  const gold = useCountUp(profile.gold);
  return (
    <header className="sticky top-0 z-[60] border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-base font-bold tracking-wider text-gold-2 sm:text-lg">
          <span aria-hidden="true" className="text-xl sm:text-2xl">⚜</span>
          <span>Questbound</span>
        </Link>
        <div className="flex items-center gap-2">
          <p className="chip text-sm text-gold-2" aria-label={`${profile.gold} gold`}>
            <span aria-hidden="true">🪙</span>
            <span className="tabular-nums">{gold}</span>
          </p>
          <p
            className="chip text-sm"
            aria-label={`${profile.streak} day streak${profile.streakActiveToday ? "" : ", not yet active today"}`}
          >
            <span aria-hidden="true" className={profile.streak > 0 && profile.streakActiveToday ? "flame" : "opacity-50 grayscale"}>
              🔥
            </span>
            <span className="tabular-nums">{profile.streak}</span>
          </p>
          <button type="button" className="btn btn-primary hidden md:inline-flex" onClick={onNewQuest} title="Shortcut: N">
            <span aria-hidden="true">＋</span> Quest
          </button>
          <button type="button" className="btn btn-ghost hidden sm:inline-flex" onClick={onLogout}>
            Sign out
          </button>
          <button type="button" className="btn btn-ghost btn-icon sm:hidden" onClick={onLogout} aria-label="Sign out">
            <span aria-hidden="true">⎋</span>
          </button>
        </div>
      </div>
    </header>
  );
}
