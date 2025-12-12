import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { CreateVariableSchema, formatVariable, ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const variables = await n8nWorkflowsService.getGlobalVariables(user.organization_id);
  return NextResponse.json({ success: true, variables: variables.map(formatVariable) });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validation = CreateVariableSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { name, value, type, isSecret, description } = validation.data;
  const variable = await n8nWorkflowsService.createVariable({
    organizationId: user.organization_id,
    name,
    value,
    type,
    isSecret,
    description,
  });

  logger.info(`[N8N Variables] Created variable: ${name}`, {
    organizationId: user.organization_id,
    variableId: variable.id,
  });

  return NextResponse.json({ success: true, variable: formatVariable(variable) });
}


