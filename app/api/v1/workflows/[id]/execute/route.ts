/**
 * Workflow Execute API
 *
 * POST /api/v1/workflows/[id]/execute - Execute a workflow
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import {
  generatedWorkflowsRepository,
  workflowExecutionsRepository,
  workflowTemplatesRepository,
} from "@/db/repositories";
import { workflowExecutorService } from "@/lib/services/workflow-executor";
import { workflowTemplateSearchService } from "@/lib/services/workflow-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 1 minute for execution

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ExecuteRequest {
  params?: Record<string, unknown>;
  triggeredBy?: "user" | "agent" | "schedule";
  agentId?: string;
  roomId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const startTime = Date.now();

  try {
    const workflow = await generatedWorkflowsRepository.getById(id);

    if (!workflow) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check access - either owner or public workflow
    if (
      workflow.organization_id !== user.organization_id &&
      !workflow.is_public
    ) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 },
      );
    }

    // Check status
    if (workflow.status === "draft" || workflow.status === "deprecated") {
      return NextResponse.json(
        { error: `Cannot execute workflow in ${workflow.status} status` },
        { status: 400 },
      );
    }

    const body = (await request.json()) as ExecuteRequest;
    const inputParams = body.params || {};

    // Create execution record
    const execution = await workflowExecutionsRepository.create({
      workflow_id: workflow.id,
      organization_id: user.organization_id,
      user_id: user.id,
      status: "running",
      input_params: inputParams,
      metadata: {
        triggeredBy: body.triggeredBy || "user",
        agentId: body.agentId,
        roomId: body.roomId,
      },
    });

    logger.info("[Workflows] Executing workflow", {
      workflowId: workflow.id,
      executionId: execution.id,
      organizationId: user.organization_id,
    });

    try {
      // Execute the workflow using the executor service
      const executionResult = await workflowExecutorService.execute({
        organizationId: user.organization_id,
        userId: user.id,
        workflowId: workflow.id,
        input: {
          executionPlan: workflow.execution_plan,
          params: inputParams,
        },
        dryRun: inputParams.dryRun === true,
      });

      // Handle pre-flight validation failure (missing credentials)
      if (executionResult.preflightFailure && executionResult.missingCredentials) {
        const executionTimeMs = executionResult.executionTimeMs;

        // Update execution record with credential failure
        await workflowExecutionsRepository.complete(
          execution.id,
          {
            success: false,
            error: "Missing required credentials",
            message: "Workflow execution blocked - missing connections",
          },
          executionTimeMs,
        );

        const missingProviders = executionResult.missingCredentials.map(
          (c) => c.displayName || c.provider,
        );

        logger.warn("[Workflows] Workflow blocked by missing credentials", {
          workflowId: workflow.id,
          executionId: execution.id,
          missingProviders,
        });

        return NextResponse.json(
          {
            success: false,
            executionId: execution.id,
            error: "Cannot execute workflow - missing connections",
            preflightFailure: true,
            details: {
              missingCredentials: executionResult.missingCredentials.map((c) => ({
                provider: c.provider,
                displayName: c.displayName || c.provider,
                description: c.description,
                connectUrl: c.authUrl,
                stepNumber: c.stepNumber,
              })),
            },
            suggestion: `Connect ${missingProviders[0]} to run this workflow`,
            executionTimeMs,
          },
          { status: 400 },
        );
      }

      const result = {
        success: executionResult.success,
        data: {
          output: executionResult.output,
          steps: executionResult.steps,
          workflowId: workflow.id,
        },
        message: executionResult.success
          ? `Workflow "${workflow.name}" executed successfully`
          : `Workflow "${workflow.name}" failed: ${executionResult.error}`,
        error: executionResult.error,
      };

      const executionTimeMs = executionResult.executionTimeMs;

      // Update execution record
      await workflowExecutionsRepository.complete(
        execution.id,
        result,
        executionTimeMs,
      );

      // Update workflow stats
      await generatedWorkflowsRepository.incrementUsage(
        workflow.id,
        result.success,
        executionTimeMs,
      );

      logger.info("[Workflows] Workflow executed", {
        workflowId: workflow.id,
        executionId: execution.id,
        success: result.success,
        executionTimeMs,
      });

      // Auto-cache successful workflows as templates (Shaw's vision)
      // Criteria: 3+ uses, 80%+ success rate, not already a template
      if (result.success) {
        const updatedWorkflow = await generatedWorkflowsRepository.getById(workflow.id);
        if (updatedWorkflow) {
          const successRate = parseFloat(updatedWorkflow.success_rate || "0");
          const shouldCache =
            updatedWorkflow.usage_count >= 3 &&
            successRate >= 80 &&
            !updatedWorkflow.is_public; // Don't auto-template if already shared

          if (shouldCache) {
            // Check if template already exists
            const existingTemplate = await workflowTemplatesRepository.existsForWorkflow(
              workflow.id,
            );

            if (!existingTemplate) {
              // Save as template asynchronously (don't block response)
              workflowTemplateSearchService
                .saveAsTemplate(updatedWorkflow, {
                  description: updatedWorkflow.description || undefined,
                })
                .then(() => {
                  logger.info("[Workflows] Auto-cached workflow as template", {
                    workflowId: workflow.id,
                    usageCount: updatedWorkflow.usage_count,
                    successRate,
                  });
                })
                .catch((err) => {
                  logger.error("[Workflows] Failed to auto-cache as template", {
                    workflowId: workflow.id,
                    error: err instanceof Error ? err.message : String(err),
                  });
                });
            }
          }
        }
      }

      // If execution failed (but not preflight), provide helpful error details
      if (!executionResult.success) {
        const failedStep = executionResult.steps?.find((s) => !s.success);
        return NextResponse.json(
          {
            success: false,
            executionId: execution.id,
            result,
            executionTimeMs,
            failedStep: failedStep
              ? {
                  name: failedStep.stepName,
                  error: failedStep.error,
                }
              : undefined,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        executionId: execution.id,
        result,
        executionTimeMs,
      });
    } catch (execError) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage =
        execError instanceof Error ? execError.message : String(execError);

      // Update execution record with failure
      await workflowExecutionsRepository.complete(
        execution.id,
        {
          success: false,
          error: errorMessage,
          message: "Workflow execution failed",
        },
        executionTimeMs,
      );

      // Update workflow stats
      await generatedWorkflowsRepository.incrementUsage(
        workflow.id,
        false,
        executionTimeMs,
      );

      logger.error("[Workflows] Workflow execution failed", {
        workflowId: workflow.id,
        executionId: execution.id,
        error: errorMessage,
      });

      return NextResponse.json(
        {
          success: false,
          executionId: execution.id,
          error: errorMessage,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error("[Workflows] Failed to execute workflow", {
      error: error instanceof Error ? error.message : String(error),
      workflowId: id,
    });

    return NextResponse.json(
      { error: "Failed to execute workflow" },
      { status: 500 },
    );
  }
}
