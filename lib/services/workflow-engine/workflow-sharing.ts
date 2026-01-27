/**
 * Workflow Sharing Service
 *
 * Handles automatic sharing of successful workflows as MCPs.
 * Manages the workflow -> MCP conversion and discovery.
 */

import { logger } from "@/lib/utils/logger";
import { userMcpsService, type CreateMcpParams } from "@/lib/services/user-mcps";
import {
  generatedWorkflowsRepository,
  workflowExecutionsRepository,
} from "@/db/repositories";
import type { GeneratedWorkflow } from "@/db/schemas/generated-workflows";

/**
 * Auto-share criteria
 */
export interface AutoShareCriteria {
  /** Minimum number of successful executions */
  minSuccessfulExecutions: number;
  /** Minimum success rate (0-100) */
  minSuccessRate: number;
  /** Minimum number of total executions */
  minTotalExecutions: number;
}

/**
 * Default criteria for auto-sharing
 */
const DEFAULT_AUTO_SHARE_CRITERIA: AutoShareCriteria = {
  minSuccessfulExecutions: 5,
  minSuccessRate: 80,
  minTotalExecutions: 10,
};

/**
 * Sharing options
 */
export interface ShareWorkflowOptions {
  /** Override workflow name */
  name?: string;
  /** Override description */
  description?: string;
  /** Custom tags */
  tags?: string[];
  /** Pricing type */
  pricingType?: "free" | "credits";
  /** Credits per request */
  creditsPerRequest?: number;
  /** Skip eligibility check */
  force?: boolean;
}

/**
 * Share result
 */
export interface ShareResult {
  success: boolean;
  mcpId?: string;
  mcpSlug?: string;
  error?: string;
}

/**
 * Workflow Sharing Service
 */
class WorkflowSharingService {
  /**
   * Check if a workflow is eligible for sharing
   */
  async checkEligibility(
    workflowId: string,
    criteria: AutoShareCriteria = DEFAULT_AUTO_SHARE_CRITERIA,
  ): Promise<{
    eligible: boolean;
    reasons: string[];
    stats: {
      totalExecutions: number;
      successfulExecutions: number;
      successRate: number;
    };
  }> {
    const workflow = await generatedWorkflowsRepository.getById(workflowId);

    if (!workflow) {
      return {
        eligible: false,
        reasons: ["Workflow not found"],
        stats: { totalExecutions: 0, successfulExecutions: 0, successRate: 0 },
      };
    }

    const stats = await workflowExecutionsRepository.getStats(workflowId);
    const successRate =
      stats.totalExecutions > 0
        ? (stats.successfulExecutions / stats.totalExecutions) * 100
        : 0;

    const reasons: string[] = [];

    // Check status
    if (workflow.status === "draft") {
      reasons.push("Workflow is still in draft status");
    }

    // Check if already shared
    if (workflow.mcp_id) {
      reasons.push("Workflow is already shared");
    }

    // Check execution count
    if (stats.totalExecutions < criteria.minTotalExecutions) {
      reasons.push(
        `Not enough executions (${stats.totalExecutions}/${criteria.minTotalExecutions})`,
      );
    }

    // Check success count
    if (stats.successfulExecutions < criteria.minSuccessfulExecutions) {
      reasons.push(
        `Not enough successful executions (${stats.successfulExecutions}/${criteria.minSuccessfulExecutions})`,
      );
    }

    // Check success rate
    if (successRate < criteria.minSuccessRate) {
      reasons.push(
        `Success rate too low (${successRate.toFixed(1)}%/${criteria.minSuccessRate}%)`,
      );
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      stats: {
        totalExecutions: stats.totalExecutions,
        successfulExecutions: stats.successfulExecutions,
        successRate,
      },
    };
  }

  /**
   * Share a workflow as an MCP
   */
  async shareWorkflow(
    workflowId: string,
    organizationId: string,
    userId: string,
    options: ShareWorkflowOptions = {},
  ): Promise<ShareResult> {
    const workflow = await generatedWorkflowsRepository.getById(workflowId);

    if (!workflow) {
      return { success: false, error: "Workflow not found" };
    }

    // Verify ownership
    if (workflow.organization_id !== organizationId) {
      return { success: false, error: "Not authorized to share this workflow" };
    }

    // Check if already shared
    if (workflow.mcp_id && !options.force) {
      return {
        success: false,
        error: "Workflow is already shared",
      };
    }

    // Check eligibility unless forced
    if (!options.force) {
      const eligibility = await this.checkEligibility(workflowId);
      if (!eligibility.eligible) {
        return {
          success: false,
          error: `Workflow not eligible for sharing: ${eligibility.reasons.join(", ")}`,
        };
      }
    }

    try {
      // Generate MCP parameters
      const mcpParams = this.buildMcpParams(workflow, organizationId, userId, options);

      // Create MCP
      const mcp = await userMcpsService.create(mcpParams);

      // Update workflow with MCP reference
      await generatedWorkflowsRepository.setMcpId(workflowId, mcp.id);

      logger.info("[WorkflowSharing] Workflow shared as MCP", {
        workflowId,
        mcpId: mcp.id,
        mcpSlug: mcp.slug,
        organizationId,
      });

      return {
        success: true,
        mcpId: mcp.id,
        mcpSlug: mcp.slug,
      };
    } catch (error) {
      logger.error("[WorkflowSharing] Failed to share workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Auto-share eligible workflows for an organization
   */
  async autoShareEligibleWorkflows(
    organizationId: string,
    userId: string,
    criteria: AutoShareCriteria = DEFAULT_AUTO_SHARE_CRITERIA,
  ): Promise<{
    checked: number;
    shared: number;
    results: Array<{ workflowId: string; result: ShareResult }>;
  }> {
    // Get all workflows that aren't shared yet
    const workflows = await generatedWorkflowsRepository.listByOrganization(
      organizationId,
      { status: "live" },
    );

    const unsharedWorkflows = workflows.filter((w) => !w.mcp_id);
    const results: Array<{ workflowId: string; result: ShareResult }> = [];

    for (const workflow of unsharedWorkflows) {
      const eligibility = await this.checkEligibility(workflow.id, criteria);

      if (eligibility.eligible) {
        const result = await this.shareWorkflow(
          workflow.id,
          organizationId,
          userId,
          { force: true },
        );
        results.push({ workflowId: workflow.id, result });
      }
    }

    const sharedCount = results.filter((r) => r.result.success).length;

    logger.info("[WorkflowSharing] Auto-share completed", {
      organizationId,
      checked: unsharedWorkflows.length,
      shared: sharedCount,
    });

    return {
      checked: unsharedWorkflows.length,
      shared: sharedCount,
      results,
    };
  }

  /**
   * Unshare a workflow (remove MCP)
   */
  async unshareWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const workflow = await generatedWorkflowsRepository.getById(workflowId);

    if (!workflow) {
      return { success: false, error: "Workflow not found" };
    }

    if (workflow.organization_id !== organizationId) {
      return { success: false, error: "Not authorized" };
    }

    if (!workflow.mcp_id) {
      return { success: false, error: "Workflow is not shared" };
    }

    try {
      // Delete the MCP
      await userMcpsService.delete(workflow.mcp_id, organizationId);

      // Update workflow
      await generatedWorkflowsRepository.update(workflowId, {
        mcp_id: undefined,
        status: "live",
        is_public: false,
        shared_at: undefined,
      });

      logger.info("[WorkflowSharing] Workflow unshared", {
        workflowId,
        organizationId,
      });

      return { success: true };
    } catch (error) {
      logger.error("[WorkflowSharing] Failed to unshare workflow", {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Build MCP creation parameters from workflow
   */
  private buildMcpParams(
    workflow: GeneratedWorkflow,
    organizationId: string,
    userId: string,
    options: ShareWorkflowOptions,
  ): CreateMcpParams {
    const slug = this.generateSlug(options.name || workflow.name);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    return {
      name: options.name || workflow.name,
      slug,
      description:
        options.description ||
        workflow.description ||
        `AI-generated workflow: ${workflow.user_intent}`,
      organizationId,
      userId,
      category: workflow.category || "workflows",
      endpointType: "external",
      externalEndpoint: `${appUrl}/api/v1/workflows/${workflow.id}/execute`,
      transportType: "http",
      tools: [
        {
          name: "execute",
          description: workflow.user_intent,
          inputSchema: {
            type: "object",
            properties: {
              params: {
                type: "object",
                description: "Parameters for the workflow",
              },
            },
          },
        },
      ],
      pricingType: options.pricingType || "free",
      creditsPerRequest:
        options.pricingType === "credits" ? options.creditsPerRequest || 1 : 0,
      tags: options.tags || (workflow.tags as string[]) || [],
      icon: "workflow",
      color: "#10B981",
    };
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return `wf-${base}-${Date.now().toString(36)}`;
  }

  /**
   * Get shared workflows (public registry)
   */
  async getPublicWorkflows(options?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<GeneratedWorkflow[]> {
    return generatedWorkflowsRepository.listPublic(options);
  }
}

export const workflowSharingService = new WorkflowSharingService();
