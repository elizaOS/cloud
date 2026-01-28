/**
 * Workflow Provider API
 *
 * GET /api/v1/workflows/provider
 *
 * Returns the workflow provider context for an organization, including:
 * - Runnable workflows (have all required credentials)
 * - Blocked workflows (missing credentials)
 * - Unlock suggestions (what to connect to unlock workflows)
 *
 * This endpoint enables the agent to understand what workflows can be
 * executed and what credentials are needed for blocked workflows.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { workflowProviderService } from "@/lib/services/workflow-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/v1/workflows/provider
 *
 * Returns workflow provider context for the authenticated organization.
 *
 * Query params:
 * - format: "json" | "text" (default: "json")
 *   - json: Returns full structured context
 *   - text: Returns formatted text suitable for agent prompts
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";

    const context = await workflowProviderService.getProviderContext(
      user.organization_id,
    );

    // If text format requested, return formatted text
    if (format === "text") {
      const text = workflowProviderService.formatContextForAgent(context);
      return NextResponse.json({
        text,
        summary: {
          totalWorkflows: context.totalWorkflows,
          runnableCount: context.runnableWorkflows.length,
          blockedCount: context.blockedWorkflows.length,
          suggestionsCount: context.unlockSuggestions.length,
        },
      });
    }

    // Default: return full JSON context
    return NextResponse.json({
      success: true,
      context: {
        totalWorkflows: context.totalWorkflows,
        runnableWorkflows: context.runnableWorkflows.map((w) => ({
          id: w.workflow.id,
          name: w.workflow.name,
          description: w.workflow.description,
          userIntent: w.workflow.userIntent,
          serviceDependencies: w.workflow.serviceDependencies,
          status: w.workflow.status,
          usageCount: w.workflow.usageCount,
          successRate: w.workflow.successRate,
          availableCredentials: w.availableRequirements,
        })),
        blockedWorkflows: context.blockedWorkflows.map((w) => ({
          id: w.workflow.id,
          name: w.workflow.name,
          description: w.workflow.description,
          userIntent: w.workflow.userIntent,
          serviceDependencies: w.workflow.serviceDependencies,
          status: w.workflow.status,
          missingCredentials: w.missingRequirements.map((r) => ({
            provider: r.provider,
            displayName: r.displayName,
            description: r.description,
            connectUrl: r.authUrl,
          })),
        })),
        unlockSuggestions: context.unlockSuggestions.map((s) => ({
          provider: s.provider,
          displayName: s.displayName,
          connectUrl: s.authUrl,
          unlocksCount: s.unlocksCount,
          workflowNames: s.workflowNames,
        })),
      },
    });
  } catch (error) {
    logger.error("[Workflows] Failed to get provider context", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      { error: "Failed to get workflow provider context" },
      { status: 500 },
    );
  }
}
