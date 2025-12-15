import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import {
  verifyAppOwnership,
  formatRequirement,
  handleSecretsError,
} from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ id: string; requirementId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id, requirementId } = await params;
  await verifyAppOwnership(id, user.organization_id);

  const requirement =
    await secretsService.revokeAppSecretRequirement(requirementId);
  logger.info("[App Secrets] Revoked requirement", {
    appId: id,
    requirementId,
    userId: user.id,
  });
  return NextResponse.json(formatRequirement(requirement));
}
