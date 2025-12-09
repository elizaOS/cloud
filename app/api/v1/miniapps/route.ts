/**
 * Miniapps API
 * 
 * List and manage deployed miniapps
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miniappDeployService } from "@/lib/services/miniapp-deploy";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/miniapps
 * List all miniapps for the organization
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  logger.info("[Miniapps API] Listing miniapps", {
    organizationId: user.organization_id,
  });

  const miniapps = await miniappDeployService.listMiniapps(user.organization_id!);

  return NextResponse.json({
    success: true,
    miniapps,
    count: miniapps.length,
  });
}


