/**
 * Admin Domains API
 *
 * GET /api/admin/domains - Get domain moderation dashboard
 * POST /api/admin/domains - Take moderation action on a domain
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { adminService } from "@/lib/services/admin";
import { domainModerationService } from "@/lib/services/domain-moderation";
import { domainHealthMonitorService } from "@/lib/services/domain-health-monitor";
import { managedDomainsRepository } from "@/db/repositories/managed-domains";
import { logger } from "@/lib/utils/logger";

// Admin check helper
async function requireAdmin(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  if (!user.wallet_address) {
    return { error: "Wallet address required for admin access", status: 403 };
  }

  const isAdmin = await adminService.isAdmin(user.wallet_address);
  if (!isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const role = await adminService.getAdminRole(user.wallet_address);

  return { user, role };
}

const ModerationActionSchema = z.object({
  action: z.enum(["flag", "suspend", "reinstate", "resolve"]),
  domainId: z.string().uuid(),
  reason: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  eventId: z.string().uuid().optional(), // For resolving specific events
});

/**
 * GET /api/admin/domains
 * Get domain moderation dashboard data
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "overview";

  switch (view) {
    case "overview": {
      const [healthSummary, issues, unresolvedEvents] = await Promise.all([
        domainHealthMonitorService.getHealthSummary(),
        domainHealthMonitorService.getDomainsWithIssues(),
        domainModerationService.getUnresolvedEvents(),
      ]);

      return NextResponse.json({
        success: true,
        summary: healthSummary,
        issues: {
          down: issues.down.slice(0, 10).map((d) => ({
            id: d.id,
            domain: d.domain,
            lastHealthCheck: d.lastHealthCheck,
            error: d.healthCheckError,
          })),
          sslIssues: issues.sslIssues.slice(0, 10).map((d) => ({
            id: d.id,
            domain: d.domain,
            sslStatus: d.sslStatus,
          })),
          flagged: issues.flagged.slice(0, 10).map((d) => ({
            id: d.id,
            domain: d.domain,
            moderationStatus: d.moderationStatus,
            flags: d.moderationFlags,
          })),
          expiringSoon: issues.expiringSoon.slice(0, 10).map((d) => ({
            id: d.id,
            domain: d.domain,
            expiresAt: d.expiresAt,
          })),
        },
        unresolvedEvents: unresolvedEvents.slice(0, 20),
        adminRole: auth.role,
      });
    }

    case "flagged": {
      const flagged = await domainModerationService.getDomainsNeedingReview();
      return NextResponse.json({
        success: true,
        domains: flagged,
      });
    }

    case "events": {
      const events = await domainModerationService.getUnresolvedEvents();
      return NextResponse.json({
        success: true,
        events,
      });
    }

    case "domain": {
      const domainId = url.searchParams.get("domainId");
      if (!domainId) {
        return NextResponse.json(
          { error: "domainId required" },
          { status: 400 }
        );
      }

      const domain = await managedDomainsRepository.findById(domainId);
      if (!domain) {
        return NextResponse.json(
          { error: "Domain not found" },
          { status: 404 }
        );
      }

      const events = await managedDomainsRepository.listEvents(domainId);

      return NextResponse.json({
        success: true,
        domain,
        events,
      });
    }

    default:
      return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }
}

/**
 * POST /api/admin/domains
 * Take moderation action on a domain
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ModerationActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { action, domainId, reason, severity, eventId } = parsed.data;

  logger.info("[AdminDomains] Moderation action", {
    action,
    domainId,
    adminUserId: auth.user.id,
  });

  switch (action) {
    case "flag": {
      const success = await domainModerationService.flagDomain(
        domainId,
        reason,
        severity || "medium",
        auth.user.id
      );
      return NextResponse.json({ success, action: "flagged" });
    }

    case "suspend": {
      const success = await domainModerationService.suspendDomain(
        domainId,
        reason,
        auth.user.id
      );
      return NextResponse.json({ success, action: "suspended" });
    }

    case "reinstate": {
      const success = await domainModerationService.reinstateDomain(
        domainId,
        reason,
        auth.user.id
      );
      return NextResponse.json({ success, action: "reinstated" });
    }

    case "resolve": {
      if (!eventId) {
        return NextResponse.json(
          { error: "eventId required for resolve action" },
          { status: 400 }
        );
      }

      const event = await managedDomainsRepository.resolveEvent(
        eventId,
        auth.user.id,
        reason
      );

      if (!event) {
        return NextResponse.json(
          { error: "Event not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, action: "resolved", event });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

