import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import {
  UpdateVariableSchema,
  formatVariable,
  ErrorResponses,
} from "@/lib/n8n/schemas";

export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;
  const body = await request.json();
  const validation = UpdateVariableSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      ErrorResponses.invalidRequest(validation.error.format()),
      { status: 400 },
    );
  }

  const variable = await n8nWorkflowsService.updateVariable(
    id,
    validation.data,
  );
  logger.info(`[N8N Variables] Updated variable: ${id}`);
  return NextResponse.json({
    success: true,
    variable: formatVariable(variable),
  });
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;
  await n8nWorkflowsService.deleteVariable(id);
  logger.info(`[N8N Variables] Deleted variable: ${id}`);
  return NextResponse.json({ success: true });
}
