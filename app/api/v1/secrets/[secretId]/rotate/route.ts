import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, isSecretsConfigured } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { buildDetailedAudit } from "@/lib/api/secrets-helpers";

export const maxDuration = 30;

const RotateSchema = z.object({
  newValue: z.string().min(1).max(65536),
});

type RouteContext = { params: Promise<{ secretId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { secretId } = await params;

  if (!isSecretsConfigured()) {
    return NextResponse.json({ error: "Secrets service not configured" }, { status: 503 });
  }

  const parsed = RotateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const rotated = await secretsService.rotate(
    secretId,
    authResult.user.organization_id,
    parsed.data.newValue,
    buildDetailedAudit(request, authResult)
  );

  logger.info("[Secrets] Rotated", { secretId, version: rotated.version });

  return NextResponse.json({
    id: rotated.id,
    name: rotated.name,
    version: rotated.version,
    lastRotatedAt: rotated.lastRotatedAt?.toISOString(),
    updatedAt: rotated.updatedAt.toISOString(),
  });
}
