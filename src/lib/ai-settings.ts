import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiConfigs, type AiConfigRow } from "@/db/schema";
import type { AiConfigPublic } from "@/lib/types";
import { ApiError } from "./api";
import { AI_PROVIDER_META, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, type AiProvider } from "./ai-providers";
import { decryptSecret, encryptSecret } from "./crypto";
import { buildUserTarget, sanitizeProviderError, type OracleConfig, type UserProvider } from "./oracle";
import type { AiConfigInput } from "./validation";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAiConfigRow(userId: number): Promise<AiConfigRow | null> {
  const [row] = await db
    .select()
    .from(aiConfigs)
    .where(eq(aiConfigs.userId, userId))
    .limit(1);
  return row ?? null;
}

export function publicAiConfig(row: AiConfigRow | null): AiConfigPublic {
  const provider = (row?.provider ?? "keyless") as AiProvider;
  const meta = AI_PROVIDER_META[provider];
  const storedKey = row?.apiKeyCipher ? decryptSecret(row.apiKeyCipher) : null;
  return {
    provider,
    label: meta.label,
    model: row?.model ?? "",
    baseUrl: row?.baseUrl ?? "",
    hasApiKey: storedKey !== null && storedKey.length > 0,
    temperature: row?.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: row?.maxTokens ?? DEFAULT_MAX_TOKENS,
    connected: row?.lastTestOk ?? null,
    testedAt: row?.lastTestedAt ? row.lastTestedAt.toISOString() : null,
  };
}

/** Explicit incoming key wins; otherwise fall back to the stored secret. */
export function resolveApiKey(row: AiConfigRow | null, input: Pick<AiConfigInput, "apiKey" | "clearKey">): string {
  if (input.clearKey) return "";
  const incoming = input.apiKey?.trim();
  if (incoming) return incoming;
  return decryptSecret(row?.apiKeyCipher ?? null) ?? "";
}

// ---------------------------------------------------------------------------
// Validation + writes
// ---------------------------------------------------------------------------

const BLOCKED_HOSTS = new Set(["169.254.169.254", "metadata.google.internal", "metadata", "100.100.100.200"]);

export function parseEndpoint(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ApiError("Enter a valid API Base URL.", 422);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError("The base URL must start with http:// or https://.", 422);
  }
  if (url.username || url.password) {
    throw new ApiError("Don't put credentials in the base URL — use the API Key field instead.", 422);
  }
  if (BLOCKED_HOSTS.has(url.hostname)) {
    throw new ApiError("That host isn't allowed.", 422);
  }
  return url;
}

/**
 * Validate a non-keyless configuration. `availableKey` is the key that WILL be
 * used after merging with the stored one (empty for local/custom without auth).
 */
export function validateAiConfig(input: AiConfigInput, availableKey: string): void {
  if (input.provider === "keyless") return;
  const meta = AI_PROVIDER_META[input.provider];
  if (!input.baseUrl) throw new ApiError("Set the API Base URL for this provider.", 422);
  parseEndpoint(input.baseUrl);
  if (!input.model.trim()) {
    throw new ApiError(`Name the model to use, e.g. “${meta.modelPlaceholder}”.`, 422);
  }
  if (meta.needsKey && !availableKey) {
    throw new ApiError("This provider needs an API key. Add one below, or pick a local/keyless option.", 422);
  }
}

export async function saveAiConfig(userId: number, input: AiConfigInput): Promise<AiConfigRow | null> {
  if (input.provider === "keyless") {
    await db.delete(aiConfigs).where(eq(aiConfigs.userId, userId));
    return null;
  }

  const existing = await getAiConfigRow(userId);
  const key = resolveApiKey(existing, input);
  validateAiConfig(input, key);

  const keepingOldCipher = !input.clearKey && !input.apiKey?.trim();
  const [row] = await db
    .insert(aiConfigs)
    .values({
      userId,
      provider: input.provider,
      model: input.model.trim(),
      baseUrl: input.baseUrl,
      apiKeyCipher: input.clearKey
        ? null
        : input.apiKey?.trim()
          ? encryptSecret(input.apiKey.trim())
          : keepingOldCipher
            ? (existing?.apiKeyCipher ?? null)
            : null,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      lastTestOk: null, // changing a configuration invalidates its last test
      lastTestedAt: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: aiConfigs.userId,
      set: {
        provider: input.provider,
        model: input.model.trim(),
        baseUrl: input.baseUrl,
        apiKeyCipher: input.clearKey
          ? null
          : input.apiKey?.trim()
            ? encryptSecret(input.apiKey.trim())
            : keepingOldCipher
              ? (existing?.apiKeyCipher ?? null)
              : null,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        lastTestOk: null,
        lastTestedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

/** Convert a saved row into an Oracle target, or null for the default ensemble. */
export function aiConfigTarget(row: AiConfigRow | null): OracleConfig[] | null {
  if (!row || row.provider === "keyless") return null;
  const target = buildUserTarget({
    provider: row.provider as UserProvider,
    apiKey: decryptSecret(row.apiKeyCipher) ?? "",
    baseUrl: row.baseUrl ?? "",
    model: row.model ?? "",
    temperature: row.temperature,
    maxTokens: row.maxTokens,
  });
  return [target];
}

/**
 * If the tested values exactly match the persisted configuration (including
 * which secret is in play), record the outcome so the dashboard's status dot
 * reflects reality.
 */
export async function recordTestIfMatching(
  userId: number,
  input: AiConfigInput,
  usedKey: string,
  ok: boolean,
): Promise<void> {
  const row = await getAiConfigRow(userId);
  if (!row || row.provider !== input.provider) return;
  const storedKey = decryptSecret(row.apiKeyCipher) ?? "";
  const keyMatches = input.clearKey ? usedKey === "" : usedKey === storedKey;
  if (
    !keyMatches ||
    (row.baseUrl ?? "") !== input.baseUrl ||
    (row.model ?? "") !== input.model.trim() ||
    row.temperature !== input.temperature ||
    row.maxTokens !== input.maxTokens
  ) {
    return;
  }
  await db
    .update(aiConfigs)
    .set({ lastTestOk: ok, lastTestedAt: new Date(), updatedAt: new Date() })
    .where(eq(aiConfigs.userId, userId));
}

// ---------------------------------------------------------------------------
// Connection testing (server-side; the API key is never returned or logged)
// ---------------------------------------------------------------------------

export interface AiTestOutcome {
  ok: boolean;
  state: "success" | "unreachable" | "auth" | "model_missing" | "error";
  title: string;
  detail?: string;
  model?: string;
  latencyMs?: number;
}

const REQUEST_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractModelIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const container = (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).models;
  if (!Array.isArray(container)) return [];
  return container
    .map((entry) =>
      typeof entry === "string" ? entry : entry && typeof entry === "object" ? String((entry as Record<string, unknown>).id ?? (entry as Record<string, unknown>).name ?? "") : "",
    )
    .filter(Boolean);
}

function matchModel(ids: string[], wanted: string): string | null {
  const needle = wanted.trim().toLowerCase();
  const exact = ids.find((id) => id.trim().toLowerCase() === needle);
  if (exact) return exact;
  const loose = ids.find((id) => {
    const idl = id.trim().toLowerCase();
    return idl.startsWith(`${needle}:`) || idl.includes(needle);
  });
  return loose ?? null;
}

function unreachableOutcome(provider: AiProvider, url: URL, cause: string): AiTestOutcome {
  const local = provider === "local" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return {
    ok: false,
    state: "unreachable",
    title: "Can't reach the endpoint",
    detail: local
      ? `Couldn't connect to ${url.host}. Make sure the model server is running and that the server hosting Questbound can reach it — a Vercel deployment cannot reach “localhost” on your laptop; run Questbound locally or on the same network/host.`
      : `Couldn't connect to ${url.host} (${cause}). Check the base URL and any firewall.`,
  };
}

function authOutcome(): AiTestOutcome {
  return {
    ok: false,
    state: "auth",
    title: "Authentication rejected",
    detail: "The server responded 401/403. Check the API key and that this model is enabled on the account.",
  };
}

function describeError(status: number, body: string): AiTestOutcome {
  return {
    ok: false,
    state: "error",
    title: `The endpoint returned ${status}`,
    detail: sanitizeProviderError(body) || "The server rejected the request. Check the model name and base URL.",
  };
}

async function testOpenAiCompatible(provider: AiProvider, base: string, model: string, key: string): Promise<AiTestOutcome> {
  const url = parseEndpoint(base);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const started = Date.now();

  // 1) Model catalogue (Ollama, LM Studio, vLLM, OpenAI, gateways expose this).
  let ids: string[] = [];
  let catalogueBlocked: AiTestOutcome | null = null;
  try {
    const res = await fetchWithTimeout(`${base}/models`, { method: "GET", headers });
    if (res.ok) {
      ids = extractModelIds(await res.json().catch(() => null));
    } else if (res.status === 401 || res.status === 403) {
      catalogueBlocked = authOutcome();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return unreachableOutcome(provider, url, "timed out");
    }
    // Connection refused / DNS failure — no point probing chat on the same host.
    if (!navigatorOnLine(err)) return unreachableOutcome(provider, url, "connection failed");
    // Other servers simply don't implement /models — probe chat below.
  }
  if (catalogueBlocked) return catalogueBlocked;

  if (ids.length > 0) {
    const hit = matchModel(ids, model);
    if (hit) {
      return { ok: true, state: "success", title: "Connected", model: hit, latencyMs: Date.now() - started };
    }
    return {
      ok: false,
      state: "model_missing",
      title: `Model “${model}” isn't available there`,
      detail: `Reachable, and ${ids.length} model(s) responded, but none matched. Available: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? ", …" : ""}.`,
    };
  }

  // 2) Minimal chat probe for servers without /models.
  try {
    const res = await fetchWithTimeout(
      `${base}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1, temperature: 0 }),
      },
      15_000,
    );
    if (res.status === 401 || res.status === 403) return authOutcome();
    const bodyText = await res.text();
    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, state: "model_missing", title: `Model “${model}” not found`, detail: "The server returned 404 for that model name." };
      }
      return describeError(res.status, bodyText);
    }
    const data = JSON.parse(bodyText) as { error?: unknown; choices?: { message?: { content?: string } }[] };
    if (data.error) {
      return { ok: false, state: "error", title: "The model reported an error", detail: sanitizeProviderError(JSON.stringify(data.error)) };
    }
    if (!data.choices?.[0]) {
      return { ok: false, state: "error", title: "Unexpected response", detail: "The endpoint replied without a completion choice." };
    }
    return { ok: true, state: "success", title: "Connected", model, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return unreachableOutcome(provider, url, "timed out");
    if (!navigatorOnLine(err)) return unreachableOutcome(provider, url, "connection failed");
    return { ok: false, state: "error", title: "The endpoint answered unexpectedly", detail: err instanceof Error ? sanitizeProviderError(err.message) : undefined };
  }
}

/** Node's fetch throws TypeError with cause on connection failures. */
function navigatorOnLine(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  const cause = (err as { cause?: { code?: string } })?.cause?.code;
  if (cause && ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ECONNRESET", "EAI_AGAIN"].includes(cause)) return false;
  return true;
}

export async function testAiConnection(input: AiConfigInput, key: string): Promise<AiTestOutcome> {
  if (input.provider === "keyless") {
    return { ok: true, state: "success", title: "Using the free keyless ensemble", detail: "No endpoint to test — the Oracle selects a free model automatically." };
  }
  validateAiConfig(input, key);
  return testOpenAiCompatible(input.provider, input.baseUrl, input.model.trim(), key);
}
