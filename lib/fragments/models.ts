/**
 * Model configuration for fragments
 * Simplified to work with Eliza Cloud APIs
 */

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  multiModal?: boolean;
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

// Simplified model list for Eliza Cloud
export const models: LLMModel[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    providerId: "openai",
    multiModal: true,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
  },
  {
    id: "claude-3-5-haiku-latest",
    name: "Claude Haiku 3.5",
    provider: "Anthropic",
    providerId: "anthropic",
    multiModal: true,
  },
];

export default models;

