import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { verifyAppOwnership, formatRequirement, handleSecretsError } from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ appId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { appId } = await params;
    await verifyAppOwnership(appId, user.organization_id);

    const requirements = await secretsService.getAppSecretRequirements(appId);
    return NextResponse.json({ requirements: requirements.map(formatRequirement) });
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
  }
}

const SyncSchema = z.object({
  requirements: z.array(z.object({
    secretName: z.string().min(1),
    required: z.boolean().optional().default(true),
  })),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { appId } = await params;
    await verifyAppOwnership(appId, user.organization_id);

    const parsed = SyncSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });
    }

    const requirements = await secretsService.syncAppSecretRequirements(appId, parsed.data.requirements);
    logger.info("[App Secrets] Synced requirements", { appId, count: requirements.length });
    return NextResponse.json({ requirements: requirements.map(formatRequirement) });
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
  }
}
