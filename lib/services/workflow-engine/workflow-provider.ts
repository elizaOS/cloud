/**
 * Workflow Provider Service
 *
 * Provides agent context about available workflows and their execution status.
 * Determines which workflows are runnable (have all secrets) vs blocked (missing secrets).
 * This enables Shaw's vision: "I can imagine a workflow provider which shows all the
 * workflows and then shows the workflows that have all the secrets in them"
 */

import { logger } from "@/lib/utils/logger";
import { generatedWorkflowsRepository } from "@/db/repositories/generated-workflows";
import { workflowSecretRequirementsRepository } from "@/db/repositories/workflow-secret-requirements";
import type { GeneratedWorkflow } from "@/db/schemas/generated-workflows";
import type { WorkflowSecretRequirement } from "@/db/schemas/workflow-secret-requirements";
import { googleAutomationService } from "@/lib/services/google-automation";
import { blooioAutomationService } from "@/lib/services/blooio-automation";
import { twilioAutomationService } from "@/lib/services/twilio-automation";

/**
 * Missing requirement with user-friendly info
 */
export interface MissingRequirement {
  provider: string;
  displayName: string;
  description: string;
  authUrl: string;
  scopes?: string[];
}

/**
 * Workflow availability status
 */
export interface WorkflowAvailability {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    userIntent: string;
    serviceDependencies: string[];
    status: string;
    usageCount: number;
    successRate: string | null;
  };
  status: "runnable" | "blocked" | "needs_configuration";
  missingRequirements: MissingRequirement[];
  availableRequirements: string[];
}

/**
 * Unlock suggestion - tells user what to connect to unlock workflows
 */
export interface UnlockSuggestion {
  provider: string;
  displayName: string;
  authUrl: string;
  unlocksCount: number;
  workflowNames: string[];
}

/**
 * Full context for agent about available workflows
 */
export interface WorkflowProviderContext {
  runnableWorkflows: WorkflowAvailability[];
  blockedWorkflows: WorkflowAvailability[];
  totalWorkflows: number;
  unlockSuggestions: UnlockSuggestion[];
}

/**
 * Connected service status cache
 */
interface ServiceConnectionStatus {
  provider: string;
  connected: boolean;
  scopes?: string[];
}

/**
 * Base URL for auth redirects
 */
const getBaseUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

/**
 * Get auth URL for a provider
 */
const getAuthUrl = (provider: string): string => {
  const baseUrl = getBaseUrl();
  switch (provider) {
    case "google":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=google`;
    case "twilio":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=twilio`;
    case "blooio":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=blooio`;
    case "notion":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=notion`;
    case "telegram":
      return `${baseUrl}/dashboard/settings?tab=connections&connect=telegram`;
    default:
      return `${baseUrl}/dashboard/settings?tab=connections`;
  }
};

/**
 * Display names for providers
 */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  google: "Google",
  twilio: "Twilio SMS",
  blooio: "Blooio iMessage",
  notion: "Notion",
  telegram: "Telegram",
};

/**
 * Workflow Provider Service
 */
class WorkflowProviderService {
  /**
   * Get full context for agent about available workflows
   */
  async getProviderContext(
    organizationId: string,
  ): Promise<WorkflowProviderContext> {
    const startTime = Date.now();

    try {
      // Get all workflows for this organization
      const workflows = await generatedWorkflowsRepository.listByOrganization(
        organizationId,
        { limit: 100 },
      );

      if (workflows.length === 0) {
        return {
          runnableWorkflows: [],
          blockedWorkflows: [],
          totalWorkflows: 0,
          unlockSuggestions: [],
        };
      }

      // Get all secret requirements for these workflows in one query
      const workflowIds = workflows.map((w) => w.id);
      const allRequirements =
        await workflowSecretRequirementsRepository.getByWorkflowIds(workflowIds);

      // Group requirements by workflow ID
      const requirementsByWorkflow = new Map<
        string,
        WorkflowSecretRequirement[]
      >();
      for (const req of allRequirements) {
        const existing = requirementsByWorkflow.get(req.workflow_id) || [];
        existing.push(req);
        requirementsByWorkflow.set(req.workflow_id, existing);
      }

      // Get organization's connected services
      const connections = await this.getOrgConnections(organizationId);

      // Check availability for each workflow
      const availability: WorkflowAvailability[] = [];

      for (const workflow of workflows) {
        const requirements = requirementsByWorkflow.get(workflow.id) || [];
        const workflowAvailability = this.checkWorkflowAvailability(
          workflow,
          requirements,
          connections,
        );
        availability.push(workflowAvailability);
      }

      // Group by status
      const runnableWorkflows = availability.filter(
        (a) => a.status === "runnable",
      );
      const blockedWorkflows = availability.filter(
        (a) => a.status === "blocked" || a.status === "needs_configuration",
      );

      // Generate unlock suggestions
      const unlockSuggestions = this.generateUnlockSuggestions(blockedWorkflows);

      logger.info("[WorkflowProvider] Generated provider context", {
        organizationId,
        totalWorkflows: workflows.length,
        runnableCount: runnableWorkflows.length,
        blockedCount: blockedWorkflows.length,
        suggestionsCount: unlockSuggestions.length,
        durationMs: Date.now() - startTime,
      });

      return {
        runnableWorkflows,
        blockedWorkflows,
        totalWorkflows: workflows.length,
        unlockSuggestions,
      };
    } catch (error) {
      logger.error("[WorkflowProvider] Failed to get provider context", {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get availability status for a single workflow
   */
  async getWorkflowStatus(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowAvailability | null> {
    try {
      const workflow = await generatedWorkflowsRepository.getById(workflowId);
      if (!workflow) {
        return null;
      }

      const requirements =
        await workflowSecretRequirementsRepository.getByWorkflowId(workflowId);
      const connections = await this.getOrgConnections(organizationId);

      return this.checkWorkflowAvailability(workflow, requirements, connections);
    } catch (error) {
      logger.error("[WorkflowProvider] Failed to get workflow status", {
        workflowId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get organization's connected services
   */
  private async getOrgConnections(
    organizationId: string,
  ): Promise<ServiceConnectionStatus[]> {
    const connections: ServiceConnectionStatus[] = [];

    // Check Google
    try {
      const googleStatus =
        await googleAutomationService.getConnectionStatus(organizationId);
      connections.push({
        provider: "google",
        connected: googleStatus.connected,
        scopes: googleStatus.scopes,
      });
    } catch {
      connections.push({ provider: "google", connected: false });
    }

    // Check Blooio
    try {
      const blooioStatus =
        await blooioAutomationService.getConnectionStatus(organizationId);
      connections.push({
        provider: "blooio",
        connected: blooioStatus.connected,
      });
    } catch {
      connections.push({ provider: "blooio", connected: false });
    }

    // Check Twilio
    try {
      const twilioStatus =
        await twilioAutomationService.getConnectionStatus(organizationId);
      connections.push({
        provider: "twilio",
        connected: twilioStatus.connected,
      });
    } catch {
      connections.push({ provider: "twilio", connected: false });
    }

    // Notion (not yet implemented)
    connections.push({ provider: "notion", connected: false });

    // Telegram (check env var as fallback)
    connections.push({
      provider: "telegram",
      connected: !!process.env.TELEGRAM_BOT_TOKEN,
    });

    return connections;
  }

  /**
   * Check availability for a single workflow
   */
  private checkWorkflowAvailability(
    workflow: GeneratedWorkflow,
    requirements: WorkflowSecretRequirement[],
    connections: ServiceConnectionStatus[],
  ): WorkflowAvailability {
    const connectionMap = new Map(connections.map((c) => [c.provider, c]));

    const missingRequirements: MissingRequirement[] = [];
    const availableRequirements: string[] = [];

    for (const req of requirements) {
      const connection = connectionMap.get(req.provider);
      const isConnected = connection?.connected ?? false;

      // For OAuth providers, also check scopes
      let hasRequiredScopes = true;
      if (isConnected && req.scopes && req.scopes.length > 0) {
        hasRequiredScopes = req.scopes.every(
          (scope) => connection?.scopes?.includes(scope) ?? false,
        );
      }

      if (isConnected && hasRequiredScopes) {
        availableRequirements.push(req.provider);
      } else {
        missingRequirements.push({
          provider: req.provider,
          displayName: req.display_name,
          description: req.description,
          authUrl: req.auth_url ?? getAuthUrl(req.provider),
          scopes: req.scopes ?? undefined,
        });
      }
    }

    // Determine status
    let status: WorkflowAvailability["status"];
    if (requirements.length === 0) {
      // No requirements means runnable (or needs_configuration if no execution plan)
      const hasExecutionPlan =
        workflow.execution_plan && workflow.execution_plan.length > 0;
      status = hasExecutionPlan ? "runnable" : "needs_configuration";
    } else if (missingRequirements.length === 0) {
      status = "runnable";
    } else {
      status = "blocked";
    }

    return {
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        userIntent: workflow.user_intent,
        serviceDependencies: workflow.service_dependencies as string[],
        status: workflow.status,
        usageCount: workflow.usage_count,
        successRate: workflow.success_rate,
      },
      status,
      missingRequirements,
      availableRequirements: [...new Set(availableRequirements)],
    };
  }

  /**
   * Generate suggestions for what providers to connect to unlock workflows
   */
  private generateUnlockSuggestions(
    blockedWorkflows: WorkflowAvailability[],
  ): UnlockSuggestion[] {
    // Group blocked workflows by missing provider
    const providerToWorkflows = new Map<string, string[]>();

    for (const wf of blockedWorkflows) {
      for (const missing of wf.missingRequirements) {
        const existing = providerToWorkflows.get(missing.provider) || [];
        if (!existing.includes(wf.workflow.name)) {
          existing.push(wf.workflow.name);
        }
        providerToWorkflows.set(missing.provider, existing);
      }
    }

    // Convert to suggestions sorted by impact (most workflows unlocked first)
    const suggestions: UnlockSuggestion[] = [];

    for (const [provider, workflowNames] of providerToWorkflows) {
      suggestions.push({
        provider,
        displayName: PROVIDER_DISPLAY_NAMES[provider] || provider,
        authUrl: getAuthUrl(provider),
        unlocksCount: workflowNames.length,
        workflowNames,
      });
    }

    // Sort by number of workflows unlocked (descending)
    suggestions.sort((a, b) => b.unlocksCount - a.unlocksCount);

    return suggestions;
  }

  /**
   * Format context for text output (used by agent provider)
   */
  formatContextForAgent(context: WorkflowProviderContext): string {
    let output = "## Available Workflows\n\n";

    // Runnable workflows
    output += `### Ready to Run (${context.runnableWorkflows.length})\n`;
    if (context.runnableWorkflows.length === 0) {
      output += "No workflows are currently ready to run.\n";
    } else {
      for (const w of context.runnableWorkflows) {
        output += `- **${w.workflow.name}**: ${w.workflow.description || w.workflow.userIntent}\n`;
      }
    }

    // Blocked workflows
    if (context.blockedWorkflows.length > 0) {
      output += `\n### Blocked - Missing Connections (${context.blockedWorkflows.length})\n`;
      for (const w of context.blockedWorkflows) {
        const missing = w.missingRequirements
          .map((r) => r.displayName)
          .join(", ");
        output += `- **${w.workflow.name}**: Needs ${missing}\n`;
      }

      // Unlock suggestions
      output += "\n### Unlock Suggestions\n";
      for (const s of context.unlockSuggestions.slice(0, 3)) {
        output += `- Connect **${s.displayName}** to unlock ${s.unlocksCount} workflow${s.unlocksCount !== 1 ? "s" : ""}\n`;
      }
    }

    return output;
  }
}

export const workflowProviderService = new WorkflowProviderService();
