/**
 * GET /api/v1/redemptions/[id] - Get redemption details
 */

import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { secureTokenRedemptionService } from "@/lib/services/token-redemption-secure";

const app = new Hono<AppEnv>();

app.options(
  "/",
  (c) =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-App-Id",
      },
    }),
);

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const id = c.req.param("id");
    if (!id) {
      return c.json({ success: false, error: "Missing route params" }, 400);
    }

    const redemption = await secureTokenRedemptionService.getRedemption(id, user.id);

    if (!redemption) {
      return c.json({ success: false, error: "Redemption not found" }, 404);
    }

    return c.json({
      success: true,
      redemption: {
        id: redemption.id,
        pointsAmount: Number(redemption.points_amount),
        usdValue: Number(redemption.usd_value),
        elizaAmount: Number(redemption.eliza_amount),
        elizaPriceUsd: Number(redemption.eliza_price_usd),
        network: redemption.network,
        payoutAddress: redemption.payout_address,
        status: redemption.status,
        txHash: redemption.tx_hash,
        requiresReview: redemption.requires_review,
        createdAt: redemption.created_at.toISOString(),
        priceQuoteExpiresAt: redemption.price_quote_expires_at.toISOString(),
        processingStartedAt: redemption.processing_started_at?.toISOString(),
        completedAt: redemption.completed_at?.toISOString(),
        failureReason: redemption.failure_reason,
        retryCount: Number(redemption.retry_count),
        reviewedAt: redemption.reviewed_at?.toISOString(),
        reviewNotes: redemption.review_notes,
      },
    });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
