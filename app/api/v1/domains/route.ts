/**
 * Domains API
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { RegistrantInfoSchema, parseJsonBody } from "@/lib/types/domains";
import { logger } from "@/lib/utils/logger";

const RegisterDomainSchema = z.object({
  domain: z.string().min(3).max(253),
  type: z.enum(["purchase", "external"]).default("external"),
  nameserverMode: z.enum(["vercel", "external"]).default("external"),
  registrantInfo: RegistrantInfoSchema.optional(),
  paymentMethod: z.literal("credits").optional(),
  stripePaymentIntentId: z.string().optional(),
  autoRenew: z.boolean().default(true),
});

/**
 * GET /api/v1/domains
 * List all domains for the authenticated organization
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter"); // 'unassigned', 'assigned', 'all'

  let domains;
  if (filter === "unassigned") {
    domains = await domainManagementService.listUnassignedDomains(
      user.organization_id,
    );
  } else {
    domains = await domainManagementService.listDomains(user.organization_id);
  }

  const stats = await domainManagementService.getStats(user.organization_id);

  return NextResponse.json({
    success: true,
    domains,
    stats,
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const result = await parseJsonBody(request, RegisterDomainSchema);
  if (!result.success) return result.response;

  const {
    domain,
    type,
    nameserverMode,
    registrantInfo,
    paymentMethod,
    stripePaymentIntentId,
    autoRenew,
  } = result.data;

  logger.info("[Domains API] Registering domain", {
    domain,
    type,
    organizationId: user.organization_id,
  });

  if (type === "purchase") {
    // Domain purchase requires registrant info and payment
    if (!registrantInfo) {
      return NextResponse.json(
        { error: "Registrant information is required for domain purchase" },
        { status: 400 },
      );
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method is required for domain purchase" },
        { status: 400 },
      );
    }

    const result = await domainManagementService.purchaseDomain({
      domain,
      organizationId: user.organization_id,
      registrantInfo,
      paymentMethod,
      stripePaymentIntentId,
      autoRenew,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to purchase domain" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      domain: result.domain,
      message: "Domain purchased successfully",
    });
  } else {
    // External domain registration
    const result = await domainManagementService.registerExternalDomain(
      domain,
      user.organization_id,
      nameserverMode,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to register domain" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      domain: result.domain,
      dnsInstructions: result.dnsInstructions,
      message:
        "Domain registered. Follow DNS instructions to verify ownership.",
    });
  }
}
