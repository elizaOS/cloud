import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "50");

  const versions = await n8nWorkflowsService.getWorkflowVersions(id, limit);

  return NextResponse.json({
    success: true,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      changeDescription: v.change_description,
      createdAt: v.created_at,
      createdBy: v.created_by,
    })),
  });
}


