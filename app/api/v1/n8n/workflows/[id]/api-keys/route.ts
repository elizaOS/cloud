import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import {
  CreateApiKeySchema,
  formatApiKey,
  ErrorResponses,
} from "@/lib/n8n/schemas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const workflow = await n8nWorkflowsService.getWorkflow(id);
  if (!workflow || workflow.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.workflowNotFound, { status: 404 });
  }

  const apiKeys = await n8nWorkflowsService.listApiKeys(
    user.organization_id,
    id,
  );
  return NextResponse.json({
    success: true,
    apiKeys: apiKeys.map(formatApiKey),
  });
}

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
  const validation = CreateApiKeySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const { name, scopes, expiresAt } = validation.data;
  const result = await n8nWorkflowsService.createApiKey({
    organizationId: user.organization_id,
    workflowId: id,
    name,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      ...formatApiKey(result.apiKey),
      plaintextKey: result.plaintextKey,
    },
  });
}
