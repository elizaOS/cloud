import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import {
  CreateVariableSchema,
  formatVariable,
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

  const variables = await n8nWorkflowsService.getWorkflowVariables(id);
  return NextResponse.json({
    success: true,
    variables: variables.map(formatVariable),
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
  const validation = CreateVariableSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const { name, value, type, isSecret, description } = validation.data;
  const variable = await n8nWorkflowsService.createVariable({
    organizationId: user.organization_id,
    workflowId: id,
    name,
    value,
    type,
    isSecret,
    description,
  });

  return NextResponse.json({
    success: true,
    variable: formatVariable(variable),
  });
}
