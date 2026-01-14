/**
 * Webhook Trigger API for Workflows
 *
 * POST /api/workflows/webhook/[workflowId]
 * Triggers a workflow execution via HTTP webhook.
 */

import { NextRequest, NextResponse } from "next/server";
import { workflowsRepository } from "@/db/repositories";
import { workflowExecutorService } from "@/lib/services/workflow-executor";
import { logger } from "@/lib/utils/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await params;

  // Get webhook secret from headers (optional security)
  const webhookSecret = request.headers.get("x-webhook-secret");

  // Parse request body as trigger input
  let triggerInput: Record<string, unknown> = {};
  try {
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      triggerInput = await request.json();
    }
  } catch {
    // Empty body is OK
  }

  // Find workflow
  const workflow = await workflowsRepository.findById(workflowId);

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // Check if workflow has webhook trigger enabled
  if (workflow.trigger_config.type !== "webhook") {
    return NextResponse.json(
      { error: "Workflow does not have webhook trigger enabled" },
      { status: 400 },
    );
  }

  // Verify webhook secret if configured
  const configuredSecret = workflow.trigger_config.webhookSecret;
  if (configuredSecret && webhookSecret !== configuredSecret) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  logger.info("[Webhook] Triggering workflow", {
    workflowId,
    organizationId: workflow.organization_id,
  });

  // Execute workflow
  const result = await workflowExecutorService.execute(
    workflowId,
    workflow.organization_id,
    workflow.created_by_user_id,
    {
      ...triggerInput,
      _trigger: {
        type: "webhook",
        timestamp: new Date().toISOString(),
        headers: Object.fromEntries(request.headers.entries()),
      },
    },
  );

  if (!result.success) {
    logger.error("[Webhook] Workflow execution failed", {
      workflowId,
      error: result.error,
    });

    return NextResponse.json(
      {
        success: false,
        error: result.error,
        logs: result.logs,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    workflowId,
    executionTime: result.totalDurationMs,
    creditsCharged: result.creditsCharged,
    outputs: result.outputs,
  });
}

// GET returns webhook info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await params;

  const workflow = await workflowsRepository.findById(workflowId);

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const baseUrl = request.nextUrl.origin;
  const webhookUrl = `${baseUrl}/api/workflows/webhook/${workflowId}`;

  return NextResponse.json({
    workflowId,
    workflowName: workflow.name,
    webhookUrl,
    triggerType: workflow.trigger_config.type,
    requiresSecret: !!workflow.trigger_config.webhookSecret,
    usage: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workflow.trigger_config.webhookSecret && {
          "x-webhook-secret": "<your-secret>",
        }),
      },
      body: "{ /* your trigger data */ }",
    },
  });
}
