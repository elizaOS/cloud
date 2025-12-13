import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { CreateApiKeySchema, formatApiKey, ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const apiKeys = await n8nWorkflowsService.listApiKeys(user.organization_id);
  return NextResponse.json({ success: true, apiKeys: apiKeys.map(formatApiKey) });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();
  const validation = CreateApiKeySchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { name, scopes, expiresAt } = validation.data;
  const result = await n8nWorkflowsService.createApiKey({
    organizationId: user.organization_id,
    name,
    scopes,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });

  logger.info(`[N8N API Keys] Created API key: ${name}`, {
    organizationId: user.organization_id,
    apiKeyId: result.apiKey.id,
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      ...formatApiKey(result.apiKey),
      plaintextKey: result.plaintextKey,
    },
  });
}


