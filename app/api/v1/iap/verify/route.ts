/**
 * IAP Receipt Verification Endpoint
 *
 * POST /api/v1/iap/verify
 *
 * Verifies in-app purchase receipts from iOS (App Store) and Android (Play Store),
 * then credits the user's account with the purchased credits.
 *
 * Security:
 * - Requires authentication
 * - Validates receipt with Apple/Google servers
 * - Deduplicates purchases to prevent double-crediting
 * - Records transaction for audit trail
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { getProductById, getNetRevenue } from "@/lib/config/iap-products";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

/**
 * Platform types for IAP
 */
type IAPPlatform = "ios" | "android";

/**
 * Request body for IAP verification
 */
interface IAPVerifyRequest {
  platform: IAPPlatform;
  productId: string;
  transactionId: string;
  receipt: string;
  purchaseToken?: string; // Android specific
}

/**
 * Response from receipt verification
 */
interface VerificationResponse {
  valid: boolean;
  productId?: string;
  transactionId?: string;
  purchaseDate?: Date;
  error?: string;
}

/**
 * Verify an iOS App Store receipt with Apple's server
 */
async function verifyAppleReceipt(
  receipt: string,
): Promise<VerificationResponse> {
  const appStoreSecret = process.env.APP_STORE_SHARED_SECRET;

  if (!appStoreSecret) {
    logger.error("[IAP] APP_STORE_SHARED_SECRET not configured");
    return { valid: false, error: "Server configuration error" };
  }

  // First try production, then sandbox
  const endpoints = [
    "https://buy.itunes.apple.com/verifyReceipt",
    "https://sandbox.itunes.apple.com/verifyReceipt",
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receipt,
        password: appStoreSecret,
        "exclude-old-transactions": true,
      }),
    });

    const data = await response.json();

    // Status 21007 means it's a sandbox receipt, try sandbox endpoint
    if (data.status === 21007) {
      continue;
    }

    if (data.status === 0) {
      const latestReceipt =
        data.latest_receipt_info?.[0] || data.receipt?.in_app?.[0];

      if (latestReceipt) {
        return {
          valid: true,
          productId: latestReceipt.product_id,
          transactionId: latestReceipt.transaction_id,
          purchaseDate: new Date(parseInt(latestReceipt.purchase_date_ms)),
        };
      }
    }

    logger.warn("[IAP] Apple verification failed", { status: data.status });
    return {
      valid: false,
      error: `Apple verification failed: status ${data.status}`,
    };
  }

  return {
    valid: false,
    error: "Receipt verification failed on all endpoints",
  };
}

/**
 * Verify an Android Play Store purchase with Google's API
 */
async function verifyGooglePurchase(
  productId: string,
  purchaseToken: string,
): Promise<VerificationResponse> {
  const packageName = process.env.ANDROID_PACKAGE_NAME || "ai.elizacloud.app";
  const serviceAccountKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    logger.error("[IAP] GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not configured");
    return { valid: false, error: "Server configuration error" };
  }

  // Get access token using service account
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountKey, // This should be a JWT signed with the service account
    }),
  });

  if (!tokenResponse.ok) {
    logger.error("[IAP] Failed to get Google access token");
    return { valid: false, error: "Failed to authenticate with Google" };
  }

  const { access_token } = await tokenResponse.json();

  // Verify the purchase
  const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

  const verifyResponse = await fetch(verifyUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!verifyResponse.ok) {
    const error = await verifyResponse.text();
    logger.warn("[IAP] Google verification failed", { error });
    return { valid: false, error: "Google verification failed" };
  }

  const purchase = await verifyResponse.json();

  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
  if (purchase.purchaseState === 0) {
    return {
      valid: true,
      productId,
      transactionId: purchase.orderId,
      purchaseDate: new Date(parseInt(purchase.purchaseTimeMillis)),
    };
  }

  return {
    valid: false,
    error: `Invalid purchase state: ${purchase.purchaseState}`,
  };
}

/**
 * POST /api/v1/iap/verify
 *
 * Verify an in-app purchase and credit the user's account
 */
export async function POST(req: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(req);

  const body: IAPVerifyRequest = await req.json();
  const { platform, productId, transactionId, receipt, purchaseToken } = body;

  // Validate request
  if (!platform || !productId || !transactionId || !receipt) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: platform, productId, transactionId, receipt",
      },
      { status: 400 },
    );
  }

  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json(
      { error: "Invalid platform. Must be 'ios' or 'android'" },
      { status: 400 },
    );
  }

  // Find the product
  const product = getProductById(productId);
  if (!product) {
    return NextResponse.json(
      { error: `Unknown product: ${productId}` },
      { status: 400 },
    );
  }

  logger.info("[IAP] Verifying purchase", {
    platform,
    productId,
    transactionId,
    userId: user.id,
    organizationId: user.organization_id,
  });

  // Check for duplicate transaction
  const existingTransaction =
    await creditsService.getTransactionByStripePaymentIntent(
      `iap_${platform}_${transactionId}`,
    );

  if (existingTransaction) {
    logger.info("[IAP] Duplicate transaction detected", { transactionId });
    return NextResponse.json({
      success: true,
      duplicate: true,
      credits: product.credits,
      message: "Purchase already processed",
    });
  }

  // Verify with platform
  let verification: VerificationResponse;

  if (platform === "ios") {
    verification = await verifyAppleReceipt(receipt);
  } else {
    if (!purchaseToken) {
      return NextResponse.json(
        { error: "Android purchases require purchaseToken" },
        { status: 400 },
      );
    }
    verification = await verifyGooglePurchase(productId, purchaseToken);
  }

  if (!verification.valid) {
    logger.warn("[IAP] Verification failed", {
      platform,
      productId,
      transactionId,
      error: verification.error,
    });

    return NextResponse.json(
      { error: verification.error || "Receipt verification failed" },
      { status: 400 },
    );
  }

  // Add credits to user's account
  const creditsToAdd = product.credits / 100; // Credits are in cents, balance is in dollars

  await creditsService.addCredits({
    organizationId: user.organization_id,
    amount: creditsToAdd,
    description: `In-App Purchase: ${product.displayName}`,
    metadata: {
      platform,
      product_id: productId,
      transaction_id: transactionId,
      store_price: product.storePrice,
      net_revenue: getNetRevenue(product.storePrice),
      credits_added: product.credits,
      user_id: user.id,
      verified_at: new Date().toISOString(),
    },
    stripePaymentIntentId: `iap_${platform}_${transactionId}`,
  });

  logger.info("[IAP] Credits added successfully", {
    platform,
    productId,
    transactionId,
    credits: product.credits,
    userId: user.id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({
    success: true,
    credits: product.credits,
    newCreditsAdded: creditsToAdd,
    message: `Successfully added ${product.credits} credits`,
  });
}
