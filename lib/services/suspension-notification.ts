/**
 * Suspension Notification Service
 * Notifies domain/app owners via email when content is suspended.
 */

import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { organizations } from "@/db/schemas/organizations";
import { users } from "@/db/schemas/users";
import {
  managedDomainsRepository,
  type ManagedDomain,
  type DomainModerationFlag,
} from "@/db/repositories/managed-domains";
import { emailService } from "./email";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import type { SuspensionNotificationEmailData } from "@/lib/email/types";

const APPEAL_EMAIL =
  process.env.MODERATION_APPEAL_EMAIL || "appeals@eliza.cloud";
const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL || "https://eliza.cloud";

const FLAG_CATEGORY_MAP: Record<string, string> = {
  csam: "Child Safety Violation",
  illegal: "Illegal Content",
  content: "Content Policy Violation",
  ai_flagged: "AI-Detected Violation",
  expletive: "Inappropriate Language",
  trademark: "Trademark Concern",
  suspicious: "Suspicious Activity",
  restricted: "Restricted Content",
};

async function getOwnerEmail(
  orgId: string,
): Promise<{ email: string; orgName: string } | null> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  if (!org) return null;

  if (org.billing_email) return { email: org.billing_email, orgName: org.name };

  const owner = await db.query.users.findFirst({
    where: and(eq(users.organization_id, orgId), eq(users.role, "owner")),
  });
  if (owner?.email) return { email: owner.email, orgName: org.name };

  const anyUser = await db.query.users.findFirst({
    where: eq(users.organization_id, orgId),
  });
  return anyUser?.email ? { email: anyUser.email, orgName: org.name } : null;
}

function getResourceType(d: ManagedDomain): "domain" | "app" | "agent" | "mcp" {
  if (d.agentId) return "agent";
  if (d.appId) return "app";
  if (d.mcpId) return "mcp";
  return "domain";
}

function getCategories(flags: DomainModerationFlag[]): string[] {
  return [
    ...new Set(
      flags.map((f) => FLAG_CATEGORY_MAP[f.type] || "Policy Violation"),
    ),
  ];
}

class SuspensionNotificationService {
  async notifyDomainSuspension(
    domainId: string,
    reason: string,
    flags: DomainModerationFlag[],
  ): Promise<{ emailSent: boolean; error?: string }> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return { emailSent: false, error: "Domain not found" };

    const owner = await getOwnerEmail(domain.organizationId);
    if (!owner) {
      logger.warn("[Suspension] No owner email", {
        domainId,
        orgId: domain.organizationId,
      });
      return { emailSent: false, error: "No owner email" };
    }

    const emailData: SuspensionNotificationEmailData = {
      email: owner.email,
      organizationName: owner.orgName,
      domain: domain.domain,
      resourceType: getResourceType(domain),
      suspensionReason: reason,
      violationCategories: getCategories(flags),
      appealEmail: APPEAL_EMAIL,
      dashboardUrl: `${DASHBOARD_URL}/dashboard`,
    };

    try {
      const sent =
        await emailService.sendSuspensionNotificationEmail(emailData);
      if (sent) {
        await managedDomainsRepository.markOwnerNotified(domainId);
        logger.info("[Suspension] Email sent", {
          domain: domain.domain,
          email: owner.email,
        });
      }
      return { emailSent: sent };
    } catch (e) {
      logger.error("[Suspension] Email failed", {
        domain: domain.domain,
        error: extractErrorMessage(e),
      });
      return { emailSent: false, error: extractErrorMessage(e) };
    }
  }

  async processUnnotifiedSuspensions(): Promise<{
    processed: number;
    notified: number;
    errors: number;
  }> {
    const unnotified =
      await managedDomainsRepository.listSuspendedNotNotified();
    let notified = 0,
      errors = 0;

    for (const d of unnotified) {
      const result = await this.notifyDomainSuspension(
        d.id,
        d.suspensionReason || "Content violation",
        d.moderationFlags || [],
      );
      result.emailSent ? notified++ : errors++;
    }

    logger.info("[Suspension] Batch complete", {
      processed: unnotified.length,
      notified,
      errors,
    });
    return { processed: unnotified.length, notified, errors };
  }

  async suspendAndNotify(
    domainId: string,
    reason: string,
    flags: DomainModerationFlag[],
  ): Promise<{ suspended: boolean; notified: boolean; error?: string }> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain)
      return { suspended: false, notified: false, error: "Domain not found" };

    await managedDomainsRepository.suspendDomain(domainId, reason, {
      notifiedAt: new Date().toISOString(),
      method: "both",
      reason,
      appealEmail: APPEAL_EMAIL,
    });

    await managedDomainsRepository.createEvent({
      domainId,
      eventType: "suspension",
      severity: "critical",
      description: reason,
      detectedBy: "automated_scan",
      actionTaken: "suspended",
      previousStatus: domain.status,
      newStatus: "suspended",
    });

    const notify = await this.notifyDomainSuspension(domainId, reason, flags);
    logger.warn("[Suspension] Domain suspended", {
      domain: domain.domain,
      reason,
      notified: notify.emailSent,
    });

    return { suspended: true, notified: notify.emailSent, error: notify.error };
  }
}

export const suspensionNotificationService =
  new SuspensionNotificationService();
