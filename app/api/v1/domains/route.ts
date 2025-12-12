/**
 * Domains API
 *
 * GET /api/v1/domains - List all domains for organization
 * POST /api/v1/domains - Purchase or register a new domain
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { logger } from "@/lib/utils/logger";

// Schema for registering/purchasing a domain
const RegisterDomainSchema = z.object({
  domain: z.string().min(3).max(253),
  type: z.enum(["purchase", "external"]).default("external"),
  nameserverMode: z.enum(["vercel", "external"]).default("external"),
  registrantInfo: z
    .object({
      fullName: z.string().min(1),
      email: z.string().email(),
      organization: z.string().optional(),
      address: z.object({
        street: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        postalCode: z.string().min(1),
        country: z.string().length(2), // ISO 3166-1 alpha-2
      }),
      phone: z.string().optional(),
      privacyEnabled: z.boolean().optional(),
    })
    .optional(),
  paymentMethod: z.enum(["stripe", "x402", "credits"]).optional(),
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
      user.organization_id
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

/**
 * POST /api/v1/domains
 * Purchase or register a new domain
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegisterDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { domain, type, nameserverMode, registrantInfo, paymentMethod, stripePaymentIntentId, autoRenew } =
    parsed.data;

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
        { status: 400 }
      );
    }

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method is required for domain purchase" },
        { status: 400 }
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
        { status: 400 }
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
      nameserverMode
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to register domain" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      domain: result.domain,
      dnsInstructions: result.dnsInstructions,
      message: "Domain registered. Follow DNS instructions to verify ownership.",
    });
  }
}

