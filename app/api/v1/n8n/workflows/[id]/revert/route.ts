import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { RevertWorkflowSchema, ErrorResponses } from "@/lib/n8n/schemas";

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
  const validation = RevertWorkflowSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const { version } = validation.data;

  const reverted = await n8nWorkflowsService.revertWorkflowToVersion(
    id,
    version,
    user.id,
  );

  return NextResponse.json({
    success: true,
    workflow: {
      id: reverted.id,
      version: reverted.version,
      updatedAt: reverted.updated_at,
    },
  });
}
