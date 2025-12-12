/**
 * Agent Budget Management API
 *
 * GET  - Get agent's budget status
 * POST - Allocate credits to agent budget
 * PATCH - Update budget settings
 *
 * Requires authentication and ownership of the agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { agentBudgetService } from "@/lib/services/agent-budgets";
import { charactersService } from "@/lib/services/characters/characters";
import { organizationsService } from "@/lib/services/organizations";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { logger } from "@/lib/utils/logger";

// ============================================================================
// SCHEMAS
// ============================================================================

const AllocateBudgetSchema = z.object({
  amount: z.number().positive().max(10000), // Max $10k per allocation
  description: z.string().optional(),
});

const UpdateSettingsSchema = z.object({
  dailyLimit: z.number().positive().nullable().optional(),
  autoRefillEnabled: z.boolean().optional(),
  autoRefillAmount: z.number().positive().max(1000).nullable().optional(),
  autoRefillThreshold: z.number().positive().nullable().optional(),
  pauseOnDepleted: z.boolean().optional(),
  lowBudgetThreshold: z.number().positive().nullable().optional(),
});

const ActionSchema = z.object({
  action: z.enum(["pause", "resume", "refill"]),
  amount: z.number().positive().optional(), // For refill action
  reason: z.string().optional(), // For pause action
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * GET /api/v1/agents/:agentId/budget
 * Get agent's budget status
 */
async function getBudgetHandler(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  // Verify agent ownership
  const agent = await charactersService.getById(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Get budget
  const budget = await agentBudgetService.getOrCreateBudget(agentId);
  if (!budget) {
    return NextResponse.json(
      { error: "Failed to get budget" },
      { status: 500 },
    );
  }

  // Calculate derived values
  const allocated = Number(budget.allocated_budget);
  const spent = Number(budget.spent_budget);
  const available = allocated - spent;
  const dailyLimit = budget.daily_limit ? Number(budget.daily_limit) : null;
  const dailySpent = Number(budget.daily_spent);
  const dailyRemaining = dailyLimit ? dailyLimit - dailySpent : null;

  // Get recent transactions
  const transactions = await agentBudgetService.getTransactions(agentId, 20);

  return NextResponse.json({
    success: true,
    budget: {
      agentId,
      agentName: agent.name,

      // Balances
      allocated,
      spent,
      available,

      // Daily limits
      dailyLimit,
      dailySpent,
      dailyRemaining,
      dailyResetAt: budget.daily_reset_at?.toISOString(),

      // Status
      isPaused: budget.is_paused,
      pauseReason: budget.pause_reason,
      pausedAt: budget.paused_at?.toISOString(),

      // Auto-refill settings
      autoRefillEnabled: budget.auto_refill_enabled,
      autoRefillAmount: budget.auto_refill_amount
        ? Number(budget.auto_refill_amount)
        : null,
      autoRefillThreshold: budget.auto_refill_threshold
        ? Number(budget.auto_refill_threshold)
        : null,
      lastRefillAt: budget.last_refill_at?.toISOString(),

      // Alerts
      lowBudgetThreshold: budget.low_budget_threshold
        ? Number(budget.low_budget_threshold)
        : 5,
      lowBudgetAlertSent: budget.low_budget_alert_sent,

      pauseOnDepleted: budget.pause_on_depleted,

      createdAt: budget.created_at.toISOString(),
      updatedAt: budget.updated_at.toISOString(),
    },
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      balanceAfter: Number(t.balance_after),
      description: t.description,
      operationType: t.operation_type,
      model: t.model,
      createdAt: t.created_at.toISOString(),
    })),
  });
}

/**
 * POST /api/v1/agents/:agentId/budget
 * Allocate credits to agent budget OR perform actions (pause/resume/refill)
 */
async function allocateBudgetHandler(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  // Verify agent ownership
  const agent = await charactersService.getById(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();

  // Check if this is an action request
  const actionParse = ActionSchema.safeParse(body);
  if (actionParse.success) {
    const { action, amount, reason } = actionParse.data;

    switch (action) {
      case "pause":
        await agentBudgetService.pauseBudget(
          agentId,
          reason || "Manually paused",
        );
        return NextResponse.json({
          success: true,
          message: "Agent budget paused",
        });

      case "resume":
        await agentBudgetService.resumeBudget(agentId);
        return NextResponse.json({
          success: true,
          message: "Agent budget resumed",
        });

      case "refill":
        if (!amount) {
          return NextResponse.json(
            { error: "Amount required for refill action" },
            { status: 400 },
          );
        }

        // Check org has sufficient credits
        const org = await organizationsService.getById(user.organization_id);
        if (!org || Number(org.credit_balance) < amount) {
          return NextResponse.json(
            {
              error: "Insufficient organization credits",
              required: amount,
              available: org ? Number(org.credit_balance) : 0,
            },
            { status: 402 },
          );
        }

        const refillResult = await agentBudgetService.refillBudget({
          agentId,
          amount,
          description: "Manual refill",
        });

        if (!refillResult.success) {
          return NextResponse.json(
            { error: refillResult.error },
            { status: 400 },
          );
        }

        return NextResponse.json({
          success: true,
          message: `Refilled $${amount.toFixed(2)}`,
          newBalance: refillResult.newBalance,
        });
    }
  }

  // Regular allocation request
  const validation = AllocateBudgetSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request", details: validation.error.errors },
      { status: 400 },
    );
  }

  const { amount, description } = validation.data;

  // Check org has sufficient credits
  const org = await organizationsService.getById(user.organization_id);
  if (!org || Number(org.credit_balance) < amount) {
    return NextResponse.json(
      {
        error: "Insufficient organization credits",
        required: amount,
        available: org ? Number(org.credit_balance) : 0,
      },
      { status: 402 },
    );
  }

  const result = await agentBudgetService.allocateBudget({
    agentId,
    amount,
    fromOrgCredits: true,
    description,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logger.info("[AgentBudget API] Budget allocated", {
    agentId,
    amount,
    userId: user.id,
    newBalance: result.newBalance,
  });

  return NextResponse.json({
    success: true,
    message: `Allocated $${amount.toFixed(2)} to agent budget`,
    newBalance: result.newBalance,
  });
}

/**
 * PATCH /api/v1/agents/:agentId/budget
 * Update budget settings
 */
async function updateSettingsHandler(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  // Verify agent ownership
  const agent = await charactersService.getById(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const validation = UpdateSettingsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request", details: validation.error.errors },
      { status: 400 },
    );
  }

  const result = await agentBudgetService.updateSettings(
    agentId,
    validation.data,
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logger.info("[AgentBudget API] Settings updated", {
    agentId,
    userId: user.id,
    settings: validation.data,
  });

  return NextResponse.json({
    success: true,
    message: "Budget settings updated",
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const GET = withRateLimit(getBudgetHandler, RateLimitPresets.STANDARD);
export const POST = withRateLimit(
  allocateBudgetHandler,
  RateLimitPresets.STRICT,
);
export const PATCH = withRateLimit(
  updateSettingsHandler,
  RateLimitPresets.STRICT,
);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}
