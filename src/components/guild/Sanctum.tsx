"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { formatDay, formatRelativeTime } from "@/lib/dates";
import { EMOTION_META, type Emotion } from "@/lib/emotion";
import { ATTRIBUTE_META, DIFFICULTY_META } from "@/lib/game";
import type { CompanionMessage, Profile, Quest, QuestInput } from "@/lib/types";
import { isQuestDone } from "./useGuild";

interface Props {
  profile: Profile;
  quests: Quest[];
  onCreate: (input: QuestInput) => Promise<boolean>;
  onComplete: (id: number) => void;
  onCheckin: (input: { mood: number; note?: string }) => Promise<{ emotion: string; reply: string } | null>;
  toast: (t: { title: string; body?: string; variant?: "default" | "success" | "danger" | "gold" | "info" }) => void;
}

const MOODS = [
  { value: 1, icon: "😞", label: "Rough" },
  { value: 2, icon: "😕", label: "Low" },
  { value: 3, icon: "😐", label: "Okay" },
  { value: 4, icon: "🙂", label: "Good" },
  { value: 5, icon: "😄", label: "Great" },
];

const PROMPTS = [
  "I'm overwhelmed by my list",
  "Suggest a quest for my energy",
  "I broke my streak and feel bad",
  "Plan a calm evening for me",
];

function emotionMeta(key: string | null | undefined) {
  return EMOTION_META[(key ?? "neutral") as Emotion] ?? EMOTION_META.neutral;
}

export function Sanctum({ profile, quests, onCreate, onComplete, onCheckin, toast }: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Oracle profile={profile} onCreate={onCreate} toast={toast} />
      <div className="space-y-4">
        <MoodCheckin profile={profile} onCheckin={onCheckin} />
        <FocusTimer profile={profile} quests={quests} onComplete={onComplete} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oracle chat
// ---------------------------------------------------------------------------
function Oracle({
  profile,
  onCreate,
  toast,
}: {
  profile: Profile;
  onCreate: Props["onCreate"];
  toast: Props["toast"];
}) {
  const [messages, setMessages] = useState<CompanionMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [showTrace, setShowTrace] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    api<{ messages: CompanionMessage[] }>("/api/companion")
      .then((r) => alive && setMessages(r.messages))
      .catch(() => alive && setMessages([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || thinking) return;
      setDraft("");
      const tempUser: CompanionMessage = {
        id: -Date.now(),
        role: "user",
        content: message,
        emotion: null,
        suggestions: [],
        provider: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...(m ?? []), tempUser]);
      setThinking(true);
      try {
        const res = await api<{ user: CompanionMessage; oracle: CompanionMessage; crisis: boolean }>(
          "/api/companion",
          { method: "POST", body: JSON.stringify({ message }) },
        );
        setMessages((m) => [...(m ?? []).filter((x) => x.id !== tempUser.id), res.user, res.oracle]);
      } catch (err) {
        setMessages((m) => (m ?? []).filter((x) => x.id !== tempUser.id));
        setDraft(message);
        toast({
          title: "The Oracle is silent",
          body: err instanceof Error ? err.message : "Try again in a moment.",
          variant: "danger",
        });
      } finally {
        setThinking(false);
        inputRef.current?.focus();
      }
    },
    [thinking, toast],
  );

  async function accept(msgId: number, s: CompanionMessage["suggestions"][number], idx: number) {
    const key = `${msgId}:${idx}`;
    if (accepted.has(key)) return;
    setAccepted((a) => new Set(a).add(key));
    const ok = await onCreate({
      title: s.title,
      notes: s.why,
      attribute: s.attribute,
      difficulty: s.difficulty,
      type: s.type,
    });
    if (ok) toast({ title: "Quest posted", body: s.title, variant: "success" });
    else
      setAccepted((a) => {
        const n = new Set(a);
        n.delete(key);
        return n;
      });
  }

  async function clear() {
    await api("/api/companion", { method: "DELETE" }).catch(() => undefined);
    setMessages([]);
  }

  return (
    <section className="panel flex min-h-[32rem] flex-col p-4 sm:p-5" aria-labelledby="oracle-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Companion</p>
          <h2 id="oracle-title" className="font-display text-xl font-bold">
            The Oracle
          </h2>
          <p className="text-xs text-muted">
            {profile.oracleProvider
              ? `Emotion-aware · powered by ${profile.oracleProvider} + the on-device model`
              : "Emotion-aware · running on the on-device model only (cloud AI disabled)"}
          </p>
        </div>
        {messages && messages.length > 0 && (
          <button type="button" className="btn btn-ghost text-xs" onClick={clear}>
            Clear conversation
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="oracle-scroll mt-4 flex-1 space-y-3 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        aria-label="Conversation with the Oracle"
      >
        {messages === null && (
          <div className="space-y-2">
            <div className="skeleton h-14 w-3/4" />
            <div className="skeleton ml-auto h-10 w-1/2" />
          </div>
        )}
        {messages && messages.length === 0 && (
          <div className="rounded-2xl border border-line bg-panel-2 p-4 text-sm text-muted">
            <p>
              <span aria-hidden="true">🔮</span> I read your board, your streak and how you say you feel — then
              I size a quest to match. Tell me anything, or try:
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {PROMPTS.map((p) => (
                <li key={p}>
                  <button type="button" className="chip cursor-pointer hover:border-line-strong hover:text-ink" onClick={() => send(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages?.map((m) => {
            const meta = emotionMeta(m.emotion);
            const isOracle = m.role === "oracle";
            return (
              <motion.article
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isOracle ? "justify-start" : "justify-end"}`}
                aria-label={isOracle ? "Oracle" : "You"}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isOracle
                      ? "rounded-tl-md border border-line-strong bg-panel-2"
                      : "rounded-tr-md bg-gold/15 text-ink"
                  }`}
                >
                  {isOracle && (
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: meta.tone }}>
                      <span aria-hidden="true">{meta.icon}</span> Sensed: {meta.label}
                      {m.provider && <span className="font-normal text-muted">· {m.provider}</span>}
                    </p>
                  )}
                  <p className="whitespace-pre-line">{m.content}</p>
                  {m.suggestions.length > 0 && (
                    <ul className="mt-3 space-y-2" aria-label="Suggested quests">
                      {m.suggestions.map((s, i) => {
                        const key = `${m.id}:${i}`;
                        const done = accepted.has(key);
                        return (
                          <li key={key} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
                            <span aria-hidden="true">{ATTRIBUTE_META[s.attribute].icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{s.title}</p>
                              <p className="text-[11px] text-muted">
                                {DIFFICULTY_META[s.difficulty].label} · {ATTRIBUTE_META[s.attribute].label} · +
                                {DIFFICULTY_META[s.difficulty].xp} XP{s.why ? ` — ${s.why}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={`btn ${done ? "btn-ghost" : "btn-primary"} min-h-9 px-3 text-xs`}
                              disabled={done}
                              onClick={() => accept(m.id, s, i)}
                            >
                              {done ? "Posted ✓" : "Accept"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {isOracle && m.trace && (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-muted underline-offset-2 hover:underline"
                        aria-expanded={showTrace === m.id}
                        onClick={() => setShowTrace(showTrace === m.id ? null : m.id)}
                      >
                        {showTrace === m.id ? "Hide" : "Show"} how the Oracle reasoned
                      </button>
                      {showTrace === m.id && (
                        <ol className="mt-1.5 space-y-1 text-[11px] text-muted">
                          {m.trace.map((t, i) => (
                            <li key={i}>
                              <span className="font-bold uppercase tracking-wider text-gold">{t.step}</span> — {t.detail}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                  <time className="mt-1 block text-[10px] text-muted" dateTime={m.createdAt}>
                    {formatRelativeTime(m.createdAt)}
                  </time>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
        {thinking && (
          <div className="flex items-center gap-2 text-xs text-muted" aria-label="The Oracle is thinking">
            <span className="oracle-dot" />
            <span className="oracle-dot" style={{ animationDelay: "150ms" }} />
            <span className="oracle-dot" style={{ animationDelay: "300ms" }} />
            reading the ledger…
          </div>
        )}
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="oracle-input" className="sr-only">
          Message the Oracle
        </label>
        <textarea
          ref={inputRef}
          id="oracle-input"
          className="input min-h-[2.9rem] max-h-32 flex-1 resize-none"
          rows={1}
          placeholder="How are you, really?"
          value={draft}
          maxLength={600}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={thinking || !draft.trim()} aria-busy={thinking}>
          Send
        </button>
      </form>
      <p className="mt-2 text-[10px] text-muted">
        The Oracle is a companion, not a clinician. In a crisis, contact local emergency services or a crisis line.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mood check-in
// ---------------------------------------------------------------------------
function MoodCheckin({ profile, onCheckin }: { profile: Profile; onCheckin: Props["onCheckin"] }) {
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ emotion: string; reply: string } | null>(null);
  const todays = profile.checkins.filter((c) => c.day === profile.today);
  const recent = profile.checkins.slice(0, 7);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!mood) return;
    setSaving(true);
    const r = await onCheckin({ mood, note: note.trim() || undefined });
    setSaving(false);
    if (r) {
      setResult(r);
      setNote("");
      setMood(null);
    }
  }

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="mood-title">
      <p className="eyebrow">Mood check-in</p>
      <h3 id="mood-title" className="font-display text-lg font-bold">
        How is the hero today?
      </h3>
      <p className="text-xs text-muted">
        {todays.length > 0 ? `${todays.length} check-in${todays.length > 1 ? "s" : ""} today.` : "Logging a mood pairs with your deeds to reveal what actually helps."}
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <fieldset>
          <legend className="sr-only">Mood from 1 to 5</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => (
              <div key={m.value}>
                <input
                  type="radio"
                  name="mood"
                  id={`mood-${m.value}`}
                  className="peer sr-only"
                  checked={mood === m.value}
                  onChange={() => setMood(m.value)}
                />
                <label
                  htmlFor={`mood-${m.value}`}
                  className="flex cursor-pointer flex-col items-center rounded-xl border border-line bg-panel-2 py-2 transition-all hover:border-line-strong peer-checked:scale-105 peer-checked:border-gold peer-checked:bg-gold/10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-2"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {m.icon}
                  </span>
                  <span className="text-[10px] font-bold">{m.label}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="mood-note" className="sr-only">
            What's on your mind?
          </label>
          <input
            id="mood-note"
            className="input"
            placeholder="A few words on why (optional)"
            value={note}
            maxLength={400}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-ghost w-full" disabled={!mood || saving} aria-busy={saving}>
          Record mood
        </button>
      </form>
      {result && (
        <div className="mt-3 rounded-xl border border-line-strong bg-panel-2 p-3 text-sm" role="status">
          <p className="mb-1 text-[11px] font-bold" style={{ color: emotionMeta(result.emotion).tone }}>
            <span aria-hidden="true">{emotionMeta(result.emotion).icon}</span> Sensed: {emotionMeta(result.emotion).label}
          </p>
          <p className="text-muted">{result.reply}</p>
        </div>
      )}
      {recent.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Recent moods">
          {recent.map((c) => (
            <li
              key={c.id}
              className="chip"
              title={`${formatDay(c.day)}${c.note ? ` — ${c.note}` : ""}`}
            >
              <span aria-hidden="true">{MOODS[c.mood - 1]?.icon}</span>
              {emotionMeta(c.emotion).label}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Focus timer (Forest / Pomodoro): finishing a session seals the chosen quest
// ---------------------------------------------------------------------------
function FocusTimer({ profile, quests, onComplete }: { profile: Profile; quests: Quest[]; onComplete: (id: number) => void }) {
  const open = quests.filter((q) => !isQuestDone(q, profile.today) && q.id > 0);
  const [minutes, setMinutes] = useState(25);
  const [questId, setQuestId] = useState<number | "">("");
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const endRef = useRef<number>(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        if (questId !== "") onComplete(Number(questId));
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [running, questId, onComplete]);

  function start() {
    endRef.current = Date.now() + minutes * 60_000;
    setLeft(minutes * 60);
    setRunning(true);
  }
  function stop() {
    setRunning(false);
    setLeft(null);
  }

  const total = minutes * 60;
  const progress = left === null ? 0 : 1 - left / total;
  const mm = String(Math.floor((left ?? total) / 60)).padStart(2, "0");
  const ss = String((left ?? total) % 60).padStart(2, "0");

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="focus-title">
      <p className="eyebrow">Focus ritual</p>
      <h3 id="focus-title" className="font-display text-lg font-bold">
        Candle timer
      </h3>
      <p className="text-xs text-muted">Pick a quest, light the candle. When it burns out, the quest is sealed for you.</p>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="relative grid h-24 w-24 flex-none place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--ember) ${Math.round(progress * 360)}deg, color-mix(in srgb, var(--ember) 15%, transparent) 0)`,
          }}
          role="timer"
          aria-live="off"
          aria-label={`${mm} minutes ${ss} seconds remaining`}
        >
          <div className="grid h-[84px] w-[84px] place-items-center rounded-full bg-panel-solid font-display text-xl font-bold tabular-nums">
            {mm}:{ss}
          </div>
          <span className={`absolute -top-2 text-lg ${running ? "flame" : "opacity-40 grayscale"}`} aria-hidden="true">
            🕯️
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <label className="block text-xs font-bold" htmlFor="focus-quest">
            Quest to seal
          </label>
          <select
            id="focus-quest"
            className="input"
            value={questId}
            disabled={running}
            onChange={(e) => setQuestId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">— none, just focus —</option>
            {open.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5" role="group" aria-label="Duration">
            {[5, 15, 25, 50].map((m) => (
              <button
                key={m}
                type="button"
                className={`chip cursor-pointer ${minutes === m ? "border-gold text-gold-2" : "hover:border-line-strong"}`}
                aria-pressed={minutes === m}
                disabled={running}
                onClick={() => setMinutes(m)}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {running ? (
          <button type="button" className="btn btn-danger flex-1" onClick={stop}>
            Snuff the candle
          </button>
        ) : (
          <button type="button" className="btn btn-primary flex-1" onClick={start}>
            Light the candle
          </button>
        )}
      </div>
    </section>
  );
}
