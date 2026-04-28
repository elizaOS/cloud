/**
 * GET /api/v1/credits/summary
 * Single source of truth for credit status (org credits, agent budgets,
 * app balances, redeemable earnings).
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireUserOrApiKeyWithOrg } from "@/api-lib/auth";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse, NotFoundError } from "@/api-lib/errors";
import { RateLimitPresets, rateLimit } from "@/api-lib/rate-limit";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas/apps";
import { userCharacters } from "@/db/schemas/user-characters";
import { agentBudgetService } from "@/lib/services/agent-budgets";
import { creditsService } from "@/lib/services/credits";
import { organizationsService } from "@/lib/services/organizations";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { logger } from "@/lib/utils/logger";

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const user = await requireUserOrApiKeyWithOrg(c);
    const org = await organizationsService.getById(user.organization_id);
    if (!org) throw NotFoundError("Organization not found");

    const agents = await dbRead.query.userCharacters.findMany({
      where: eq(userCharacters.organization_id, user.organization_id),
    });

    const agentBudgets = await agentBudgetService.getOrgBudgets(user.organization_id);
    const budgetMap = new Map(agentBudgets.map((b) => [b.agent_id, b]));

    const orgApps = await dbRead.query.apps.findMany({
      where: eq(apps.organization_id, user.organization_id),
    });

    const earnings = await redeemableEarningsService.getBalance(user.id);
    const recentTransactions = await creditsService.listTransactionsByOrganization(
      user.organization_id,
      10,
    );

    const response = {
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        creditBalance: Number(org.credit_balance),
        autoTopUpEnabled: org.auto_top_up_enabled,
        autoTopUpThreshold: org.auto_top_up_threshold ? Number(org.auto_top_up_threshold) : null,
        autoTopUpAmount: org.auto_top_up_amount ? Number(org.auto_top_up_amount) : null,
        hasPaymentMethod: !!org.stripe_default_payment_method,
      },
      agents: agents.map((agent) => {
        const budget = budgetMap.get(agent.id);
        const allocated = budget ? Number(budget.allocated_budget) : 0;
        const spent = budget ? Number(budget.spent_budget) : 0;
        const available = allocated - spent;
        const dailyLimit = budget?.daily_limit ? Number(budget.daily_limit) : null;
        const dailySpent = budget ? Number(budget.daily_spent) : 0;
        return {
          id: agent.id,
          name: agent.name,
          isPublic: agent.is_public,
          monetizationEnabled: agent.monetization_enabled,
          hasBudget: !!budget,
          allocated,
          spent,
          available,
          dailyLimit,
          dailySpent,
          dailyRemaining: dailyLimit ? dailyLimit - dailySpent : null,
          isPaused: budget?.is_paused ?? false,
          pauseReason: budget?.pause_reason ?? null,
          totalEarnings: Number(agent.total_creator_earnings),
          totalRequests: agent.total_inference_requests,
        };
      }),
      agentsSummary: {
        total: agents.length,
        withBudget: agentBudgets.length,
        paused: agentBudgets.filter((b) => b.is_paused).length,
        totalAllocated: agentBudgets.reduce((sum, b) => sum + Number(b.allocated_budget), 0),
        totalSpent: agentBudgets.reduce((sum, b) => sum + Number(b.spent_budget), 0),
        totalAvailable: agentBudgets.reduce(
          (sum, b) => sum + (Number(b.allocated_budget) - Number(b.spent_budget)),
          0,
        ),
      },
      apps: orgApps.map((appRow) => ({
        id: appRow.id,
        name: appRow.name,
        slug: appRow.slug,
        monetizationEnabled: appRow.monetization_enabled,
        inferenceMarkupPercentage: Number(appRow.inference_markup_percentage),
        totalCreatorEarnings: Number(appRow.total_creator_earnings),
        totalPlatformRevenue: Number(appRow.total_platform_revenue),
      })),
      earnings: earnings
        ? {
            availableBalance: earnings.availableBalance,
            totalEarned: earnings.totalEarned,
            totalRedeemed: earnings.totalRedeemed,
            totalPending: earnings.totalPending,
            breakdown: earnings.breakdown,
          }
        : {
            availableBalance: 0,
            totalEarned: 0,
            totalRedeemed: 0,
            totalPending: 0,
            breakdown: { miniapps: 0, agents: 0, mcps: 0 },
          },
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        description: t.description,
        createdAt: t.created_at.toISOString(),
      })),
      pricing: {
        creditsPerDollar: 100,
        minimumTopUp: 5.0,
        x402Enabled: c.env.ENABLE_X402_PAYMENTS === "true",
      },
    };

    logger.debug("[CreditsSummary] Fetched summary", {
      userId: user.id,
      orgId: user.organization_id,
      balance: response.organization.creditBalance,
      agentCount: response.agents.length,
    });

    return c.json(response);
  } catch (error) {
    logger.error("[CreditsSummary] Error", { error });
    return failureResponse(c, error);
  }
});

export default app;
