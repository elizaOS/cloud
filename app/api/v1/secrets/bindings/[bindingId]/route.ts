import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";
import { createAudit, handleSecretsError } from "@/lib/api/secrets-helpers";

type RouteParams = { params: Promise<{ bindingId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { bindingId } = await params;
    await secretsService.unbindSecret(bindingId, user.organization_id, createAudit(user, "secrets-bindings-api"));
    logger.info("[Secrets] Unbound", { bindingId, userId: user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleSecretsError(error, "Secrets Bindings");
  }
}
