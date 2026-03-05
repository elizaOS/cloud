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

// Restored removed models
export const models: LLMModel[] = [
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
    name: "GPT-4o (Legacy)",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$", // Restored to original pricing
    fast: true, // Restored fast attribute
  },
  {
    id: "openai/gpt-4-turbo",
    name: "GPT-4 Turbo (Legacy)",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
    tier: "$$",
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "Claude",
    providerId: "claude",
    tier: "$$$",
  },
  {
    id: "claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "Claude",
    providerId: "claude",
    tier: "$$$",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    providerId: "google",
    tier: "$$$",
  },
];

export default models;
