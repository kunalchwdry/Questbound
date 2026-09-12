import { z } from "zod";
import { ATTRIBUTES, DIFFICULTIES, QUEST_TYPES, type Attribute, type Difficulty, type QuestType } from "./game";
import {
  SAFETY_LINE,
  classifyEmotion,
  detectCrisis,
  fallbackReply,
  type Emotion,
} from "./emotion";
import type { Dashboard, Quest } from "./types";

// ---------------------------------------------------------------------------
// Provider configuration — every provider speaks the OpenAI-compatible
// /chat/completions protocol.
//
// Two tiers:
//  • KEYLESS  — free, anonymous OpenAI-compatible models. No signup or key.
//               These make the Oracle a real LLM out of the box. We try them
//               in order and fall through on rate limits / exhausted shared
//               budgets. (Researched Sept 2026 — see RESEARCH.md.)
//  • KEYED    — Gemini / Groq / NVIDIA / OpenAI / a custom endpoint, used the
//               moment you supply an API key (better, more stable models).
//
// The dependency-free Naive Bayes + CBT templates in emotion.ts always remain
// the final fallback when the network is unavailable.
// ---------------------------------------------------------------------------
/** Providers that require an API key. */
type KeyedProvider = "gemini" | "groq" | "nvidia" | "openai" | "custom";
/** Every endpoint identifier the Oracle understands. */
export type Provider =
  | KeyedProvider
  | "llm7"
  | "ovh-nemo"
  | "kilo-nemotron"
  | "pollinations"
  | "kilo"
  | "ovh";

type JsonMode = "response_format" | "prompt";

interface Preset {
  baseUrl: string;
  model: string;
  label: string;
  json: JsonMode;
}

/** Keyed providers — used the moment an API key is supplied. */
const KEYED_PRESETS: Record<KeyedProvider, Preset> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    label: "Google Gemini",
    json: "response_format",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    label: "Groq",
    json: "response_format",
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    model: "meta/llama-3.3-70b-instruct",
    label: "NVIDIA NIM",
    json: "response_format",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    label: "OpenAI",
    json: "response_format",
  },
  custom: { baseUrl: "", model: "", label: "Custom endpoint", json: "response_format" },
};

/**
 * Anonymous, keyless OpenAI-compatible free models. They run in two waves:
 *   wave 0 — fast, non-reasoning chat models fired immediately and raced;
 *   wave 1 — heavier / reasoning backstops fired after a short hedge delay if
 *            the first wave has not produced a valid reply.
 * Each was verified to return schema-valid Oracle JSON with the production
 * system prompt on 2026-09-12 (see RESEARCH.md). Rate limits / empty routing /
 * exhausted shared budgets simply fall through to the next target and finally
 * to the dependency-free on-device model, so the Oracle always answers.
 */
interface KeylessTarget {
  id: Provider;
  baseUrl: string;
  model: string;
  label: string;
  wave: 0 | 1;
  /** Reasoning models burn tokens on a hidden "thinking" preamble. */
  maxTokens?: number;
}
const HEDGE_DELAY_MS = 8_000;

const KEYLESS_TARGETS: KeylessTarget[] = [
  // --- wave 0: fast, non-reasoning ------------------------------------------
  {
    id: "llm7",
    baseUrl: "https://api.llm7.io/v1",
    model: "fast",
    label: "LLM7 free AI",
    wave: 0,
  },
  {
    id: "ovh-nemo",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    model: "Mistral-Nemo-Instruct-2407",
    label: "OVHcloud Mistral Nemo",
    wave: 0,
  },
  {
    id: "pollinations",
    baseUrl: "https://text.pollinations.ai/openai",
    model: "openai",
    label: "Pollinations GPT-OSS",
    wave: 0,
  },
  // --- wave 1: heavier backstops --------------------------------------------
  {
    id: "kilo-nemotron",
    baseUrl: "https://api.kilo.ai/api/gateway",
    model: "nvidia/nemotron-3.5-lightning:free",
    label: "Kilo · Nemotron",
    wave: 1,
    maxTokens: 1600,
  },
  {
    id: "ovh",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    model: "gpt-oss-120b",
    label: "OVHcloud AI",
    wave: 1,
  },
  {
    id: "kilo",
    baseUrl: "https://api.kilo.ai/api/gateway",
    model: "kilo-auto/free",
    label: "Kilo free AI",
    wave: 1,
  },
];

export interface OracleConfig {
  provider: Provider;
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
  keyless: boolean;
  json: JsonMode;
  /** 0 = immediate, 1 = after the hedge delay; used only for keyless targets. */
  wave?: 0 | 1;
  maxTokens?: number;
  temperature?: number;
}

/** Providers selectable per user in Settings → AI / LLM. */
export type UserProvider = "local" | "groq" | "openai" | "gemini" | "nvidia" | "custom";

/**
 * Build a single, explicit Oracle target from a hero's saved configuration.
 * Every provider speaks the OpenAI-compatible protocol. Local/custom endpoints
 * may have an empty key and must never be swapped for a cloud provider — callers
 * pass this straight to runOracle, whose only failure path is the on-device model.
 */
export function buildUserTarget(input: {
  provider: UserProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}): OracleConfig {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const common = {
    apiKey: input.apiKey,
    baseUrl,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  };
  switch (input.provider) {
    case "openai":
    case "gemini":
    case "groq":
    case "nvidia": {
      const preset = KEYED_PRESETS[input.provider];
      return {
        ...common,
        provider: input.provider,
        label: `${preset.label} · ${input.model}`,
        keyless: false,
        json: preset.json,
      };
    }
    case "local":
      return {
        ...common,
        provider: "custom",
        label: `Local · ${input.model}`,
        keyless: false,
        json: "prompt",
      };
    case "custom":
    default:
      return {
        ...common,
        provider: "custom",
        label: `Custom · ${input.model}`,
        keyless: false,
        json: "prompt",
      };
  }
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  if (!v) return defaultValue;
  return ["1", "true", "yes", "on"].includes(v);
}

function keylessConfig(
  t: KeylessTarget,
  modelOverride?: string,
  baseOverride?: string,
): OracleConfig {
  return {
    provider: t.id,
    apiKey: "",
    baseUrl: (baseOverride ?? t.baseUrl).replace(/\/$/, ""),
    model: modelOverride ?? t.model,
    label: t.label,
    keyless: true,
    json: "prompt",
    wave: t.wave,
    maxTokens: t.maxTokens,
  };
}

/**
 * Resolve the keyed provider from AI_API_KEY / the per-vendor key env vars.
 * Returns null when no usable key is configured (or only a keyless id is set).
 */
function resolveKeyed(): OracleConfig | null {
  const apiKey =
    process.env.AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GROQ_API_KEY ??
    process.env.NVIDIA_API_KEY ??
    process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const asked = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (asked && !(asked in KEYED_PRESETS)) return null; // a keyless / unknown id

  const provider: KeyedProvider = (asked as KeyedProvider) ||
    (process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.GROQ_API_KEY
        ? "groq"
        : process.env.NVIDIA_API_KEY
          ? "nvidia"
          : process.env.OPENAI_API_KEY
            ? "openai"
            : "gemini");

  const preset = KEYED_PRESETS[provider];
  const baseUrl = (process.env.AI_BASE_URL ?? preset.baseUrl).replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? preset.model;
  if (!baseUrl || !model) return null;
  return { provider, apiKey, baseUrl, model, label: preset.label, keyless: false, json: preset.json };
}

/**
 * The ordered list of cloud endpoints the Oracle should attempt for this
 * request. Empty when the deployment is configured local-only.
 *
 * Precedence:
 *  1. A configured API key always wins (single keyed provider).
 *  2. AI_PROVIDER=local  → no cloud calls at all (privacy/offline).
 *  3. AI_PROVIDER=<keyless id> → that free model first, then the rest of the
 *     chain for failover.
 *  4. Otherwise the full keyless chain (unless AI_ALLOW_KEYLESS=false).
 */
export function getOracleTargets(): OracleConfig[] {
  const keyed = resolveKeyed();
  if (keyed) return [keyed];

  const asked = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (asked === "local" || asked === "off" || asked === "none") return [];
  if (!envFlag("AI_ALLOW_KEYLESS", true)) return [];

  const order = [...KEYLESS_TARGETS];
  const pinned = order.findIndex((t) => t.id === asked);
  if (pinned >= 0) {
    const [t] = order.splice(pinned, 1);
    order.unshift({ ...t, wave: 0 }); // a pinned free model fires immediately
  }

  // AI_MODEL / AI_BASE_URL override the first target if explicitly provided.
  return order.map((t, i) =>
    keylessConfig(
      t,
      i === 0 ? process.env.AI_MODEL : undefined,
      i === 0 ? process.env.AI_BASE_URL : undefined,
    ),
  );
}

/**
 * Primary cloud target, used for the dashboard's "powered by …" label.
 * Back-compat export; returns null when running purely on the local model.
 */
export function getOracleConfig(): OracleConfig | null {
  return getOracleTargets()[0] ?? null;
}

// ---------------------------------------------------------------------------
// Structured output contract
// ---------------------------------------------------------------------------
export const suggestionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  attribute: z.enum(ATTRIBUTES),
  difficulty: z.enum(DIFFICULTIES),
  type: z.enum(QUEST_TYPES),
  why: z.string().trim().max(160).optional(),
});
export type QuestSuggestion = z.infer<typeof suggestionSchema>;

const oracleOutputSchema = z.object({
  reply: z.string().trim().min(1).max(900),
  emotion: z.string().optional(),
  suggestions: z.array(suggestionSchema).max(3).default([]),
});

export interface OracleTraceStep {
  step: string;
  detail: string;
}

export interface OracleResult {
  reply: string;
  emotion: Emotion;
  confidence: number;
  suggestions: QuestSuggestion[];
  provider: string;
  trace: OracleTraceStep[];
  crisis: boolean;
}

// ---------------------------------------------------------------------------
// Tool: deterministic situational insights (the agent's "sensors")
// ---------------------------------------------------------------------------
export interface Insights {
  openQuests: number;
  dailiesLeft: number;
  overdue: string[];
  streak: number;
  streakAtRisk: boolean;
  weakestAttribute: Attribute;
  strongestAttribute: Attribute;
  xpToLevel: number;
  todayDeeds: number;
  recentTitles: string[];
}

export function gatherInsights(d: Dashboard): Insights {
  const { profile, quests, history } = d;
  const today = profile.today;
  const isDone = (q: Quest) =>
    q.type === "once" ? q.completedAt !== null : q.type === "daily" ? q.lastCompletedOn === today : q.timesToday >= 5;
  const open = quests.filter((q) => !isDone(q));
  const sorted = [...profile.attributes].sort((a, b) => a.xp - b.xp);
  return {
    openQuests: open.length,
    dailiesLeft: open.filter((q) => q.type === "daily").length,
    overdue: open.filter((q) => q.dueDate && q.dueDate < today).map((q) => q.title).slice(0, 3),
    streak: profile.streak,
    streakAtRisk: profile.streak > 0 && !profile.streakActiveToday,
    weakestAttribute: sorted[0].key,
    strongestAttribute: sorted[sorted.length - 1].key,
    xpToLevel: profile.xpForNext - profile.xpIntoLevel,
    todayDeeds: history.filter((h) => h.completedOn === today).length,
    recentTitles: history.slice(0, 5).map((h) => h.title),
  };
}

// ---------------------------------------------------------------------------
// LLM call (OpenAI-compatible)
// ---------------------------------------------------------------------------
/** Some anonymous gateways return HTTP 200 but a short "budget/rate-limit"
 *  message instead of a completion. Treat those as failures so we fail over. */
const SYNTHETIC_ERROR =
  /reached its budget|budget (?:too low|exhausted)|payment required|rate limit|api key|unauthorized|insufficient credits|service unavailable|no credits/i;

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "provider error";
  }
}

/**
 * Providers occasionally echo request details in error bodies. Strip anything
 * that could contain an API key before the message is logged, traced, or shown.
 */
export function sanitizeProviderError(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/(?:sk|rk|gsk|AIza|nvapi|xai)[-_][A-Za-z0-9._\-]{8,}/g, "***")
    .replace(/["']?(api[_-]?key|x-api-key|authorization)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=***")
    .slice(0, 160);
}

async function chat(
  cfg: OracleConfig,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  externalSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  // Keyless free models get a shorter leash so a slow backend cannot stall the
  // whole hedged race; keyed providers are allowed a little longer.
  const timeout = cfg.keyless ? 20_000 : 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    const temperature = cfg.temperature ?? 0.7;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      temperature,
      max_tokens: cfg.maxTokens ?? 600,
    };
    // Keyless gateways reject (or bill) native JSON mode — ask in the prompt.
    if (cfg.json === "response_format") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${cfg.label} responded ${res.status}: ${sanitizeProviderError(text)}`);
    }
    const data = (await res.json()) as {
      error?: unknown;
      choices?: { message?: { content?: string } }[];
    };
    if (data.error) {
      throw new Error(`${cfg.label} error: ${sanitizeProviderError(safeString(data.error))}`);
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty completion");
    if (!/\{/.test(content) && SYNTHETIC_ERROR.test(content)) {
      throw new Error(`${cfg.label} busy: ${content.slice(0, 120)}`);
    }
    return content;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}

function systemPrompt(d: Dashboard, ins: Insights, emotion: Emotion, confidence: number): string {
  const p = d.profile;
  return `You are the Oracle, an emotionally intelligent companion inside "Questbound", a Life RPG where real tasks are quests that pay XP and gold.
Persona: warm, grounded, brief (max ~120 words), lightly fantasy-flavoured but never cheesy. You practise CBT micro-skills: validate the feeling, normalise it, shrink the next step, hand back control. Never guilt-trip, never punish, never mention HP or damage.
You are NOT a therapist: if the user hints at self-harm, gently point to professional/crisis help.

HERO CONTEXT
- Name: ${p.displayName}, class ${p.classKey}, level ${p.level} (${ins.xpToLevel} XP to next)
- Streak: ${ins.streak} days${ins.streakAtRisk ? " (AT RISK — nothing sealed yet today)" : ""}
- Today: ${ins.todayDeeds} deeds done, ${ins.openQuests} open quests, ${ins.dailiesLeft} dailies left
- Overdue: ${ins.overdue.join("; ") || "none"}
- Weakest attribute: ${ins.weakestAttribute}; strongest: ${ins.strongestAttribute}
- Recent deeds: ${ins.recentTitles.join("; ") || "none yet"}
- Local emotion classifier says: ${emotion} (confidence ${confidence})

RULES FOR SUGGESTIONS
- Size quests to the emotion: overwhelmed/tired/sad → 1 trivial or easy quest; anxious → one concrete 5-minute step; joy/calm → one medium/hard quest.
- Prefer the weakest attribute occasionally for balance, but respect what the user asks for.
- Attributes: ${ATTRIBUTES.join(", ")}. Difficulties: ${DIFFICULTIES.join(", ")}. Types: ${QUEST_TYPES.join(", ")}.

OUTPUT: respond ONLY with a single minified JSON object, no markdown and no prose:
{"reply": string, "emotion": one of joy|calm|tired|anxious|sad|frustrated|overwhelmed|neutral, "suggestions": [{"title","attribute","difficulty","type","why"}]}
with 0-3 suggestions. Every suggestion's "attribute", "difficulty" and "type" MUST be one of the exact allowed values listed above.`;
}

// ---------------------------------------------------------------------------
// The agent loop: perceive → sense → plan → act (failover chain) → reflect
// ---------------------------------------------------------------------------
export async function runOracle(input: {
  dashboard: Dashboard;
  message: string;
  history: { role: "user" | "oracle"; content: string }[];
  /**
   * Explicit target(s) from the hero's saved AI configuration. When given,
   * the environment's provider chain is bypassed entirely — a configured
   * local/private endpoint never silently fails over to a third-party cloud.
   * The on-device model remains the only fallback.
   */
  targets?: OracleConfig[] | null;
}): Promise<OracleResult> {
  const trace: OracleTraceStep[] = [];
  const { dashboard, message } = input;

  // 1. Perceive
  const local = classifyEmotion(message);
  const crisis = detectCrisis(message);
  trace.push({
    step: "perceive",
    detail: `Local model → ${local.emotion} (${Math.round(local.confidence * 100)}%)${crisis ? " · crisis lexicon matched" : ""}`,
  });

  // 2. Sense the board
  const ins = gatherInsights(dashboard);
  trace.push({
    step: "sense",
    detail: `${ins.openQuests} open · ${ins.dailiesLeft} dailies left · streak ${ins.streak}${ins.streakAtRisk ? " at risk" : ""} · weakest ${ins.weakestAttribute}`,
  });

  const fallback = (): OracleResult => {
    const reply = fallbackReply({
      emotion: local.emotion,
      name: dashboard.profile.displayName,
      openQuests: ins.openQuests,
      streak: ins.streak,
      streakAtRisk: ins.streakAtRisk,
    });
    return {
      reply: crisis ? `${SAFETY_LINE}\n\n${reply}` : reply,
      emotion: local.emotion,
      confidence: local.confidence,
      suggestions: localSuggestions(local.emotion, ins),
      provider: "local-model",
      trace: [...trace, { step: "respond", detail: "Answered with the on-device Naive Bayes model + CBT templates" }],
      crisis,
    };
  };

  const targets = input.targets ?? getOracleTargets();
  if (targets.length === 0) {
    trace.push({ step: "plan", detail: "Cloud models disabled (AI_PROVIDER=local) → on-device model" });
    return fallback();
  }

  // 3. Plan
  trace.push({
    step: "plan",
    detail:
      targets.length === 1
        ? `Ask ${targets[0].label} (${targets[0].model}) for a validated JSON reply`
        : `Hedged request across ${targets.length} keyless free models: ${targets.map((t) => t.label).join(" · ")}`,
  });

  const historyMessages = input.history.slice(-8).map((m) => ({
    role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));
  const buildMessages = (): { role: "system" | "user" | "assistant"; content: string }[] => [
    { role: "system", content: systemPrompt(dashboard, ins, local.emotion, local.confidence) },
    ...historyMessages,
    { role: "user", content: message },
  ];

  type Parsed = z.infer<typeof oracleOutputSchema>;
  const parse = (raw: string): Parsed => {
    const result = oracleOutputSchema.safeParse(extractJson(raw));
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? "invalid schema");
    return result.data;
  };
  const succeed = (cfg: OracleConfig, parsed: Parsed): OracleResult => {
    const emotion = (isEmotion(parsed.emotion) ? parsed.emotion : local.emotion) as Emotion;
    trace.push({
      step: "respond",
      detail: `${cfg.label} · ${cfg.model} replied with ${parsed.suggestions.length} suggestion(s)`,
    });
    return {
      reply: crisis ? `${SAFETY_LINE}\n\n${parsed.reply}` : parsed.reply,
      emotion,
      confidence: local.confidence,
      suggestions: parsed.suggestions,
      provider: cfg.label,
      trace,
      crisis,
    };
  };

  // 4. Act
  if (targets.length === 1) {
    // A single (keyed, or pinned) provider: give it one repair attempt.
    const cfg = targets[0];
    const messages = buildMessages();
    for (let attempt = 1; attempt <= 2; attempt++) {
      let raw: string;
      try {
        raw = await chat(cfg, messages);
      } catch (err) {
        trace.push({ step: "error", detail: `${cfg.label}: ${err instanceof Error ? err.message : "provider failure"}` });
        break;
      }
      try {
        return succeed(cfg, parse(raw));
      } catch {
        if (attempt === 2) {
          trace.push({ step: "reflect", detail: `${cfg.label}: could not produce valid JSON` });
          break;
        }
        trace.push({ step: "reflect", detail: `${cfg.label}: invalid JSON, asking it to repair` });
        messages.push({ role: "assistant", content: raw.slice(0, 1500) });
        messages.push({
          role: "user",
          content:
            'That was not valid for the schema. Reply again with ONLY the JSON object: {"reply":string,"emotion":string,"suggestions":[{"title","attribute","difficulty","type","why"}]} using only the allowed enum values.',
        });
      }
    }
    trace.push({ step: "fallback", detail: "Cloud model unavailable → on-device model" });
    return fallback();
  }

  // Multiple keyless free models — a two-wave hedged race.
  //  wave 0: fire the fast, non-reasoning models together immediately;
  //  wave 1: heavier / reasoning backstops start after a short hedge delay, or
  //          immediately if every wave-0 model has already failed.
  // The first schema-valid reply wins and every other request is aborted, so
  // latency tracks the healthiest free model rather than the slowest.
  const wave0 = targets.filter((t) => t.wave === 0);
  const wave1 = targets.filter((t) => t.wave === 1);
  trace.push({
    step: "act",
    detail:
      `Wave 1 (${wave0.map((t) => t.label).join(", ") || "—"}) immediately` +
      (wave1.length ? `; backstops after 8s (${wave1.map((t) => t.label).join(", ")})` : ""),
  });

  const winner = await new Promise<{ cfg: OracleConfig; parsed: Parsed } | null>((resolve) => {
    let done = false;
    let outstanding = targets.length; // not-yet-launched count as pending
    let wave1Started = wave1.length === 0;
    const failed = targets.map(() => false);
    const inFlight = targets.map(() => false);
    const controllers = targets.map(() => new AbortController());
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wave0Indexes = targets.map((t, i) => (t.wave === 0 ? i : -1)).filter((i) => i >= 0);

    const finish = (value: { cfg: OracleConfig; parsed: Parsed } | null) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      controllers.forEach((c, i) => inFlight[i] && c.abort());
      resolve(value);
    };

    function launch(i: number) {
      if (done || inFlight[i] || failed[i]) return;
      inFlight[i] = true;
      const cfg = targets[i];
      void chat(cfg, buildMessages(), controllers[i].signal)
        .then((raw) => {
          if (done) return;
          inFlight[i] = false;
          finish({ cfg, parsed: parse(raw) }); // throws on invalid JSON → caught below
        })
        .catch((err: unknown) => {
          inFlight[i] = false;
          if (done) return;
          failed[i] = true;
          const aborted = err instanceof Error && err.name === "AbortError";
          if (!aborted) {
            trace.push({
              step: "error",
              detail: `${cfg.label}: ${err instanceof Error ? err.message : "provider failure"}`,
            });
          }
          outstanding -= 1;
          // All wave-0 models failed? Bring the backstops in without waiting.
          if (!wave1Started && wave0Indexes.every((idx) => failed[idx])) startWave1();
          if (outstanding === 0) finish(null);
        });
    }

    function startWave1() {
      if (done || wave1Started) return;
      wave1Started = true;
      timers.forEach(clearTimeout);
      targets.forEach((t, i) => t.wave === 1 && launch(i));
    }

    if (wave1.length > 0) timers.push(setTimeout(startWave1, HEDGE_DELAY_MS));
    wave0Indexes.forEach((i) => launch(i));
  });

  if (winner) return succeed(winner.cfg, winner.parsed);

  trace.push({ step: "fallback", detail: "No free model available → on-device model" });
  return fallback();
}

function isEmotion(v: unknown): v is Emotion {
  return typeof v === "string" && ["joy", "calm", "tired", "anxious", "sad", "frustrated", "overwhelmed", "neutral"].includes(v);
}

function localSuggestions(emotion: Emotion, ins: Insights): QuestSuggestion[] {
  const tiny = (title: string, attribute: Attribute, why: string): QuestSuggestion => ({
    title,
    attribute,
    difficulty: "trivial" as Difficulty,
    type: "once" as QuestType,
    why,
  });
  switch (emotion) {
    case "overwhelmed":
      return [tiny("Write down the three things actually due today", "discipline", "Shrinks the mountain to a list you can see.")];
    case "anxious":
      return [tiny("Do 2 minutes of slow breathing", "vitality", "Down-regulates before you act."), tiny("Take the first 5-minute step on the scary task", "discipline", "Turns worry into evidence.")];
    case "sad":
      return [tiny("Step outside for 5 minutes of daylight", "vitality", "Small, gentle, proven to nudge mood.")];
    case "tired":
      return [tiny("Drink a glass of water and stretch", "vitality", "Rest counts. Keep the streak with something kind.")];
    case "frustrated":
      return [tiny("Walk away for 2 minutes, then open the file", "discipline", "Break the loop, then a trivial first move.")];
    case "joy":
      return [{ title: `Tackle your hardest ${ins.weakestAttribute} quest`, attribute: ins.weakestAttribute, difficulty: "hard", type: "once", why: "Ride the momentum while it's here." }];
    case "calm":
      return [{ title: "30 minutes of deep work on what matters most", attribute: "intellect", difficulty: "medium", type: "once", why: "Steady minds do deliberate work best." }];
    default:
      return [{ title: `Level up ${ins.weakestAttribute}: one small deed`, attribute: ins.weakestAttribute, difficulty: "easy", type: "once", why: "Your least-trained attribute is waiting." }];
  }
}
