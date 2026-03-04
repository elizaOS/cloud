export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  multiModal?: boolean;
  tier?: "$" | "$$" | "$$$";
  fast?: boolean;
}

export interface LLMModelConfig {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens?: number;
}

/**
 * Curated LLM model list for chat UI and API.
 * - WHY here: Single place for display metadata (name, provider, tier, fast). Used by chat dropdowns and any UI that lists models.
 * - WHY these IDs: We route through Vercel AI Gateway; IDs must match https://vercel.com/ai-gateway/models exactly or requests fail.
 * - WHY keep legacy models: Customers may have saved preferences or automation using older IDs; we only remove when the gateway deprecates.
 * See docs/models.md for full WHYs and how to add/change models.
 */
export const models: LLMModel[] = [
  // OpenAI
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$",
    fast: true,
  },
  {
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$",
    fast: true,
  },
  {
    id: "openai/gpt-5.2-pro",
    name: "GPT-5.2 Pro",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$",
    fast: true,
  },
  {
    id: "openai/gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$",
  },
  // Anthropic
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$",
    fast: true,
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "anthropic/claude-opus-4.1",
    name: "Claude Opus 4.1",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$$",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "anthropic/claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
    tier: "$$",
  },
  // Google
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    providerId: "google",
    multiModal: true,
    tier: "$",
    fast: true,
  },
  {
    id: "google/gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    providerId: "google",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "google/gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "Google",
    providerId: "google",
    multiModal: true,
    tier: "$",
    fast: true,
  },
];

export default models;
