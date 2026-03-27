/**
 * Anthropic Extended Thinking (Chain-of-Thought) Controls
 *
 * Centralized helper for managing Anthropic's extended thinking feature.
 * Budgets are stored in character settings rather than request bodies for security.
 */

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens?: number;
}

export interface CharacterThinkingSettings {
  anthropicThinking?: {
    enabled?: boolean;
    budgetTokens?: number;
  };
}

const DEFAULT_BUDGET_TOKENS = 10000;
const MIN_BUDGET_TOKENS = 1000;
const MAX_BUDGET_TOKENS = 100000;

/**
 * Validates and clamps the budget tokens to acceptable range
 */
export function validateBudgetTokens(tokens: number | undefined): number {
  if (tokens === undefined) {
    return DEFAULT_BUDGET_TOKENS;
  }
  return Math.max(MIN_BUDGET_TOKENS, Math.min(MAX_BUDGET_TOKENS, tokens));
}

/**
 * Extracts thinking configuration from character settings
 */
export function getThinkingConfig(
  settings: CharacterThinkingSettings | undefined
): ThinkingConfig {
  const thinkingSettings = settings?.anthropicThinking;

  if (!thinkingSettings?.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    budgetTokens: validateBudgetTokens(thinkingSettings.budgetTokens),
  };
}

/**
 * Builds the thinking parameter for Anthropic API requests
 */
export function buildThinkingParam(config: ThinkingConfig): object | undefined {
  if (!config.enabled) {
    return undefined;
  }

  return {
    type: "enabled",
    budget_tokens: config.budgetTokens ?? DEFAULT_BUDGET_TOKENS,
  };
}

/**
 * Checks if a model supports extended thinking
 */
export function supportsExtendedThinking(modelId: string): boolean {
  // Claude 3.5 Sonnet and Claude 3 Opus support extended thinking
  const supportedPatterns = [
    /claude-3-5-sonnet/i,
    /claude-3-opus/i,
    /claude-3\.5-sonnet/i,
  ];

  return supportedPatterns.some((pattern) => pattern.test(modelId));
}

/**
 * Applies thinking configuration to an Anthropic request body
 * Only applies if the model supports it and thinking is enabled
 */
export function applyThinkingToRequest(
  requestBody: Record<string, unknown>,
  settings: CharacterThinkingSettings | undefined,
  modelId: string
): Record<string, unknown> {
  if (!supportsExtendedThinking(modelId)) {
    return requestBody;
  }

  const config = getThinkingConfig(settings);
  const thinkingParam = buildThinkingParam(config);

  if (!thinkingParam) {
    return requestBody;
  }

  return {
    ...requestBody,
    thinking: thinkingParam,
  };
}
