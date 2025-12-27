import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { DeployWorkflowSchema, ErrorResponses } from "@/lib/n8n/schemas";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const body = await request.json();
  const validation = DeployWorkflowSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const { instanceId } = validation.data;

  const result = await n8nWorkflowsService.deployWorkflowToN8n(id, instanceId);

  logger.info(`[N8N Workflows] Deployed workflow ${id} to n8n`, {
    workflowId: id,
    instanceId,
    n8nWorkflowId: result.n8nWorkflowId,
  });

  return NextResponse.json({
    success: true,
    n8nWorkflowId: result.n8nWorkflowId,
  });
}
