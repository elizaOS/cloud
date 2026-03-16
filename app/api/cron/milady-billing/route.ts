/**
 * Milady Agent Billing Cron Job
 *
 * Hourly billing processor for Milady cloud agents (Docker-hosted).
 * - Charges organizations hourly for running agents ($0.02/hour)
 * - Charges for idle/stopped agents with snapshots ($0.0025/hour)
 * - Sends 48-hour shutdown warnings when credits are insufficient
 * - Shuts down agents that have been in warning state for 48+ hours
 *
 * Schedule: Runs every hour at minute 0 (0 * * * *)
 * Protected by CRON_SECRET.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { dbRead, dbWrite } from "@/db/client";
import { usersRepository } from "@/db/repositories";
import { creditTransactions } from "@/db/schemas/credit-transactions";
import { type MiladyBillingStatus, miladySandboxes } from "@/db/schemas/milady-sandboxes";
import { organizationBilling } from "@/db/schemas/organization-billing";
import { organizations } from "@/db/schemas/organizations";
import { trackServerEvent } from "@/lib/analytics/posthog-server";
import { MILADY_PRICING } from "@/lib/constants/milady-pricing";
import { emailService } from "@/lib/services/email";
import { logger } from "@/lib/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes timeout

// ── Types ─────────────────────────────────────────────────────────────

interface BillingResult {
  sandboxId: string;
  agentName: string;
  organizationId: string;
  action: "billed" | "warning_sent" | "shutdown" | "skipped" | "error";
  amount?: number;
  newBalance?: number;
  error?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("[Milady Billing] CRON_SECRET not configured");
    return false;
  }

  const providedSecret = authHeader?.replace("Bearer ", "") || "";
  // Use HMAC comparison to avoid leaking secret length via timing side-channel
  const hmacKey = Buffer.from("milady-billing-cron");
  const a = createHmac("sha256", hmacKey).update(providedSecret).digest();
  const b = createHmac("sha256", hmacKey).update(cronSecret).digest();
  return timingSafeEqual(a, b);
}

// ── Helpers ───────────────────────────────────────────────────────────

async function getOrgUserEmail(organizationId: string): Promise<string | null> {
  try {
    const users = await usersRepository.listByOrganization(organizationId);
    return users.length > 0 && users[0].email ? users[0].email : null;
  } catch (error) {
    logger.error("[Milady Billing] Failed to get org user email", {
      organizationId,
      error,
    });
    return null;
  }
}

/**
 * Determine hourly rate for a sandbox based on its status.
 * Running → RUNNING_HOURLY_RATE, Stopped with backups → IDLE_HOURLY_RATE.
 */
function getHourlyRate(status: string): number {
  if (status === "running") return MILADY_PRICING.RUNNING_HOURLY_RATE;
  // Stopped agents are only billed if they have snapshots (checked in query).
  return MILADY_PRICING.IDLE_HOURLY_RATE;
}

// ── Per-Agent Billing ─────────────────────────────────────────────────

async function processSandboxBilling(
  sandbox: {
    id: string;
    agent_name: string | null;
    organization_id: string;
    user_id: string;
    status: string;
    billing_status: string;
    total_billed: string;
    shutdown_warning_sent_at: Date | null;
    scheduled_shutdown_at: Date | null;
  },
  org: {
    id: string;
    name: string;
    credit_balance: string;
    billing_email: string | null;
  },
): Promise<BillingResult> {
  const sandboxId = sandbox.id;
  const agentName = sandbox.agent_name ?? sandboxId.slice(0, 8);
  const organizationId = sandbox.organization_id;
  const hourlyCost = getHourlyRate(sandbox.status);
  const currentBalance = Number(org.credit_balance);
  const now = new Date();

  logger.info(`[Milady Billing] Processing ${agentName}`, {
    sandboxId,
    hourlyCost,
    currentBalance,
    status: sandbox.status,
    billingStatus: sandbox.billing_status,
  });

  // ── Scheduled shutdown check ────────────────────────────────────
  if (
    sandbox.billing_status === "shutdown_pending" &&
    sandbox.scheduled_shutdown_at &&
    new Date(sandbox.scheduled_shutdown_at) <= now
  ) {
    logger.info(`[Milady Billing] Shutting down agent ${agentName} due to insufficient credits`);

    await dbWrite
      .update(miladySandboxes)
      .set({
        status: "stopped",
        billing_status: "suspended" as MiladyBillingStatus,
        sandbox_id: null,
        bridge_url: null,
        health_url: null,
        updated_at: now,
      })
      .where(eq(miladySandboxes.id, sandboxId));

    trackServerEvent(sandbox.user_id, "milady_agent_shutdown_insufficient_credits", {
      sandbox_id: sandboxId,
      agent_name: agentName,
      organization_id: organizationId,
      balance_at_shutdown: currentBalance,
    });

    return { sandboxId, agentName, organizationId, action: "shutdown" };
  }

  // ── Insufficient credits ────────────────────────────────────────
  if (currentBalance < hourlyCost) {
    if (sandbox.billing_status === "active" || !sandbox.shutdown_warning_sent_at) {
      const shutdownTime = new Date(
        now.getTime() + MILADY_PRICING.GRACE_PERIOD_HOURS * 60 * 60 * 1000,
      );

      await dbWrite
        .update(miladySandboxes)
        .set({
          billing_status: "shutdown_pending" as MiladyBillingStatus,
          shutdown_warning_sent_at: now,
          scheduled_shutdown_at: shutdownTime,
          updated_at: now,
        })
        .where(eq(miladySandboxes.id, sandboxId));

      // Send warning email
      const recipientEmail = org.billing_email || (await getOrgUserEmail(organizationId));
      if (recipientEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
        // Reuse the container shutdown warning email template — content is generic enough
        await emailService.sendContainerShutdownWarningEmail({
          email: recipientEmail,
          organizationName: org.name,
          containerName: `Milady Agent: ${agentName}`,
          projectName: "Milady Cloud",
          dailyCost: hourlyCost * 24,
          monthlyCost: hourlyCost * 24 * 30,
          currentBalance,
          requiredCredits: hourlyCost,
          minimumRecommended: hourlyCost * 24 * 7, // 1 week
          shutdownTime: shutdownTime.toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          }),
          billingUrl: `${appUrl}/dashboard/billing`,
          dashboardUrl: `${appUrl}/dashboard/milady`,
        });

        logger.info(`[Milady Billing] Sent shutdown warning for ${agentName} to ${recipientEmail}`);
      }

      trackServerEvent(sandbox.user_id, "milady_agent_shutdown_warning_sent", {
        sandbox_id: sandboxId,
        agent_name: agentName,
        organization_id: organizationId,
        hourly_cost: hourlyCost,
        current_balance: currentBalance,
        scheduled_shutdown: shutdownTime.toISOString(),
      });

      return {
        sandboxId,
        agentName,
        organizationId,
        action: "warning_sent",
        amount: hourlyCost,
      };
    }

    // Warning already sent, waiting for shutdown
    return {
      sandboxId,
      agentName,
      organizationId,
      action: "skipped",
      error: "Waiting for scheduled shutdown",
    };
  }

  // ── Sufficient credits — bill the hour ──────────────────────────
  const billingDescription =
    sandbox.status === "running"
      ? `Milady agent hosting (running): ${agentName}`
      : `Milady agent storage (idle): ${agentName}`;

  const billingResult = await dbWrite.transaction(async (tx) => {
    // Atomic credit deduction — avoids TOCTOU race with concurrent credit additions
    const [updatedOrg] = await tx
      .update(organizations)
      .set({
        credit_balance: sql`${organizations.credit_balance} - ${String(hourlyCost)}`,
        updated_at: now,
      })
      .where(eq(organizations.id, organizationId))
      .returning({ credit_balance: organizations.credit_balance });

    const newBalance = updatedOrg ? Number(updatedOrg.credit_balance) : currentBalance - hourlyCost;

    // Create credit transaction
    const [creditTx] = await tx
      .insert(creditTransactions)
      .values({
        organization_id: organizationId,
        user_id: sandbox.user_id,
        amount: String(-hourlyCost),
        type: "debit",
        description: billingDescription,
        metadata: {
          sandbox_id: sandboxId,
          agent_name: agentName,
          billing_type: sandbox.status === "running" ? "milady_running" : "milady_idle",
          hourly_rate: hourlyCost,
          billing_hour: now.toISOString(),
        },
        created_at: now,
      })
      .returning();

    // Update sandbox billing fields — use SQL increment for total_billed to avoid races
    await tx
      .update(miladySandboxes)
      .set({
        last_billed_at: now,
        billing_status: "active" as MiladyBillingStatus,
        shutdown_warning_sent_at: null,
        scheduled_shutdown_at: null,
        total_billed: sql`${miladySandboxes.total_billed} + ${String(hourlyCost)}`,
        updated_at: now,
      })
      .where(eq(miladySandboxes.id, sandboxId));

    return { newBalance, transactionId: creditTx.id };
  });

  logger.info(`[Milady Billing] Billed ${agentName}: $${hourlyCost.toFixed(4)}`, {
    sandboxId,
    newBalance: billingResult.newBalance,
    transactionId: billingResult.transactionId,
  });

  trackServerEvent(sandbox.user_id, "milady_agent_hourly_billed", {
    sandbox_id: sandboxId,
    agent_name: agentName,
    organization_id: organizationId,
    amount: hourlyCost,
    new_balance: billingResult.newBalance,
  });

  return {
    sandboxId,
    agentName,
    organizationId,
    action: "billed",
    amount: hourlyCost,
    newBalance: billingResult.newBalance,
  };
}

// ── Main Handler ──────────────────────────────────────────────────────

async function handleMiladyBilling(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("[Milady Billing] Starting hourly billing run");

  try {
    // ── 1. Running agents (always billed) ───────────────────────────
    const runningSandboxes = await dbRead
      .select({
        id: miladySandboxes.id,
        agent_name: miladySandboxes.agent_name,
        organization_id: miladySandboxes.organization_id,
        user_id: miladySandboxes.user_id,
        status: miladySandboxes.status,
        billing_status: miladySandboxes.billing_status,
        total_billed: miladySandboxes.total_billed,
        shutdown_warning_sent_at: miladySandboxes.shutdown_warning_sent_at,
        scheduled_shutdown_at: miladySandboxes.scheduled_shutdown_at,
      })
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.status, "running"),
          inArray(miladySandboxes.billing_status, [
            "active",
            "warning",
            "shutdown_pending",
          ] satisfies MiladyBillingStatus[]),
        ),
      );

    // ── 2. Stopped agents with at least one backup (idle storage) ───
    // Sub-select sandbox IDs that have backups
    const stoppedWithBackups = await dbRead
      .select({
        id: miladySandboxes.id,
        agent_name: miladySandboxes.agent_name,
        organization_id: miladySandboxes.organization_id,
        user_id: miladySandboxes.user_id,
        status: miladySandboxes.status,
        billing_status: miladySandboxes.billing_status,
        total_billed: miladySandboxes.total_billed,
        shutdown_warning_sent_at: miladySandboxes.shutdown_warning_sent_at,
        scheduled_shutdown_at: miladySandboxes.scheduled_shutdown_at,
      })
      .from(miladySandboxes)
      .where(
        and(
          eq(miladySandboxes.status, "stopped"),
          inArray(miladySandboxes.billing_status, [
            "active",
            "warning",
            "shutdown_pending",
          ] satisfies MiladyBillingStatus[]),
          // Only bill stopped agents that have snapshot data
          isNotNull(miladySandboxes.last_backup_at),
        ),
      );

    const allBillable = [...runningSandboxes, ...stoppedWithBackups];

    if (allBillable.length === 0) {
      logger.info("[Milady Billing] No billable sandboxes");
      return NextResponse.json({
        success: true,
        data: {
          sandboxesProcessed: 0,
          sandboxesBilled: 0,
          warningsSent: 0,
          sandboxesShutdown: 0,
          totalRevenue: 0,
          errors: 0,
          duration: Date.now() - startTime,
        },
      });
    }

    logger.info(
      `[Milady Billing] Processing ${allBillable.length} sandboxes (${runningSandboxes.length} running, ${stoppedWithBackups.length} idle)`,
    );

    // ── Fetch organizations ─────────────────────────────────────────
    const orgIds = [...new Set(allBillable.map((s) => s.organization_id))];

    const orgs = await dbRead
      .select({
        id: organizations.id,
        name: organizations.name,
        credit_balance: organizations.credit_balance,
      })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));

    const billingData = await dbRead
      .select({
        organization_id: organizationBilling.organization_id,
        billing_email: organizationBilling.billing_email,
      })
      .from(organizationBilling)
      .where(inArray(organizationBilling.organization_id, orgIds));

    const billingEmailMap = new Map(billingData.map((b) => [b.organization_id, b.billing_email]));
    const orgMap = new Map(
      orgs.map((o) => [o.id, { ...o, billing_email: billingEmailMap.get(o.id) ?? null }]),
    );

    // ── Process each sandbox ────────────────────────────────────────
    const results: BillingResult[] = [];
    let totalRevenue = 0;
    let sandboxesBilled = 0;
    let warningsSent = 0;
    let sandboxesShutdown = 0;
    let errors = 0;

    for (const sandbox of allBillable) {
      const org = orgMap.get(sandbox.organization_id);
      if (!org) {
        results.push({
          sandboxId: sandbox.id,
          agentName: sandbox.agent_name ?? "unknown",
          organizationId: sandbox.organization_id,
          action: "error",
          error: "Organization not found",
        });
        errors++;
        continue;
      }

      try {
        const result = await processSandboxBilling(sandbox, org);
        results.push(result);

        if (result.action === "billed" && result.amount) {
          totalRevenue += result.amount;
          sandboxesBilled++;
          // Update org balance in memory for next sandbox in same org
          org.credit_balance = String(result.newBalance);
        } else if (result.action === "warning_sent") {
          warningsSent++;
        } else if (result.action === "shutdown") {
          sandboxesShutdown++;
        } else if (result.action === "error") {
          errors++;
        }
      } catch (error) {
        logger.error(
          `[Milady Billing] Error processing sandbox ${sandbox.agent_name ?? sandbox.id}`,
          { error },
        );
        results.push({
          sandboxId: sandbox.id,
          agentName: sandbox.agent_name ?? "unknown",
          organizationId: sandbox.organization_id,
          action: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        errors++;
      }
    }

    const duration = Date.now() - startTime;

    logger.info("[Milady Billing] Completed hourly billing run", {
      sandboxesProcessed: results.length,
      sandboxesBilled,
      warningsSent,
      sandboxesShutdown,
      totalRevenue: totalRevenue.toFixed(4),
      errors,
      duration,
    });

    return NextResponse.json({
      success: true,
      data: {
        sandboxesProcessed: results.length,
        sandboxesBilled,
        warningsSent,
        sandboxesShutdown,
        totalRevenue: Math.round(totalRevenue * 10000) / 10000,
        errors,
        duration,
        timestamp: new Date().toISOString(),
        results: results.slice(0, 100),
      },
    });
  } catch (error) {
    logger.error("[Milady Billing] Failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Milady billing failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cron/milady-billing
 * Hourly milady agent billing cron job.
 */
export async function GET(request: NextRequest) {
  return handleMiladyBilling(request);
}

/**
 * POST /api/cron/milady-billing
 * POST variant for manual triggering.
 */
export async function POST(request: NextRequest) {
  return handleMiladyBilling(request);
}
