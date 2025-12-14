import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { verifyAppOwnership, formatRequirement, handleSecretsError } from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;
  await verifyAppOwnership(id, user.organization_id);

  const requirements = await secretsService.getAppSecretRequirements(id);
  return NextResponse.json({ requirements: requirements.map(formatRequirement) });
}

const SyncSchema = z.object({
  requirements: z.array(z.object({
    secretName: z.string().min(1),
    required: z.boolean().optional().default(true),
  })),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;
  await verifyAppOwnership(id, user.organization_id);

  const parsed = SyncSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
  }

  const requirements = await secretsService.syncAppSecretRequirements(id, parsed.data.requirements);
  logger.info("[App Secrets] Synced requirements", { appId: id, count: requirements.length });
  return NextResponse.json({ requirements: requirements.map(formatRequirement) });
}
