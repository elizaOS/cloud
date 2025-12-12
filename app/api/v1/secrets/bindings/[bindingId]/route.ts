/**
 * Secret Binding API - Individual binding operations
 *
 * DELETE /api/v1/secrets/bindings/:bindingId - Unbind a secret from a project
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService, type AuditContext } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

type RouteParams = { params: Promise<{ bindingId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { bindingId } = await params;
    const audit: AuditContext = { actorType: "user", actorId: user.id, source: "secrets-bindings-api" };

    await secretsService.unbindSecret(bindingId, user.organization_id, audit);

    logger.info("[Secrets] Unbound", { bindingId, userId: user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unbind secret";
    logger.error("[Secrets] DELETE binding failed", { error: message });
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

