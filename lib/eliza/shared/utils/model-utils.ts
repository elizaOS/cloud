/**
 * Model Utilities for AI SDK Parameter Filtering
 *
 * Reasoning models (o1, o3, deepseek-r1) have different parameter requirements
 * than standard LLMs. They don't support:
 * - temperature (fixed for consistent reasoning)
 * - stopSequences (fixed stop sequences)
 * - presencePenalty (no penalty settings)
 * - frequencyPenalty (no penalty settings)
 *
 * This module provides utilities to detect reasoning models and filter
 * unsupported parameters to prevent AI SDK warnings.
 */

/**
 * Known reasoning model patterns.
 * These models use different inference approaches and don't support
 * standard LLM parameters like temperature.
 */
const REASONING_MODEL_PATTERNS = [
  // OpenAI reasoning models
  /\bo1\b/i, // o1, o1-mini, o1-preview
  /\bo3\b/i, // o3, o3-mini
  // DeepSeek reasoning models
  /\bdeepseek-r1\b/i,
  /\bdeepseek-reasoner\b/i,
];

/**
 * Parameters that are not supported by reasoning models.
 * These will be filtered out when calling reasoning models.
 */
const UNSUPPORTED_REASONING_PARAMS = [
  "temperature",
  "stopSequences",
  "presencePenalty",
  "frequencyPenalty",
  "topP",
  "topK",
] as const;

/**
 * Detects if a model is a reasoning model that doesn't support standard LLM parameters.
 *
 * @param modelName - The model identifier (e.g., "openai/o1", "deepseek-r1")
 * @returns true if the model is a reasoning model
 *
 * @example
 * isReasoningModel("openai/o1") // true
 * isReasoningModel("openai/o1-mini") // true
 * isReasoningModel("claude-3-5-sonnet") // false
 * isReasoningModel("deepseek-r1") // true
 */
export function isReasoningModel(modelName: string | undefined | null): boolean {
  if (!modelName) return false;

  return REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(modelName));
}

/**
 * Filters model parameters to remove unsupported settings for reasoning models.
 *
 * Reasoning models don't support temperature, stopSequences, presencePenalty,
 * and frequencyPenalty. Passing these parameters causes AI SDK warnings.
 *
 * @param params - The model parameters to filter
 * @param modelName - The model identifier to check
 * @returns Filtered parameters safe for the model type
 *
 * @example
 * // For reasoning models, unsupported params are removed
 * filterModelParams({ prompt: "...", temperature: 0.7 }, "openai/o1")
 * // Returns: { prompt: "..." }
 *
 * // For standard models, params pass through unchanged
 * filterModelParams({ prompt: "...", temperature: 0.7 }, "claude-3-5-sonnet")
 * // Returns: { prompt: "...", temperature: 0.7 }
 */
export function filterModelParams<T extends Record<string, unknown>>(
  params: T,
  modelName: string | undefined | null,
): T {
  if (!isReasoningModel(modelName)) {
    return params;
  }

  // Create a copy and remove unsupported params
  const filtered = { ...params };

  for (const param of UNSUPPORTED_REASONING_PARAMS) {
    if (param in filtered) {
      delete filtered[param];
    }
  }

  return filtered as T;
}

/**
 * Gets the list of parameters that are unsupported for a given model.
 * Useful for logging and debugging.
 *
 * @param modelName - The model identifier
 * @returns Array of unsupported parameter names, or empty array for standard models
 */
export function getUnsupportedParams(
  modelName: string | undefined | null,
): readonly string[] {
  if (!isReasoningModel(modelName)) {
    return [];
  }
  return UNSUPPORTED_REASONING_PARAMS;
}
