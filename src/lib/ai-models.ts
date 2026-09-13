import { AI_PROVIDER_META, type AiProvider } from "./ai-providers";
import { parseEndpoint, type AiTestOutcome } from "./ai-settings";
import { sanitizeProviderError } from "./oracle";
import type { AiConfigInput } from "./validation";

export interface ModelOption {
  id: string;
  /** Human label, e.g. "Gemini 2.5 Flash (Google)". */
  label: string;
  preview: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;

async function fetchJson(url: string, headers: Record<string, string>, ms = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status}: ${sanitizeProviderError(text)}`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** Chat-style generation models only; drop audio/image/embedding/tooling SKUs. */
const CHAT_HINT =
  /llama|gemma|mixtral|mistral|qwen|deepseek|nemotron|gpt|^o[0-9]|claude|aya|kimi|k2|gemini|phi|granite|jamba|glm|minimax|grok/i;
const NON_CHAT =
  /whisper|tts|speech|transcri|dall|embed|rerank|guard|lyria|veo|imagen|banana|robotics|antigravity|computer-use|deep-research|search-ranking|nano-|image|vision-parser|ocr|asr|tts/i;

function isChatModel(id: string): boolean {
  return CHAT_HINT.test(id) && !NON_CHAT.test(id);
}

function dedupeSort(models: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  // Stable GA models first, then previews; alphabetical within each group.
  return out.sort((a, b) => {
    if (a.preview !== b.preview) return a.preview ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

function fromOpenAiList(data: unknown, opts: { stripPrefix?: string; filter: boolean }): ModelOption[] {
  const container = (data as { data?: unknown[]; models?: unknown[] })?.data ??
    (data as { models?: unknown[] })?.models;
  if (!Array.isArray(container)) return [];
  const out: ModelOption[] = [];
  for (const entry of container) {
    const e = entry as Record<string, unknown>;
    let id = typeof e.id === "string" ? e.id : typeof e.name === "string" ? (e.name as string) : "";
    if (!id) continue;
    if (opts.stripPrefix && id.startsWith(opts.stripPrefix)) id = id.slice(opts.stripPrefix.length);
    if (e.active === false) continue;
    if (opts.filter && !isChatModel(id)) continue;
    const owner = typeof e.owned_by === "string" ? e.owned_by.replace(/^google\b/i, "Google").replace(/^meta\b/i, "Meta") : "";
    const preview = /preview|beta|exp/gi.test(id);
    out.push({ id, label: owner ? `${id} · ${owner}` : id, preview });
  }
  return dedupeSort(out);
}

/**
 * Gemini's OpenAI-compat /models omits capability metadata. Query the native
 * v1beta catalogue (same key) so we can filter to generateContent models and
 * read display names.
 */
async function listGemini(baseUrl: string, key: string): Promise<ModelOption[]> {
  const nativeBase = baseUrl.replace(/\/openai\/?$/, "");
  const url = `${nativeBase}/models`;
  // Key may be sent either as a Google API key (?key=) or bearer.
  const withQuery = key && !key.startsWith("ya29") ? `${url}?key=${encodeURIComponent(key)}` : url;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key.startsWith("ya29")) headers.Authorization = `Bearer ${key}`;
  else headers["x-goog-api-key"] = key;
  const data = (await fetchJson(withQuery, headers)) as { models?: Record<string, unknown>[] };
  const out: ModelOption[] = [];
  for (const m of data.models ?? []) {
    const name = String(m.name ?? "");
    const id = name.replace(/^models\//, "");
    const methods = (m.supportedGenerationMethods ?? []) as string[];
    if (!methods.includes("generateContent")) continue;
    if (NON_CHAT.test(id)) continue;
    out.push({
      id,
      label: String(m.displayName ?? id),
      preview: /preview|exp/i.test(id),
    });
  }
  return dedupeSort(out);
}

export async function listProviderModels(
  input: AiConfigInput,
  key: string,
): Promise<{ models: ModelOption[] } | AiTestOutcome> {
  const provider: AiProvider = input.provider;
  if (provider === "keyless") {
    return { models: [] };
  }
  const meta = AI_PROVIDER_META[provider];
  if (!input.baseUrl) {
    return { ok: false, state: "error", title: "Set the API Base URL first." };
  }
  const url = parseEndpoint(input.baseUrl);
  if (meta.needsKey && !key) {
    return { ok: false, state: "auth", title: "Add your API key first", detail: "Save or paste the key, then load the model list." };
  }

  try {
    if (provider === "gemini") {
      return { models: await listGemini(input.baseUrl, key) };
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    const data = await fetchJson(`${input.baseUrl.replace(/\/+$/, "")}/models`, headers);
    // Local servers (Ollama/LM Studio) and custom gateways: trust the full list;
    // hosted providers (Groq/NVIDIA/OpenAI): filter their catalogue to chat SKUs.
    const hostedProvider = provider === "groq" || provider === "nvidia" || provider === "openai";
    return { models: fromOpenAiList(data, { filter: hostedProvider }) };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, state: "unreachable", title: "The endpoint took too long to list models." };
    }
    const cause = err instanceof Error ? err.message : "connection failed";
    if (/^40[13]/.test(cause)) {
      return { ok: false, state: "auth", title: "Authentication rejected", detail: "Check the API key for this provider." };
    }
    if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|503|502|404/.test(cause)) {
      return {
        ok: false,
        state: "unreachable",
        title: "Couldn't reach the models endpoint",
        detail: provider === "local"
          ? `Make sure the model server is running at ${url.host} and exposes /v1/models.`
          : cause.replace(/^[0-9]+:\s*/, "").slice(0, 160),
      };
    }
    return { ok: false, state: "error", title: "Couldn't load models", detail: sanitizeProviderError(cause) };
  }
}
