/**
 * App Secret Requirement API - Revoke requirement
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { verifyAppOwnership, formatRequirement, handleSecretsError } from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ appId: string; requirementId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { appId, requirementId } = await params;
    await verifyAppOwnership(appId, user.organization_id);

    const requirement = await secretsService.revokeAppSecretRequirement(requirementId);
    logger.info("[App Secrets] Revoked requirement", { appId, requirementId, userId: user.id });
    return NextResponse.json(formatRequirement(requirement));
  } catch (error) {
    return handleSecretsError(error, "App Secrets");
  }
}
