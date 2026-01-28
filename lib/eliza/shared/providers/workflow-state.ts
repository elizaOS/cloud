/**
 * Workflow State Provider
 *
 * Provides agent context about available workflows and their execution status.
 * Enables agents to know:
 * - Which workflows are ready to run (have all required credentials)
 * - Which workflows are blocked (missing credentials)
 * - What credentials need to be connected to unlock workflows
 *
 * Shaw's vision: "I can imagine a workflow provider which shows all the workflows
 * and then shows the workflows that have all the secrets in them"
 */

import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import {
  workflowProviderService,
  type WorkflowProviderContext,
} from "@/lib/services/workflow-engine/workflow-provider";
import { logger } from "@/lib/utils/logger";

/**
 * Extended state with organization context
 */
interface ExtendedState extends State {
  organizationId?: string;
}

/**
 * Workflow State Provider
 *
 * Provides information about available workflows and their runnable status
 * to the agent context.
 */
export const workflowStateProvider: Provider = {
  name: "WORKFLOW_STATE",
  description: "Available workflows and their execution readiness status",

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    state: State,
  ): Promise<{
    values: Record<string, unknown>;
    data: WorkflowProviderContext | null;
    text: string;
  }> => {
    const extendedState = state as ExtendedState;
    const organizationId = extendedState.organizationId;

    // If no organization context, return empty
    if (!organizationId) {
      logger.debug(
        "[WorkflowStateProvider] No organization context available",
      );
      return {
        values: {
          hasWorkflows: false,
          runnableCount: 0,
          blockedCount: 0,
        },
        data: null,
        text: "",
      };
    }

    try {
      // Get workflow provider context
      const context =
        await workflowProviderService.getProviderContext(organizationId);

      // Format for agent consumption
      const text = workflowProviderService.formatContextForAgent(context);

      // Values for template interpolation
      const values = {
        hasWorkflows: context.totalWorkflows > 0,
        totalWorkflows: context.totalWorkflows,
        runnableCount: context.runnableWorkflows.length,
        blockedCount: context.blockedWorkflows.length,
        runnableWorkflowNames: context.runnableWorkflows.map(
          (w) => w.workflow.name,
        ),
        blockedWorkflowNames: context.blockedWorkflows.map(
          (w) => w.workflow.name,
        ),
        suggestedConnections: context.unlockSuggestions.map((s) => ({
          provider: s.provider,
          displayName: s.displayName,
          unlocksCount: s.unlocksCount,
        })),
      };

      logger.debug("[WorkflowStateProvider] Generated workflow state", {
        organizationId,
        totalWorkflows: context.totalWorkflows,
        runnableCount: context.runnableWorkflows.length,
        blockedCount: context.blockedWorkflows.length,
      });

      return {
        values,
        data: context,
        text,
      };
    } catch (error) {
      logger.error("[WorkflowStateProvider] Failed to get workflow state", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        values: {
          hasWorkflows: false,
          runnableCount: 0,
          blockedCount: 0,
          error: true,
        },
        data: null,
        text: "Unable to load workflow information at this time.",
      };
    }
  },
};
