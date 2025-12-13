/**
 * Domain Verification API
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { domainNotFound, type DomainRouteParams } from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

export async function POST(request: NextRequest, { params }: DomainRouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(id, user.organization_id);
  if (!domain) return domainNotFound();

  if (domain.verified) {
    return NextResponse.json({ success: true, verified: true, message: "Domain is already verified" });
  }

  logger.info("[Domains API] Verifying domain", { domainId: id, domain: domain.domain });

  const result = await domainManagementService.verifyDomain(id);

  if (result.verified) {
    const updatedDomain = await domainManagementService.getDomain(id, user.organization_id);
    return NextResponse.json({ success: true, verified: true, domain: updatedDomain, message: "Domain verified successfully" });
  }

  const dnsInstructions = domainManagementService.generateDnsInstructions(
    domain.domain,
    domain.verificationToken || "",
    domain.nameserverMode
  );

  return NextResponse.json({
    success: true,
    verified: false,
    error: result.error,
    dnsInstructions,
    message: "Verification failed. Please check your DNS configuration.",
  });
}

