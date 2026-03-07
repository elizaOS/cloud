/** ACTIONS Provider - Provides available actions with parameter schemas to the LLM. */
import type {
  Action,
  IAgentRuntime,
  Memory,
  Provider,
  State,
} from "@elizaos/core";
import {
  addHeader,
  composeActionExamples,
  formatActionNames,
  logger,
} from "@elizaos/core";
import type { ActionParameter, ActionWithParams } from "../types";

function formatActionsWithoutParams(actions: Action[]): string {
  return actions
    .map((a) => `## ${a.name}\n${a.description}`)
    .join("\n\n---\n\n");
}

function formatActionsWithParams(actions: Action[]): string {
  return actions
    .map((action) => {
      const params = (action as ActionWithParams).parameters;
      let formatted = `## ${action.name}\n${action.description}`;

      if (!params) return formatted;

      const entries = Object.entries(params);
      if (entries.length === 0) {
        return (
          formatted +
          "\n\n**Parameters:** None (can be called directly without parameters)"
        );
      }

      formatted += "\n\n**Parameters:**";
      for (const [name, def] of entries) {
        const required = def.required ? "(required)" : "(optional)";
        formatted += `\n- \`${name}\` ${required}: ${def.type} - ${def.description}`;
      }
      return formatted;
    })
    .join("\n\n---\n\n");
}

/**
 * Per-message cache for action validation results.
 * Avoids re-validating 50-100+ actions on every composeState() call
 * within the same message processing cycle (called 5-9 times).
 */
type ValidationCacheEntry = {
  actions: Action[];
  discoverableToolCount: number;
  timeoutHandle?: ReturnType<typeof setTimeout>;
};

const validationCache = new Map<string, ValidationCacheEntry>();

/** Invalidate cached validation for a message (e.g., after SEARCH_ACTIONS registers new tools). */
export function invalidateActionValidationCache(messageId: string): void {
  const cached = validationCache.get(messageId);
  if (cached?.timeoutHandle) {
    clearTimeout(cached.timeoutHandle);
  }
  validationCache.delete(messageId);
}

export const actionsProvider: Provider = {
  name: "ACTIONS",
  description: "Available actions with parameter schemas",
  position: -1,

  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const cacheKey = message.id ? String(message.id) : null;
    let cached = cacheKey ? validationCache.get(cacheKey) : undefined;

    if (!cached) {
      const actionsData = (
        await Promise.all(
          runtime.actions.map(async (action: Action) => {
            try {
              return (await action.validate(runtime, message, state))
                ? action
                : null;
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : String(e);
              logger.error(
                `[ACTIONS] validate error: ${action.name}`,
                errorMessage,
              );
              return null;
            }
          }),
        )
      ).filter((a): a is Action => a !== null);

      let discoverableToolCount = 0;
      try {
        const mcpSvc = runtime.getService("mcp") as unknown as
          | { getTier2Index?: () => { getToolCount: () => number } }
          | undefined;
        if (mcpSvc && typeof mcpSvc.getTier2Index === "function") {
          const index = mcpSvc.getTier2Index();
          const count = index?.getToolCount?.();
          if (typeof count === "number") discoverableToolCount = count;
        }
      } catch {
        /* MCP service may not be available */
      }

      cached = { actions: actionsData, discoverableToolCount };
      if (cacheKey) {
        const timeoutHandle = setTimeout(
          () => validationCache.delete(cacheKey),
          120_000,
        );
        if (
          typeof timeoutHandle === "object" &&
          typeof timeoutHandle?.unref === "function"
        ) {
          timeoutHandle.unref();
        }
        cached.timeoutHandle = timeoutHandle;
        validationCache.set(cacheKey, cached);
      }
    }

    const actionsData = cached.actions;
    const discoverableToolCount = cached.discoverableToolCount;
    const hasActions = actionsData.length > 0;
    const actionNames = `Possible response actions: ${formatActionNames(actionsData)}`;

    return {
      data: { actionsData },
      values: {
        actionNames,
        actionExamples: hasActions
          ? addHeader(
              "# Action Examples",
              composeActionExamples(actionsData, 10),
            )
          : "",
        actionsWithDescriptions: hasActions
          ? addHeader(
              "# Available Actions",
              formatActionsWithoutParams(actionsData),
            )
          : "",
        actionsWithParams: hasActions
          ? addHeader(
              "# Available Actions (with parameter schemas)",
              formatActionsWithParams(actionsData),
            )
          : "",
        discoverableToolCount:
          discoverableToolCount > 0 ? String(discoverableToolCount) : "",
      },
      text: hasActions
        ? [
            actionNames,
            addHeader(
              "# Available Actions",
              formatActionsWithoutParams(actionsData),
            ),
            addHeader(
              "# Action Examples",
              composeActionExamples(actionsData, 10),
            ),
          ].join("\n\n")
        : actionNames,
    };
  },
};
