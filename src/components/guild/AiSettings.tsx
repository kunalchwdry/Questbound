"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/client-api";
import { formatRelativeTime } from "@/lib/dates";
import {
  AI_PROVIDER_META,
  AI_PROVIDERS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  type AiProvider,
} from "@/lib/ai-providers";
import type { AiConfigPublic } from "@/lib/types";

type Outcome = {
  ok: boolean;
  state: string;
  title: string;
  detail?: string;
  model?: string;
  latencyMs?: number;
};

function StatusPill({ config }: { config: AiConfigPublic | null }) {
  if (!config || config.provider === "keyless") {
    return (
      <span className="chip border border-gold/40 bg-gold/10 text-gold-2">
        <span className="oracle-dot" aria-hidden="true" />
        Free ensemble
      </span>
    );
  }
  if (config.connected === true) {
    return (
      <span className="chip border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
        <span aria-hidden="true">●</span> Connected
      </span>
    );
  }
  if (config.connected === false) {
    return (
      <span className="chip border border-danger/40 bg-danger/10 text-danger">
        <span aria-hidden="true">●</span> Not Connected
      </span>
    );
  }
  return (
    <span className="chip border border-amber-400/40 bg-amber-400/10 text-amber-300">
      <span aria-hidden="true">●</span> Untested
    </span>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function AiSettings({
  toast,
}: {
  toast: (t: { title: string; body?: string; variant?: "default" | "success" | "danger" | "gold" | "info" }) => void;
}) {
  const [config, setConfig] = useState<AiConfigPublic | null>(null);
  const [provider, setProvider] = useState<AiProvider>("keyless");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ config: AiConfigPublic }>("/api/settings/ai")
      .then((r) => {
        if (!alive) return;
        const c = r.config;
        setConfig(c);
        setProvider(c.provider);
        setModel(c.model);
        setBaseUrl(c.baseUrl);
        setTemperature(c.temperature);
        setMaxTokens(c.maxTokens);
      })
      .catch(() => alive && setError("Couldn't load the Oracle configuration."));
    return () => {
      alive = false;
    };
  }, []);

  const meta = AI_PROVIDER_META[provider];
  const isKeyless = provider === "keyless";

  function changeProvider(next: AiProvider) {
    setProvider(next);
    setOutcome(null);
    setError(null);
    const nextMeta = AI_PROVIDER_META[next];
    // Only overwrite fields the user hasn't customised away from the old preset.
    setBaseUrl((current) => {
      const oldDefaults = AI_PROVIDER_META[provider].defaultBaseUrl;
      return !current || current === oldDefaults ? nextMeta.defaultBaseUrl : current;
    });
    setModel((current) => {
      const oldDefault = AI_PROVIDER_META[provider].defaultModel;
      return !current || current === oldDefault ? nextMeta.defaultModel : current;
    });
  }

  function payload() {
    return {
      provider,
      model: isKeyless ? "" : model.trim(),
      baseUrl: isKeyless ? "" : baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      clearKey,
      temperature,
      maxTokens,
    };
  }

  function clientValidate(): string | null {
    if (isKeyless) return null;
    if (!baseUrl.trim()) return "Set the API Base URL.";
    if (!model.trim()) return "Name the model to use.";
    if (meta.needsKey && !apiKey.trim() && !clearKey && !config?.hasApiKey) {
      return `${meta.label} needs an API key.`;
    }
    return null;
  }

  async function onTest(e: FormEvent) {
    e.preventDefault();
    const problem = clientValidate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setOutcome(null);
    setTesting(true);
    try {
      const r = await api<{ result: Outcome; config: AiConfigPublic }>("/api/settings/ai/test", {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      setOutcome(r.result);
      setConfig(r.config);
      if (r.result.ok && r.config.connected === null) {
        // Works, but the tested values aren't saved yet.
        toast({ title: "Connection works", body: "Save the configuration to make it active.", variant: "info" });
      }
    } catch (err) {
      setOutcome({ ok: false, state: "error", title: "Test failed", detail: err instanceof Error ? err.message : undefined });
    } finally {
      setTesting(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const problem = clientValidate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const r = await api<{ config: AiConfigPublic }>("/api/settings/ai", {
        method: "PUT",
        body: JSON.stringify(payload()),
      });
      setConfig(r.config);
      setApiKey("");
      setClearKey(false);
      setOutcome(null);
      toast({
        title: r.config.provider === "keyless" ? "Using free keyless models" : "Oracle configuration saved",
        body: r.config.provider === "keyless" ? undefined : "Run Test Connection to confirm the endpoint.",
        variant: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel panel-gilded p-5 sm:p-6" aria-labelledby="ai-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="eyebrow">Settings · AI / LLM</p>
          <h2 id="ai-settings-title" className="mt-1 font-display text-xl font-bold text-gold-2">
            Oracle engine
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Choose what powers the Oracle. The free ensemble needs nothing; you can also point it at a local
            model or your own provider. Keys stay on the server, encrypted at rest.
          </p>
        </div>
        <StatusPill config={config} />
      </div>

      <form onSubmit={onSave} className="mt-5 space-y-5" noValidate>
        <Field label="LLM Provider" htmlFor="ai-provider">
          <select
            id="ai-provider"
            className="input"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as AiProvider)}
          >
            {AI_PROVIDERS.map((key) => (
              <option key={key} value={key}>
                {AI_PROVIDER_META[key].label}
              </option>
            ))}
          </select>
        </Field>

        {!isKeyless && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model Name" htmlFor="ai-model">
                <input
                  id="ai-model"
                  className="input font-mono text-[0.9rem]"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={meta.modelPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Max Tokens" htmlFor="ai-max-tokens" hint="Upper bound per Oracle reply.">
                <input
                  id="ai-max-tokens"
                  type="number"
                  className="input"
                  min={16}
                  max={32000}
                  step={16}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="API Base URL" htmlFor="ai-base-url" hint={meta.hint}>
              <input
                id="ai-base-url"
                className="input font-mono text-[0.9rem]"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta.baseUrlPlaceholder}
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
            </Field>

            <Field
              label="API Key (optional for local models)"
              htmlFor="ai-key"
              hint={
                meta.keyUrl
                  ? undefined
                  : "Stored encrypted on the server; never shown again after saving."
              }
            >
              {meta.keyUrl && (
                <p className="mb-1.5 text-xs text-muted">
                  Get a free key at{" "}
                  <a
                    href={meta.keyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-bold text-gold-2 underline-offset-2 hover:underline"
                  >
                    {meta.keyUrl.replace(/^https?:\/\//, "")}
                  </a>
                </p>
              )}
              <div className="relative">
                <input
                  id="ai-key"
                  className="input pr-14 font-mono text-[0.9rem]"
                  type={showKey ? "text" : "password"}
                  value={clearKey ? "" : apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setClearKey(false);
                  }}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={
                    config?.hasApiKey && !clearKey ? "••••••••••••  saved — leave blank to keep" : "Paste API key"
                  }
                  disabled={clearKey}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute inset-y-0 right-2 my-auto flex h-8 w-10 items-center justify-center rounded-lg border border-line bg-panel-2 text-xs font-bold text-muted hover:text-gold-2"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              {config?.hasApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setClearKey((v) => !v);
                    setApiKey("");
                  }}
                  className="mt-1.5 text-xs font-bold text-muted underline-offset-2 hover:text-danger hover:underline"
                >
                  {clearKey ? "Keep the saved key instead" : "Remove saved key"}
                </button>
              )}
            </Field>

            <Field
              label={`Temperature — ${temperature.toFixed(2)}`}
              htmlFor="ai-temperature"
              hint="0 = precise and deterministic · 1 = balanced · 2 = inventive and varied."
            >
              <input
                id="ai-temperature"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full accent-[var(--gold)]"
              />
            </Field>
          </>
        )}

        {isKeyless && (
          <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm leading-relaxed text-muted">
            {meta.hint}
          </div>
        )}

        {provider === "local" && (
          <div className="rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3 text-xs leading-relaxed text-gold-2/90">
            Local requests go directly to your endpoint — never through a third-party cloud. The server running
            Questbound must be able to reach the address above; on Vercel, &quot;localhost&quot; means Vercel&apos;s
            container, not your laptop, so self-host Questbound for a local model.
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}

        {outcome && (
          <div
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm ${
              outcome.ok
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            <p className="font-bold">
              {outcome.ok ? "✓ " : "✕ "}
              {outcome.title}
              {outcome.model ? <span className="ml-2 font-mono text-xs opacity-80">{outcome.model}</span> : null}
              {typeof outcome.latencyMs === "number" ? (
                <span className="ml-2 text-xs opacity-70">{Math.round(outcome.latencyMs)} ms</span>
              ) : null}
            </p>
            {outcome.detail && <p className="mt-1 leading-relaxed opacity-90">{outcome.detail}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onTest} disabled={testing || saving || isKeyless}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={testing || saving}>
            {saving ? "Saving…" : "Save Configuration"}
          </button>
          {config?.testedAt && (
            <span className="text-xs text-muted">
              Last tested {formatRelativeTime(config.testedAt)}
            </span>
          )}
        </div>

        <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
          Keys are stored AES-256-GCM encrypted in your database, are never sent to the browser, and are stripped
          from logs and error messages.
        </p>
      </form>
    </section>
  );
}
