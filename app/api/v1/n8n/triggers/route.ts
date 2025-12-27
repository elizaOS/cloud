import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import {
  CreateTriggerSchema,
  formatTrigger,
  ErrorResponses,
  N8N_BASE_URL,
} from "@/lib/n8n/schemas";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const workflowId = request.nextUrl.searchParams.get("workflowId");

  if (!workflowId) {
    return NextResponse.json(
      { success: false, error: "workflowId parameter required" },
      { status: 400 },
    );
  }

  const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const triggers = await n8nWorkflowsService.listTriggers(workflowId);
  return NextResponse.json({
    success: true,
    triggers: triggers.map((t) => formatTrigger(t)),
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validation = CreateTriggerSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const { workflowId, triggerType, triggerKey, config } = validation.data;

  const workflow = await n8nWorkflowsService.getWorkflow(workflowId);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  if (triggerType === "cron" && !config.cronExpression) {
    return NextResponse.json(
      { success: false, error: "cronExpression required for cron triggers" },
      { status: 400 },
    );
  }

  const trigger = await n8nWorkflowsService.createTrigger(
    workflowId,
    triggerType,
    triggerKey,
    config,
  );

  const webhookUrl =
    triggerType === "webhook"
      ? `${N8N_BASE_URL}/api/v1/n8n/webhooks/${trigger.trigger_key}`
      : undefined;
  const webhookSecret =
    triggerType === "webhook"
      ? (trigger.config.webhookSecret as string)
      : undefined;

  return NextResponse.json({
    success: true,
    trigger: {
      ...formatTrigger(trigger),
      webhookUrl,
      webhookSecret: webhookSecret
        ? {
            value: webhookSecret,
            warning:
              "Save this secret now - it will not be shown again. Use it to sign webhook requests.",
          }
        : undefined,
    },
  });
}
