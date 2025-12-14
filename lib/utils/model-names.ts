/**
 * Model Name Utilities
 *
 * Strips RESELLER prefixes (like fal-ai/) but keeps CREATOR prefixes (like google/).
 * Users should know who made the model, not which API reseller we use.
 */

/**
 * Reseller/API provider prefixes to strip.
 * These are implementation details - users don't need to know which API we call.
 */
const RESELLER_PREFIXES = ["fal-ai/"];

/**
 * Strips reseller prefix from a model name.
 * Keeps creator prefixes like google/, kling/, minimax/.
 *
 * @example
 * stripProviderPrefix("fal-ai/veo3") // "veo3" (legacy, for backwards compat)
 * stripProviderPrefix("google/veo3") // "google/veo3" (kept - Google is the creator)
 */
export function stripProviderPrefix(model: string): string {
  for (const prefix of RESELLER_PREFIXES) {
    if (model.startsWith(prefix)) {
      return model.slice(prefix.length);
    }
  }
  return model;
}

/**
 * Gets a display-friendly name for a model.
 * Maps model IDs to human-readable labels.
 */
export function getDisplayModelName(model: string): string {
  const stripped = stripProviderPrefix(model);

  const displayNames: Record<string, string> = {
    // Video models (creator/model format)
    "google/veo3": "Google Veo 3",
    "google/veo3-fast": "Google Veo 3 Fast",
    "kling/v2.1-master": "Kling 2.1 Master",
    "kling/v2.1-pro": "Kling 2.1 Pro",
    "kling/v2.1-standard": "Kling 2.1 Standard",
    "minimax/hailuo-standard": "MiniMax Hailuo",
    "minimax/hailuo-pro": "MiniMax Hailuo Pro",

    // OpenAI models
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",

    // Claude models
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-haiku-4": "Claude Haiku 4",
    "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
    "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",

    // Gemini models
    "gemini-2.0-flash": "Gemini 2.0 Flash",
    "gemini-1.5-pro": "Gemini 1.5 Pro",
    "gemini-1.5-flash": "Gemini 1.5 Flash",
    "gemini-2.5-flash-image-preview": "Gemini Image",

    // xAI Grok models
    "grok-4.1-fast": "Grok 4.1 Fast",
    "grok-4.1": "Grok 4.1",

    // DeepSeek models
    "deepseek-v3.2": "DeepSeek V3.2",
    "deepseek-r1": "DeepSeek R1",

    // Cohere models
    "command-r-plus": "Command R+",
    "command-r": "Command R",

    // Meta Llama models
    "llama-3.1-70b": "Llama 3.1 70B",
    "llama-3.1-8b": "Llama 3.1 8B",
  };

  return displayNames[stripped] ?? stripped;
}
