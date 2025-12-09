/**
 * N8N Workflow Webhook Endpoint
 *
 * POST /api/v1/n8n/webhooks/:key - Trigger workflow via webhook
 */

import { NextRequest, NextResponse } from "next/server";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/v1/n8n/webhooks/:key
 * Triggers a workflow via webhook.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await ctx.params;

    // Find trigger by key
    const trigger = await n8nWorkflowsService.findTriggerByKey(key);
    if (!trigger) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    if (trigger.trigger_type !== "webhook") {
      return NextResponse.json(
        { success: false, error: "Invalid trigger type" },
        { status: 400 }
      );
    }

    if (!trigger.is_active) {
      return NextResponse.json(
        { success: false, error: "Webhook is not active" },
        { status: 403 }
      );
    }

    // Get request body as input data
    const inputData = await request.json().catch(() => ({}));

    // Execute workflow
    const execution = await n8nWorkflowsService.executeWorkflowTrigger(
      trigger.id,
      inputData
    );

    logger.info(`[N8N Webhooks] Executed workflow via webhook: ${key}`, {
      triggerId: trigger.id,
      workflowId: trigger.workflow_id,
      executionId: execution.id,
    });

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      status: execution.status,
      outputData: execution.output_data,
    });
  } catch (error) {
    logger.error("[N8N Webhooks] Error executing webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute webhook",
      },
      { status: 500 }
    );
  }
}


