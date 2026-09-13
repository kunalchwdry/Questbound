// Provider catalogue for per-user Oracle/LLM configuration.
// Pure data + types only — safe to import from client components.
// Every selectable provider speaks the OpenAI-compatible /chat/completions
// protocol (Gemini/NVIDIA/Groq all expose that compatibility surface).

export const AI_PROVIDERS = [
  "keyless",
  "local",
  "groq",
  "gemini",
  "nvidia",
  "openai",
  "custom",
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiProviderMeta {
  key: AiProvider;
  /** Dropdown label. */
  label: string;
  /** Default OpenAI-compatible base URL ("" = user must supply one). */
  defaultBaseUrl: string;
  /** Default model id ("" = user must supply one). */
  defaultModel: string;
  baseUrlPlaceholder: string;
  modelPlaceholder: string;
  /** Where to get an API key, shown in the UI. */
  keyUrl?: string;
  /** Whether the provider's own API key is required. */
  needsKey: boolean;
  /** One-line helper text shown under the base URL field. */
  hint: string;
}

export const AI_PROVIDER_META: Record<AiProvider, AiProviderMeta> = {
  keyless: {
    key: "keyless",
    label: "Automatic — free keyless models",
    defaultBaseUrl: "",
    defaultModel: "",
    baseUrlPlaceholder: "Managed automatically",
    modelPlaceholder: "Managed automatically",
    needsKey: false,
    hint: "The built-in ensemble of free, anonymous models (Groq-hosted open models and others). The on-device model answers if every endpoint is busy.",
  },
  local: {
    key: "local",
    label: "Local Model (Ollama, LM Studio, llama.cpp …)",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1:8b",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    modelPlaceholder: "llama3.1:8b",
    needsKey: false,
    hint: "Any OpenAI-compatible local server. Requests go straight to your endpoint and never through a third-party cloud. The server hosting Questbound must be able to reach this address.",
  },
  groq: {
    key: "groq",
    label: "Groq (fast open models — Llama, Mixtral …)",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrlPlaceholder: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile",
    keyUrl: "https://console.groq.com/keys",
    needsKey: true,
    hint: "Groq's OpenAI-compatible API. Free API keys at console.groq.com/keys.",
  },
  gemini: {
    key: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.6-flash",
    baseUrlPlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelPlaceholder: "gemini-3.6-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    hint: "Connects through Gemini's OpenAI-compatible endpoint with a Google AI Studio key (aistudio.google.com/apikey). New keys use Gemini 3.x; reasoning is automatically set to low to keep replies fast and on-budget.",
  },
  nvidia: {
    key: "nvidia",
    label: "NVIDIA NIM (integrate.api.nvidia.com)",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    baseUrlPlaceholder: "https://integrate.api.nvidia.com/v1",
    modelPlaceholder: "meta/llama-3.3-70b-instruct",
    keyUrl: "https://build.nvidia.com",
    needsKey: true,
    hint: "NVIDIA-hosted OpenAI-compatible inference. Keys at build.nvidia.com.",
  },
  openai: {
    key: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
    needsKey: true,
    hint: "Uses OpenAI's Chat Completions API.",
  },
  custom: {
    key: "custom",
    label: "Custom OpenAI-compatible endpoint",
    defaultBaseUrl: "",
    defaultModel: "",
    baseUrlPlaceholder: "https://your-gateway.example.com/v1",
    modelPlaceholder: "model-name",
    needsKey: false,
    hint: "Any server exposing /chat/completions and /models in the OpenAI shape (vLLM, LiteLLM, OpenRouter-style gateways, self-hosted APIs).",
  },
};

export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 600;
