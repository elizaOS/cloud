/**
 * Domain Availability Check API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { domainModerationService } from "@/lib/services/domain-moderation";
import { DomainCheckSchema, validationError } from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const domain = new URL(request.url).searchParams.get("domain");
  const parsed = DomainCheckSchema.safeParse({ domain });
  if (!parsed.success) return validationError(parsed.error.issues);

  logger.info("[Domains API] Checking domain availability", { domain: parsed.data.domain });

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

