/** ACTIONS Provider - Provides available actions with parameter schemas to the LLM. */
import type { Action, IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { addHeader, composeActionExamples, formatActionNames, logger } from "@elizaos/core";
import type { ActionParameter, ActionWithParams } from "../types";

function formatActionsWithoutParams(actions: Action[]): string {
  return actions.map((a) => `## ${a.name}\n${a.description}`).join("\n\n---\n\n");
}

function formatActionsWithParams(actions: Action[]): string {
  return actions.map((action) => {
    const params = (action as ActionWithParams).parameters;
    let formatted = `## ${action.name}\n${action.description}`;

    if (!params) return formatted;
    
    const entries = Object.entries(params);
    if (entries.length === 0) {
      return formatted + "\n\n**Parameters:** None (can be called directly without parameters)";
    }

    formatted += "\n\n**Parameters:**";
    for (const [name, def] of entries) {
      const required = def.required ? "(required)" : "(optional)";
      formatted += `\n- \`${name}\` ${required}: ${def.type} - ${def.description}`;
    }
    return formatted;
  }).join("\n\n---\n\n");
}

export const actionsProvider: Provider = {
  name: "ACTIONS",
  description: "Available actions with parameter schemas",
  position: -1,

  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    // Get actions that validate for this message
    const actionsData = (await Promise.all(
      runtime.actions.map(async (action: Action) => {
        try {
          return (await action.validate(runtime, message, state)) ? action : null;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          logger.error(`[ACTIONS] validate error: ${action.name}`, errorMessage);
          return null;
        }
      })
    )).filter((a): a is Action => a !== null);

    const hasActions = actionsData.length > 0;
    const actionNames = `Possible response actions: ${formatActionNames(actionsData)}`;

    // Get discoverable tool count from MCP service (Tier-2 tools not in the visible set)
    let discoverableToolCount = 0;
    try {
      const mcpSvc = runtime.getService("mcp");
      if (mcpSvc && typeof (mcpSvc as Record<string, unknown>).getTier2Index === "function") {
        const index = (mcpSvc as { getTier2Index: () => { getToolCount: () => number } }).getTier2Index();
        const count = index?.getToolCount?.();
        if (typeof count === "number") discoverableToolCount = count;
      }
    } catch { /* MCP service may not be available */ }

    return {
      data: { actionsData },
      values: {
        actionNames,
        actionExamples: hasActions ? addHeader("# Action Examples", composeActionExamples(actionsData, 10)) : "",
        actionsWithDescriptions: hasActions ? addHeader("# Available Actions", formatActionsWithoutParams(actionsData)) : "",
        actionsWithParams: hasActions ? addHeader("# Available Actions (with parameter schemas)", formatActionsWithParams(actionsData)) : "",
        discoverableToolCount: discoverableToolCount > 0 ? String(discoverableToolCount) : "",
      },
      text: hasActions
        ? [actionNames, addHeader("# Available Actions", formatActionsWithoutParams(actionsData)), addHeader("# Action Examples", composeActionExamples(actionsData, 10))].join("\n\n")
        : actionNames,
    };
  },
};
