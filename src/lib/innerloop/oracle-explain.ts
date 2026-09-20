/**
 * Oracle 2.0 — "why did you change my plan?" explanations.
 *
 * The deterministic rebalancer produces a list of mechanical changes; this
 * module asks the LLM to render them as a warm RPG explanation. On any
 * failure we fall back to a template so the user ALWAYS gets an explanation.
 */
import type { Dashboard } from "../types";
import { getOracleTargets, sanitizeProviderError, type OracleConfig } from "../oracle";
import type { ReplanChange } from "./replanning";

export interface ExplainInput {
  dashboard: Dashboard;
  changes: ReplanChange[];
  reason: string;
  remainingMinutes?: number;
  targets?: OracleConfig[] | null;
}

function templateExplanation(input: ExplainInput): string {
  const { changes } = input;
  if (changes.length === 0) {
    return "Your plan still fits the day. No rebalancing needed — the chapter stands.";
  }
  const lines: string[] = [];
  lines.push("Reality shifted, so I rebalanced your chapter:");
  const moved = changes.filter((c) => c.action === "postponed");
  const split = changes.filter((c) => c.action === "split");
  for (const s of split) {
    lines.push(
      `• "${s.title}" was too large for the time left — I split it into ${s.children?.length ?? 2} smaller quests${s.children?.length ? ` (${s.children.slice(0, 2).join(" · ")})` : ""}.`,
    );
  }
  for (const m of moved.slice(0, 3)) {
    lines.push(`• "${m.title}" moves to tomorrow so today stays winnable.`);
  }
  if (input.remainingMinutes != null) {
    lines.push(`You have ~${input.remainingMinutes} minutes left — the plan now fits inside them, with a little slack.`);
  }
  lines.push("Deadline-critical quests were left untouched. Start with the smallest one to regain momentum.");
  return lines.join("\n");
}

export async function explainReplan(input: ExplainInput): Promise<string> {
  if (input.changes.length === 0) return templateExplanation(input);
  const targets = input.targets ?? getOracleTargets();
  if (targets.length === 0) return templateExplanation(input);

  const changeList = input.changes
    .map((c) => {
      if (c.action === "split")
        return `- SPLIT "${c.title}" → ${c.children?.join(" | ") ?? "children"}`;
      if (c.action === "postponed") return `- POSTPONED "${c.title}" → tomorrow`;
      return `- ${c.action.toUpperCase()} "${c.title}"`;
    })
    .join("\n");

  const prompt = `You are the Oracle inside Questbound, a Life RPG. The deterministic rebalancer just adjusted the hero's day after reality changed (reason: ${input.reason}${input.remainingMinutes != null ? `; ~${input.remainingMinutes} min remain` : ""}).

Changes applied:
${changeList}

Write the 2-5 sentence message the hero sees explaining WHY you changed the plan. Warm, brief, lightly fantasy-flavoured, never guilt-tripping. Mention which quest to start next if split created one. Do not use headings. Respond with ONLY minified JSON: {"reply": "..."} (max 400 chars).`;

  const cfg = targets[0];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Explain the rebalance now." },
      ],
      temperature: cfg.temperature ?? 0.6,
      max_tokens: cfg.maxTokens ?? 300,
    };
    if (cfg.json === "response_format") body.response_format = { type: "json_object" };
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${cfg.label} ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    const parsed = JSON.parse(content.slice(start, end + 1)) as { reply?: string };
    if (!parsed.reply || parsed.reply.trim().length < 4) throw new Error("empty");
    return parsed.reply.trim();
  } catch (err) {
    console.warn(
      "[innerloop] oracle explain fell back:",
      err instanceof Error ? sanitizeProviderError(err.message) : err,
    );
    return templateExplanation(input);
  } finally {
    clearTimeout(timer);
  }
}
