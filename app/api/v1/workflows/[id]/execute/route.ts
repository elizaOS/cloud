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
} from "@/db/repositories";
import { workflowExecutorService } from "@/lib/services/workflow-executor";

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
