/**
 * Domain Availability Check API
 *
 * GET /api/v1/domains/check - Check if a specific domain is available
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { domainModerationService } from "@/lib/services/domain-moderation";
import { logger } from "@/lib/utils/logger";

const CheckQuerySchema = z.object({
  domain: z.string().min(3).max(253),
});

/**
 * GET /api/v1/domains/check
 * Check if a specific domain is available for purchase
 */
export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  const parsed = CheckQuerySchema.safeParse({ domain });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid domain", details: parsed.error.issues },
      { status: 400 }
    );
  }

  logger.info("[Domains API] Checking domain availability", {
    domain: parsed.data.domain,
  });

  // Check moderation first
  const moderation = await domainModerationService.validateDomainName(
    parsed.data.domain
  );

  if (!moderation.allowed) {
    return NextResponse.json({
      success: true,
      domain: parsed.data.domain,
      available: false,
      reason: "Domain name not allowed",
      moderationFlags: moderation.flags,
    });
  }

  // Check availability and pricing
  const result = await domainManagementService.checkAvailability(
    parsed.data.domain
  );

  return NextResponse.json({
    success: true,
    ...result,
    moderationFlags: moderation.flags,
    requiresReview: moderation.requiresReview,
  });
}

