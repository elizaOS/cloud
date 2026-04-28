/**
 * GET /api/cron/cleanup-expired-crypto-payments
 * Marks expired pending crypto payments as expired.
 */

import { Hono } from "hono";

import { cryptoPaymentsRepository } from "@/db/repositories/crypto-payments";
import { cryptoPaymentsService } from "@/lib/services/crypto-payments";
import { logger } from "@/lib/utils/logger";
import { requireCronSecret } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";

const app = new Hono<AppEnv>();

app.get("/", async (c) => {
  try {
    requireCronSecret(c);

    const expiredPayments = await cryptoPaymentsService.listExpiredPendingPayments();
    if (expiredPayments.length === 0) {
      return c.json({ success: true, processed: 0, message: "No expired payments to process" });
    }

    let markedExpired = 0;
    let errors = 0;
    for (const payment of expiredPayments) {
      try {
        await cryptoPaymentsRepository.markAsExpired(payment.id);
        markedExpired++;
      } catch (error) {
        errors++;
        logger.error("[Crypto Payments Cleanup] Failed to mark payment as expired", {
          paymentId: payment.id,
          error,
        });
      }
    }

    return c.json({
      success: true,
      processed: expiredPayments.length,
      markedExpired,
      errors,
    });
  } catch (error) {
    logger.error("[Crypto Payments Cleanup] Cleanup job failed", { error });
    return failureResponse(c, error);
  }
});

export default app;
