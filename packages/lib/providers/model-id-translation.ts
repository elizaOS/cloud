/**
 * Model ID translation between legacy canonical ids (legacy) and
 * OpenRouter's catalog format.
 *
 * Two providers diverge on prefix:
 *   - xAI:     legacy `xai/grok-4`        → OpenRouter `x-ai/grok-4`
 *   - Mistral: legacy `mistral/codestral` → OpenRouter `mistralai/codestral`
 *
 * All other providers (`openai/`, `anthropic/`, `google/`, `groq/`, …) share
 * the same prefix on both catalogs and pass through unchanged.
 */

const PREFIX_MAP: ReadonlyArray<readonly [string, string]> = [
  ["xai/", "x-ai/"],
  ["mistral/", "mistralai/"],
];

export function toOpenRouterModelId(model: string): string {
  for (const [from, to] of PREFIX_MAP) {
    if (model.startsWith(from)) {
      return `${to}${model.slice(from.length)}`;
    }
  }
  return model;
}

/**
 * Inverse of `toOpenRouterModelId`: maps OpenRouter ids back to the canonical
 * gateway-style id. Used for back-compat in pricing lookup keys when callers
 * still send the old `xai/`/`mistral/` shape.
 */
export function fromOpenRouterModelId(model: string): string {
  for (const [canonical, openrouter] of PREFIX_MAP) {
    if (model.startsWith(openrouter)) {
      return `${canonical}${model.slice(openrouter.length)}`;
    }
  }
  return model;
}
