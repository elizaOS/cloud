/**
 * App Secret Requirement Approval API
 *
 * POST /api/v1/apps/:appId/secrets/:requirementId/approve - Approve a secret requirement
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { secretsService } from "@/lib/services/secrets";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

type RouteParams = { params: Promise<{ appId: string; requirementId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { appId, requirementId } = await params;

  // Verify app belongs to org
  const app = await appsService.getById(appId);
  if (!app || app.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const requirement = await secretsService.approveAppSecretRequirement(
    requirementId,
    user.id
  );

  logger.info("[App Secrets] Approved requirement", { appId, requirementId, userId: user.id });

  return NextResponse.json({
    id: requirement.id,
    secretName: requirement.secret_name,
    required: requirement.required,
    approved: requirement.approved,
    approvedBy: requirement.approved_by,
    approvedAt: requirement.approved_at?.toISOString(),
  });
}

