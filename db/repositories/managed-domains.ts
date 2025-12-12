/**
 * Managed Domains Repository
 *
 * Database operations for domain management, including:
 * - Domain CRUD operations
 * - Assignment to resources (apps, containers, agents, MCPs)
 * - Moderation event tracking
 * - Health status updates
 */

import { eq, and, desc, sql, isNull, lte, gte } from "drizzle-orm";
import { db } from "../client";
import {
  managedDomains,
  type ManagedDomain,
  type NewManagedDomain,
  type DomainModerationFlag,
  type DnsRecord,
} from "../schemas/managed-domains";
import {
  domainModerationEvents,
  type DomainModerationEvent,
  type NewDomainModerationEvent,
} from "../schemas/domain-moderation-events";

export type { ManagedDomain, NewManagedDomain, DomainModerationFlag, DnsRecord };
export type { DomainModerationEvent, NewDomainModerationEvent };

export class ManagedDomainsRepository {
  // ============================================
  // Domain CRUD Operations
  // ============================================

  /**
   * Find a domain by ID
   */
  async findById(id: string): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.id, id),
    });
  }

  /**
   * Find a domain by ID within an organization
   */
  async findByIdAndOrg(
    id: string,
    organizationId: string
  ): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: and(
        eq(managedDomains.id, id),
        eq(managedDomains.organizationId, organizationId)
      ),
    });
  }

  /**
   * Find a domain by domain name
   */
  async findByDomain(domain: string): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.domain, domain.toLowerCase()),
    });
  }

  /**
   * List all domains for an organization
   */
  async listByOrganization(organizationId: string): Promise<ManagedDomain[]> {
    return await db.query.managedDomains.findMany({
      where: eq(managedDomains.organizationId, organizationId),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  /**
   * List domains by status
   */
  async listByStatus(
    status: ManagedDomain["status"]
  ): Promise<ManagedDomain[]> {
    return await db.query.managedDomains.findMany({
      where: eq(managedDomains.status, status),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  /**
   * List domains expiring within a given number of days
   */
  async listExpiringWithinDays(days: number): Promise<ManagedDomain[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return await db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.status, "active"),
        lte(managedDomains.expiresAt, futureDate)
      ),
      orderBy: [managedDomains.expiresAt],
    });
  }

  /**
   * Create a new managed domain
   */
  async create(data: NewManagedDomain): Promise<ManagedDomain> {
    const [domain] = await db
      .insert(managedDomains)
      .values({
        ...data,
        domain: data.domain.toLowerCase(),
      })
      .returning();
    return domain;
  }

  /**
   * Update a managed domain
   */
  async update(
    id: string,
    data: Partial<NewManagedDomain>
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, id))
      .returning();
    return updated;
  }

  /**
   * Update a managed domain within an organization
   */
  async updateByOrg(
    id: string,
    organizationId: string,
    data: Partial<NewManagedDomain>
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedDomains.id, id),
          eq(managedDomains.organizationId, organizationId)
        )
      )
      .returning();
    return updated;
  }

  /**
   * Delete a managed domain
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(managedDomains)
      .where(eq(managedDomains.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Delete a managed domain within an organization
   */
  async deleteByOrg(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(managedDomains)
      .where(
        and(
          eq(managedDomains.id, id),
          eq(managedDomains.organizationId, organizationId)
        )
      );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============================================
  // Resource Assignment Operations
  // ============================================

  /**
   * Find domain assigned to an app
   */
  async findByAppId(appId: string): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.appId, appId),
    });
  }

  /**
   * Find domain assigned to a container
   */
  async findByContainerId(
    containerId: string
  ): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.containerId, containerId),
    });
  }

  /**
   * Find domain assigned to an agent
   */
  async findByAgentId(agentId: string): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.agentId, agentId),
    });
  }

  /**
   * Find domain assigned to an MCP
   */
  async findByMcpId(mcpId: string): Promise<ManagedDomain | undefined> {
    return await db.query.managedDomains.findFirst({
      where: eq(managedDomains.mcpId, mcpId),
    });
  }

  /**
   * Assign domain to an app
   */
  async assignToApp(
    domainId: string,
    appId: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        resourceType: "app",
        appId,
        containerId: null,
        agentId: null,
        mcpId: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Assign domain to a container
   */
  async assignToContainer(
    domainId: string,
    containerId: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        resourceType: "container",
        containerId,
        appId: null,
        agentId: null,
        mcpId: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Assign domain to an agent
   */
  async assignToAgent(
    domainId: string,
    agentId: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        resourceType: "agent",
        agentId,
        appId: null,
        containerId: null,
        mcpId: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Assign domain to an MCP
   */
  async assignToMcp(
    domainId: string,
    mcpId: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        resourceType: "mcp",
        mcpId,
        appId: null,
        containerId: null,
        agentId: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Unassign domain from any resource
   */
  async unassign(domainId: string): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        resourceType: null,
        appId: null,
        containerId: null,
        agentId: null,
        mcpId: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * List unassigned domains for an organization
   */
  async listUnassigned(organizationId: string): Promise<ManagedDomain[]> {
    return await db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.organizationId, organizationId),
        isNull(managedDomains.resourceType)
      ),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  // ============================================
  // DNS Operations
  // ============================================

  /**
   * Update DNS records for a domain
   */
  async updateDnsRecords(
    domainId: string,
    records: DnsRecord[]
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        dnsRecords: records,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Update SSL status for a domain
   */
  async updateSslStatus(
    domainId: string,
    status: ManagedDomain["sslStatus"],
    expiresAt?: Date
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        sslStatus: status,
        sslExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  // ============================================
  // Verification Operations
  // ============================================

  /**
   * Set verification token for a domain
   */
  async setVerificationToken(
    domainId: string,
    token: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        verificationToken: token,
        verified: false,
        verifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Mark domain as verified
   */
  async markVerified(domainId: string): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        verified: true,
        verifiedAt: new Date(),
        verificationToken: null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  // ============================================
  // Moderation Operations
  // ============================================

  /**
   * Update moderation status
   */
  async updateModerationStatus(
    domainId: string,
    status: ManagedDomain["moderationStatus"],
    flags?: DomainModerationFlag[]
  ): Promise<ManagedDomain | undefined> {
    const updateData: Partial<NewManagedDomain> = {
      moderationStatus: status,
      updatedAt: new Date(),
    };
    if (flags !== undefined) {
      updateData.moderationFlags = flags;
    }

    const [updated] = await db
      .update(managedDomains)
      .set(updateData)
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * Add a moderation flag to a domain
   */
  async addModerationFlag(
    domainId: string,
    flag: DomainModerationFlag
  ): Promise<ManagedDomain | undefined> {
    const domain = await this.findById(domainId);
    if (!domain) return undefined;

    const existingFlags = domain.moderationFlags || [];
    const newFlags = [...existingFlags, flag];

    const [updated] = await db
      .update(managedDomains)
      .set({
        moderationFlags: newFlags,
        moderationStatus:
          flag.severity === "critical" || flag.severity === "high"
            ? "flagged"
            : domain.moderationStatus,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * List domains by moderation status
   */
  async listByModerationStatus(
    status: ManagedDomain["moderationStatus"]
  ): Promise<ManagedDomain[]> {
    return await db.query.managedDomains.findMany({
      where: eq(managedDomains.moderationStatus, status),
      orderBy: [desc(managedDomains.updatedAt)],
    });
  }

  /**
   * List domains needing moderation review
   */
  async listNeedingReview(): Promise<ManagedDomain[]> {
    return await db.query.managedDomains.findMany({
      where: sql`${managedDomains.moderationStatus} IN ('pending_review', 'flagged')`,
      orderBy: [desc(managedDomains.updatedAt)],
    });
  }

  // ============================================
  // Health Monitoring Operations
  // ============================================

  /**
   * Update health check status
   */
  async updateHealthStatus(
    domainId: string,
    isLive: boolean,
    error?: string
  ): Promise<ManagedDomain | undefined> {
    const [updated] = await db
      .update(managedDomains)
      .set({
        lastHealthCheck: new Date(),
        isLive,
        healthCheckError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(managedDomains.id, domainId))
      .returning();
    return updated;
  }

  /**
   * List domains needing health check (not checked in specified hours)
   */
  async listNeedingHealthCheck(hoursAgo: number): Promise<ManagedDomain[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursAgo);

    return await db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.status, "active"),
        sql`(${managedDomains.lastHealthCheck} IS NULL OR ${managedDomains.lastHealthCheck} < ${cutoff})`
      ),
      orderBy: [managedDomains.lastHealthCheck],
    });
  }

  // ============================================
  // Moderation Events
  // ============================================

  /**
   * Create a moderation event
   */
  async createEvent(
    data: NewDomainModerationEvent
  ): Promise<DomainModerationEvent> {
    const [event] = await db
      .insert(domainModerationEvents)
      .values(data)
      .returning();
    return event;
  }

  /**
   * List events for a domain
   */
  async listEvents(domainId: string): Promise<DomainModerationEvent[]> {
    return await db.query.domainModerationEvents.findMany({
      where: eq(domainModerationEvents.domainId, domainId),
      orderBy: [desc(domainModerationEvents.createdAt)],
    });
  }

  /**
   * List unresolved events
   */
  async listUnresolvedEvents(): Promise<DomainModerationEvent[]> {
    return await db.query.domainModerationEvents.findMany({
      where: isNull(domainModerationEvents.resolvedAt),
      orderBy: [desc(domainModerationEvents.createdAt)],
    });
  }

  /**
   * Resolve an event
   */
  async resolveEvent(
    eventId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<DomainModerationEvent | undefined> {
    const [updated] = await db
      .update(domainModerationEvents)
      .set({
        resolvedAt: new Date(),
        resolvedBy,
        resolutionNotes: notes,
      })
      .where(eq(domainModerationEvents.id, eventId))
      .returning();
    return updated;
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get domain statistics for an organization
   */
  async getStats(organizationId: string): Promise<{
    total: number;
    active: number;
    pending: number;
    suspended: number;
    expiringSoon: number;
  }> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const domains = await db.query.managedDomains.findMany({
      where: eq(managedDomains.organizationId, organizationId),
    });

    return {
      total: domains.length,
      active: domains.filter((d) => d.status === "active").length,
      pending: domains.filter((d) => d.status === "pending").length,
      suspended: domains.filter((d) => d.status === "suspended").length,
      expiringSoon: domains.filter(
        (d) =>
          d.status === "active" &&
          d.expiresAt &&
          d.expiresAt <= thirtyDaysFromNow
      ).length,
    };
  }
}

export const managedDomainsRepository = new ManagedDomainsRepository();

