/**
 * Domain Verification API
 *
 * POST /api/v1/domains/:id/verify - Verify domain ownership
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/domains/:id/verify
 * Verify domain ownership via DNS
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await params;

  const domain = await domainManagementService.getDomain(
    id,
    user.organization_id
  );

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  if (domain.verified) {
    return NextResponse.json({
      success: true,
      verified: true,
      message: "Domain is already verified",
    });
  }

  logger.info("[Domains API] Verifying domain", {
    domainId: id,
    domain: domain.domain,
  });

  const result = await domainManagementService.verifyDomain(id);

  if (result.verified) {
    // Refresh domain data
    const updatedDomain = await domainManagementService.getDomain(
      id,
      user.organization_id
    );

    return NextResponse.json({
      success: true,
      verified: true,
      domain: updatedDomain,
      message: "Domain verified successfully",
    });
  }

  // Generate fresh DNS instructions if verification failed
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

