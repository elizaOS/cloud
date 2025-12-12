import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { domainManagementService } from "@/lib/services/domain-management";
import { domainModerationService } from "@/lib/services/domain-moderation";
import { creditsService } from "@/lib/services/credits";
import { isX402Configured, X402_RECIPIENT_ADDRESS, getDefaultNetwork, USDC_ADDRESSES } from "@/lib/config/x402";
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
  paymentMethod: z.enum(["credits", "x402"]),
  autoRenew: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  // Check for x402 payment header
  const x402PaymentHeader = request.headers.get("X-PAYMENT");
  const hasX402Payment = !!x402PaymentHeader;

  // If x402 payment provided, we can proceed without auth for domain purchase
  // Otherwise require auth
  let organizationId: string;
  let userId: string;

  if (hasX402Payment && isX402Configured()) {
    // TODO: Implement proper x402 payment verification
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;
    userId = user.id;
  } else {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    organizationId = user.organization_id;
    userId = user.id;
  }

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

  // Step 3: Process payment
  if (paymentMethod === "credits") {
    // Deduct credits (price is in dollars, credits are 1:1 with cents)
    const deduction = await creditsService.deduct({
      organizationId,
      amount: priceInCents, // Credits are in cents
      description: `Domain purchase: ${domain}`,
      metadata: { domain, type: "domain_purchase" },
    });

    if (!deduction.success) {
      return NextResponse.json(
        {
          error: "Insufficient credits",
          required: priceInCents,
          price: {
            amount: priceInDollars,
            currency: "USD",
          },
        },
        { status: 402 }
      );
    }
  } else if (paymentMethod === "x402") {
    // x402 payment - verify the payment header
    if (!hasX402Payment) {
      // Return 402 with payment requirements
      const network = getDefaultNetwork();
      return NextResponse.json(
        {
          error: "x402_payment_required",
          message: "x402 payment required for domain purchase",
          x402: {
            version: 1,
            accepts: [
              {
                scheme: "exact",
                network,
                maxAmountRequired: (priceInCents * 10000).toString(), // Convert to USDC base units (6 decimals)
                asset: USDC_ADDRESSES[network],
                payTo: X402_RECIPIENT_ADDRESS,
                resource: `/api/v1/domains/purchase`,
                description: `Purchase domain: ${domain}`,
              },
            ],
          },
          domain,
          price: {
            amount: priceInDollars,
            currency: "USD",
          },
        },
        { status: 402 }
      );
    }

    // TODO: Verify x402 payment cryptographically
    logger.info("[Domain Purchase] x402 payment received", {
      domain,
      amount: priceInDollars,
    });
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
    // Refund credits if purchase failed
    if (paymentMethod === "credits") {
      await creditsService.addCredits({
        organizationId,
        amount: priceInCents,
        description: `Refund: Domain purchase failed for ${domain}`,
        metadata: { domain, type: "domain_purchase_refund" },
      });
    }

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

  // Build x402 payment info if configured
  let x402PaymentInfo = null;
  if (isX402Configured()) {
    const network = getDefaultNetwork();
    x402PaymentInfo = {
      version: 1,
      accepts: [
        {
          scheme: "exact",
          network,
          maxAmountRequired: (priceInCents * 10000).toString(),
          asset: USDC_ADDRESSES[network],
          payTo: X402_RECIPIENT_ADDRESS,
          resource: `/api/v1/domains/purchase`,
          description: `Purchase domain: ${domain}`,
        },
      ],
    };
  }

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
    paymentMethods: ["credits", ...(isX402Configured() ? ["x402"] : [])],
    x402: x402PaymentInfo,
    moderationFlags: moderation.flags,
    requiresReview: moderation.requiresReview,
  });
}

