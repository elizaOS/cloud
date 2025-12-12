import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { domainModerationService } from "@/lib/services/domain-moderation";
import { creditsService } from "@/lib/services/credits";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";

const PurchaseDomainSchema = z.object({
  domain: z.string().min(3).max(253),
  registrantInfo: z.object({
    fullName: z.string().min(1),
    email: z.string().email(),
    organization: z.string().optional(),
    address: z.object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      postalCode: z.string().min(1),
      country: z.string().length(2),
    }),
    phone: z.string().optional(),
    privacyEnabled: z.boolean().optional(),
  }),
  paymentMethod: z.literal("credits"), // x402 not yet supported
  autoRenew: z.boolean().default(true),
});

async function handlePurchase(request: NextRequest): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const organizationId = user.organization_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PurchaseDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { domain, registrantInfo, paymentMethod, autoRenew } = parsed.data;

  logger.info("[Domain Purchase] Attempting purchase", {
    domain,
    organizationId,
    paymentMethod,
  });

  // Step 1: Validate domain name (moderation)
  const moderation = await domainModerationService.validateDomainName(domain);
  if (!moderation.allowed) {
    return NextResponse.json(
      {
        error: "Domain name not allowed",
        flags: moderation.flags,
        message: moderation.flags.map((f) => f.reason).join("; "),
      },
      { status: 400 }
    );
  }

  // Step 2: Check availability and get pricing
  const availability = await domainManagementService.checkAvailability(domain);
  if (!availability.available) {
    return NextResponse.json(
      { error: "Domain is not available for purchase" },
      { status: 400 }
    );
  }

  if (!availability.price) {
    return NextResponse.json(
      { error: "Unable to determine domain price" },
      { status: 500 }
    );
  }

  const priceInCents = availability.price.price;
  const priceInDollars = priceInCents / 100;

  // Step 3: Process payment (credits only)
  const deduction = await creditsService.deductCredits({
    organizationId,
    amount: priceInCents,
    description: `Domain purchase: ${domain}`,
    metadata: { domain, type: "domain_purchase" },
  });

  if (!deduction.success) {
    return NextResponse.json(
      {
        error: "Insufficient credits",
        required: priceInCents,
        price: { amount: priceInDollars, currency: "USD" },
      },
      { status: 402 }
    );
  }

  // Step 4: Purchase domain through Vercel
  const result = await domainManagementService.purchaseDomain({
    domain,
    organizationId,
    registrantInfo,
    paymentMethod,
    autoRenew,
  });

  if (!result.success) {
    // Refund credits
    await creditsService.refundCredits({
      organizationId,
      amount: priceInCents,
      description: `Refund: Domain purchase failed for ${domain}`,
      metadata: { domain, type: "domain_purchase_refund" },
    });

    return NextResponse.json(
      { error: result.error || "Failed to purchase domain" },
      { status: 500 }
    );
  }

  logger.info("[Domain Purchase] Success", {
    domain,
    domainId: result.domain?.id,
    paymentMethod,
    price: priceInDollars,
  });

  return NextResponse.json({
    success: true,
    domain: result.domain,
    purchase: {
      amount: priceInDollars,
      currency: "USD",
      paymentMethod,
    },
    message: "Domain purchased successfully",
  });
}

// Rate limit: 5 purchases per 5 minutes per user (uses CRITICAL preset)
export const POST = withRateLimit(handlePurchase, RateLimitPresets.CRITICAL);

export async function GET(request: NextRequest) {
  await requireAuthOrApiKeyWithOrg(request);

  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json(
      { error: "domain query parameter required" },
      { status: 400 }
    );
  }

  // Validate domain name
  const moderation = await domainModerationService.validateDomainName(domain);
  if (!moderation.allowed) {
    return NextResponse.json({
      success: true,
      domain,
      available: false,
      reason: "Domain name not allowed by moderation policy",
      flags: moderation.flags,
    });
  }

  // Check availability and get pricing
  const availability = await domainManagementService.checkAvailability(domain);

  if (!availability.available) {
    return NextResponse.json({
      success: true,
      domain,
      available: false,
      reason: "Domain is not available",
    });
  }

  const priceInCents = availability.price?.price || 0;
  const priceInDollars = priceInCents / 100;

  return NextResponse.json({
    success: true,
    domain,
    available: true,
    price: {
      amount: priceInDollars,
      currency: "USD",
      period: availability.price?.period || 1,
      renewalAmount: (availability.price?.renewalPrice || 0) / 100,
    },
    paymentMethods: ["credits"],
    moderationFlags: moderation.flags,
    requiresReview: moderation.requiresReview,
  });
}

