/**
 * Redemption Balance API
 *
 * GET /api/v1/redemptions/balance
 *
 * Returns user's redeemable balance across all apps, broken down by:
 * - Total earned
 * - Pending (still vesting)
 * - Withdrawable (ready to redeem)
 * - Already redeemed
 *
 * Also returns eligibility status for redemption.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { db } from "@/db/client";
import { appCreditBalances } from "@/db/schemas/app-credit-balances";
import { appEarnings } from "@/db/schemas/app-earnings";
import { tokenRedemptions } from "@/db/schemas/token-redemptions";
import { apps } from "@/db/schemas/apps";
import { eq, and, sql, inArray } from "drizzle-orm";
import { SUPPLY_SHOCK_PROTECTION } from "@/lib/config/redemption-security";
import { VESTING_CONFIG } from "@/lib/config/redemption-addresses";

interface AppBalance {
  appId: string;
  appName: string;
  totalEarned: number;
  pendingBalance: number;
  withdrawableBalance: number;
  totalRedeemed: number;
  canRedeem: boolean;
  vestingEndsAt?: string;
}

interface BalanceResponse {
  success: boolean;
  summary: {
    totalEarned: number;
    totalPending: number;
    totalWithdrawable: number;
    totalRedeemed: number;
    totalAvailableToRedeem: number;
  };
  apps: AppBalance[];
  limits: {
    minRedemptionUsd: number;
    maxSingleRedemptionUsd: number;
    userDailyLimitUsd: number;
    userHourlyLimitUsd: number;
    vestingPeriodDays: number;
  };
  eligibility: {
    canRedeem: boolean;
    reason?: string;
    cooldownEndsAt?: string;
    dailyLimitRemaining?: number;
  };
}

/**
 * GET /api/v1/redemptions/balance
 * Get user's redeemable balance across all apps.
 */
async function getBalanceHandler(request: NextRequest): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Get all app credit balances for this user
  const userBalances = await db
    .select({
      app_id: appCreditBalances.app_id,
      credit_balance: appCreditBalances.credit_balance,
      total_purchased: appCreditBalances.total_purchased,
      total_spent: appCreditBalances.total_spent,
    })
    .from(appCreditBalances)
    .where(eq(appCreditBalances.user_id, user.id));

  if (userBalances.length === 0) {
    return NextResponse.json({
      success: true,
      summary: {
        totalEarned: 0,
        totalPending: 0,
        totalWithdrawable: 0,
        totalRedeemed: 0,
        totalAvailableToRedeem: 0,
      },
      apps: [],
      limits: {
        minRedemptionUsd: SUPPLY_SHOCK_PROTECTION.MIN_REDEMPTION_USD,
        maxSingleRedemptionUsd: SUPPLY_SHOCK_PROTECTION.MAX_SINGLE_REDEMPTION_USD,
        userDailyLimitUsd: SUPPLY_SHOCK_PROTECTION.USER_DAILY_LIMIT_USD,
        userHourlyLimitUsd: SUPPLY_SHOCK_PROTECTION.USER_HOURLY_LIMIT_USD,
        vestingPeriodDays: VESTING_CONFIG.APP_EARNINGS_HOLD_PERIOD_MS / (24 * 60 * 60 * 1000),
      },
      eligibility: {
        canRedeem: false,
        reason: "No balance found",
      },
    } satisfies BalanceResponse);
  }

  const appIds = userBalances.map((b) => b.app_id);

  // Get app details
  const appDetails = await db
    .select({
      id: apps.id,
      name: apps.name,
    })
    .from(apps)
    .where(inArray(apps.id, appIds));

  const appNameMap = new Map(appDetails.map((a) => [a.id, a.name]));

  // Get earnings breakdown for each app
  const earningsData = await db
    .select({
      app_id: appEarnings.app_id,
      total_lifetime_earnings: appEarnings.total_lifetime_earnings,
      pending_balance: appEarnings.pending_balance,
      withdrawable_balance: appEarnings.withdrawable_balance,
      total_withdrawn: appEarnings.total_withdrawn,
    })
    .from(appEarnings)
    .where(inArray(appEarnings.app_id, appIds));

  const earningsMap = new Map(earningsData.map((e) => [e.app_id, e]));

  // Get total redeemed per app
  const redeemedData = await db
    .select({
      app_id: tokenRedemptions.app_id,
      total: sql<string>`COALESCE(SUM(CAST(${tokenRedemptions.usd_value} AS DECIMAL)), 0)`,
    })
    .from(tokenRedemptions)
    .where(
      and(
        eq(tokenRedemptions.user_id, user.id),
        inArray(tokenRedemptions.status, ["completed", "approved", "processing"])
      )
    )
    .groupBy(tokenRedemptions.app_id);

  const redeemedMap = new Map(
    redeemedData
      .filter((r) => r.app_id !== null)
      .map((r) => [r.app_id!, Number(r.total)])
  );

  // Check for cooldown (last redemption time)
  const lastRedemption = await db.query.tokenRedemptions.findFirst({
    where: eq(tokenRedemptions.user_id, user.id),
    orderBy: (r, { desc }) => [desc(r.created_at)],
  });

  const cooldownMs = SUPPLY_SHOCK_PROTECTION.USER_COOLDOWN_MS;
  const cooldownEndsAt = lastRedemption
    ? new Date(lastRedemption.created_at.getTime() + cooldownMs)
    : null;
  const isInCooldown = cooldownEndsAt && cooldownEndsAt > new Date();

  // Check daily limit
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const dailyRedeemedResult = await db.execute(sql`
    SELECT COALESCE(SUM(CAST(usd_value AS DECIMAL)), 0) as total
    FROM token_redemptions
    WHERE user_id = ${user.id}
    AND status IN ('completed', 'approved', 'processing')
    AND created_at >= ${todayStart}
  `);

  const dailyRedeemed = Number(
    (dailyRedeemedResult.rows[0] as { total: string })?.total || 0
  );
  const dailyLimitRemaining = Math.max(
    0,
    SUPPLY_SHOCK_PROTECTION.USER_DAILY_LIMIT_USD - dailyRedeemed
  );

  // Build app balances
  const appBalances: AppBalance[] = userBalances.map((balance) => {
    const earnings = earningsMap.get(balance.app_id);
    const redeemed = redeemedMap.get(balance.app_id) || 0;
    const creditBalance = Number(balance.credit_balance);

    // Calculate vesting end time (7 days from last earning)
    const vestingPeriodMs = VESTING_CONFIG.APP_EARNINGS_HOLD_PERIOD_MS;
    const vestingEndsAt = new Date(Date.now() + vestingPeriodMs);

    return {
      appId: balance.app_id,
      appName: appNameMap.get(balance.app_id) || "Unknown App",
      totalEarned: earnings ? Number(earnings.total_lifetime_earnings) : 0,
      pendingBalance: earnings ? Number(earnings.pending_balance) : 0,
      withdrawableBalance: earnings
        ? Number(earnings.withdrawable_balance)
        : creditBalance,
      totalRedeemed: redeemed,
      canRedeem:
        (earnings ? Number(earnings.withdrawable_balance) : creditBalance) >=
        SUPPLY_SHOCK_PROTECTION.MIN_REDEMPTION_USD,
      vestingEndsAt: vestingEndsAt.toISOString(),
    };
  });

  // Calculate summary
  const summary = {
    totalEarned: appBalances.reduce((sum, a) => sum + a.totalEarned, 0),
    totalPending: appBalances.reduce((sum, a) => sum + a.pendingBalance, 0),
    totalWithdrawable: appBalances.reduce(
      (sum, a) => sum + a.withdrawableBalance,
      0
    ),
    totalRedeemed: appBalances.reduce((sum, a) => sum + a.totalRedeemed, 0),
    totalAvailableToRedeem: appBalances.reduce(
      (sum, a) => sum + a.withdrawableBalance,
      0
    ),
  };

  // Determine eligibility
  let canRedeem = true;
  let reason: string | undefined;

  if (summary.totalAvailableToRedeem < SUPPLY_SHOCK_PROTECTION.MIN_REDEMPTION_USD) {
    canRedeem = false;
    reason = `Minimum redemption is $${SUPPLY_SHOCK_PROTECTION.MIN_REDEMPTION_USD.toFixed(2)}. You have $${summary.totalAvailableToRedeem.toFixed(2)} available.`;
  } else if (isInCooldown) {
    canRedeem = false;
    reason = `Cooldown active. You can redeem again after ${cooldownEndsAt!.toISOString()}.`;
  } else if (dailyLimitRemaining <= 0) {
    canRedeem = false;
    reason = `Daily limit reached. Resets at midnight UTC.`;
  }

  return NextResponse.json({
    success: true,
    summary,
    apps: appBalances,
    limits: {
      minRedemptionUsd: SUPPLY_SHOCK_PROTECTION.MIN_REDEMPTION_USD,
      maxSingleRedemptionUsd: SUPPLY_SHOCK_PROTECTION.MAX_SINGLE_REDEMPTION_USD,
      userDailyLimitUsd: SUPPLY_SHOCK_PROTECTION.USER_DAILY_LIMIT_USD,
      userHourlyLimitUsd: SUPPLY_SHOCK_PROTECTION.USER_HOURLY_LIMIT_USD,
      vestingPeriodDays:
        VESTING_CONFIG.APP_EARNINGS_HOLD_PERIOD_MS / (24 * 60 * 60 * 1000),
    },
    eligibility: {
      canRedeem,
      reason,
      cooldownEndsAt: cooldownEndsAt?.toISOString(),
      dailyLimitRemaining,
    },
  } satisfies BalanceResponse);
}

export const GET = withRateLimit(getBalanceHandler, RateLimitPresets.STANDARD);

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

