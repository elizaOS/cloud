import { eq, and, desc, sql, isNull, lte } from "drizzle-orm";
import { db } from "../client";
import { managedDomains, type ManagedDomain, type NewManagedDomain, type DomainModerationFlag, type DnsRecord, type ContentScanCache, type SuspensionNotification } from "../schemas/managed-domains";
import { domainModerationEvents, type DomainModerationEvent, type NewDomainModerationEvent } from "../schemas/domain-moderation-events";

export type { ManagedDomain, NewManagedDomain, DomainModerationFlag, DnsRecord, ContentScanCache, SuspensionNotification };
export type { DomainModerationEvent, NewDomainModerationEvent };

export class ManagedDomainsRepository {
  async findById(id: string) {
    return db.query.managedDomains.findFirst({ where: eq(managedDomains.id, id) });
  }

  async findByIdAndOrg(id: string, organizationId: string) {
    return db.query.managedDomains.findFirst({
      where: and(eq(managedDomains.id, id), eq(managedDomains.organizationId, organizationId)),
    });
  }

  async findByDomain(domain: string) {
    return db.query.managedDomains.findFirst({ where: eq(managedDomains.domain, domain.toLowerCase()) });
  }

  async listByOrganization(organizationId: string) {
    return db.query.managedDomains.findMany({
      where: eq(managedDomains.organizationId, organizationId),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  async listByStatus(status: ManagedDomain["status"]) {
    return db.query.managedDomains.findMany({
      where: eq(managedDomains.status, status),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  async listExpiringWithinDays(days: number) {
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

  async create(data: NewManagedDomain): Promise<ManagedDomain> {
    const [domain] = await db.insert(managedDomains).values({ ...data, domain: data.domain.toLowerCase() }).returning();
    return domain;
  }

  async update(id: string, data: Partial<NewManagedDomain>) {
    const [updated] = await db.update(managedDomains).set({ ...data, updatedAt: new Date() }).where(eq(managedDomains.id, id)).returning();
    return updated;
  }

  async updateByOrg(id: string, organizationId: string, data: Partial<NewManagedDomain>) {
    const [updated] = await db.update(managedDomains).set({ ...data, updatedAt: new Date() })
      .where(and(eq(managedDomains.id, id), eq(managedDomains.organizationId, organizationId))).returning();
    return updated;
  }

  async delete(id: string) {
    const result = await db.delete(managedDomains).where(eq(managedDomains.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async deleteByOrg(id: string, organizationId: string) {
    const result = await db.delete(managedDomains).where(and(eq(managedDomains.id, id), eq(managedDomains.organizationId, organizationId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  findByAppId = (appId: string) => db.query.managedDomains.findFirst({ where: eq(managedDomains.appId, appId) });
  findByContainerId = (containerId: string) => db.query.managedDomains.findFirst({ where: eq(managedDomains.containerId, containerId) });
  findByAgentId = (agentId: string) => db.query.managedDomains.findFirst({ where: eq(managedDomains.agentId, agentId) });
  findByMcpId = (mcpId: string) => db.query.managedDomains.findFirst({ where: eq(managedDomains.mcpId, mcpId) });

  private async assignTo(domainId: string, resourceType: ManagedDomain["resourceType"], resourceId: string) {
    const [updated] = await db.update(managedDomains).set({
      resourceType,
      appId: resourceType === "app" ? resourceId : null,
      containerId: resourceType === "container" ? resourceId : null,
      agentId: resourceType === "agent" ? resourceId : null,
      mcpId: resourceType === "mcp" ? resourceId : null,
      updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  assignToApp = (domainId: string, appId: string) => this.assignTo(domainId, "app", appId);
  assignToContainer = (domainId: string, containerId: string) => this.assignTo(domainId, "container", containerId);
  assignToAgent = (domainId: string, agentId: string) => this.assignTo(domainId, "agent", agentId);
  assignToMcp = (domainId: string, mcpId: string) => this.assignTo(domainId, "mcp", mcpId);

  async unassign(domainId: string) {
    const [updated] = await db.update(managedDomains).set({
      resourceType: null, appId: null, containerId: null, agentId: null, mcpId: null, updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async listUnassigned(organizationId: string) {
    return db.query.managedDomains.findMany({
      where: and(eq(managedDomains.organizationId, organizationId), isNull(managedDomains.resourceType)),
      orderBy: [desc(managedDomains.createdAt)],
    });
  }

  async updateDnsRecords(domainId: string, records: DnsRecord[]) {
    const [updated] = await db.update(managedDomains).set({ dnsRecords: records, updatedAt: new Date() })
      .where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async updateSslStatus(domainId: string, status: ManagedDomain["sslStatus"], expiresAt?: Date) {
    const [updated] = await db.update(managedDomains).set({ sslStatus: status, sslExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async setVerificationToken(domainId: string, token: string) {
    const [updated] = await db.update(managedDomains).set({ verificationToken: token, verified: false, verifiedAt: null, updatedAt: new Date() })
      .where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async markVerified(domainId: string) {
    const [updated] = await db.update(managedDomains).set({ verified: true, verifiedAt: new Date(), verificationToken: null, updatedAt: new Date() })
      .where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async updateModerationStatus(
    domainId: string,
    status: ManagedDomain["moderationStatus"],
    flags?: DomainModerationFlag[]
  ) {
    const [updated] = await db.update(managedDomains)
      .set({ moderationStatus: status, ...(flags !== undefined && { moderationFlags: flags }), updatedAt: new Date() })
      .where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async addModerationFlag(domainId: string, flag: DomainModerationFlag) {
    const domain = await this.findById(domainId);
    if (!domain) return undefined;

    const [updated] = await db.update(managedDomains).set({
      moderationFlags: [...(domain.moderationFlags || []), flag],
      moderationStatus: flag.severity === "critical" || flag.severity === "high" ? "flagged" : domain.moderationStatus,
      updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async listByModerationStatus(status: ManagedDomain["moderationStatus"]) {
    return db.query.managedDomains.findMany({ where: eq(managedDomains.moderationStatus, status), orderBy: [desc(managedDomains.updatedAt)] });
  }

  async listNeedingReview() {
    return db.query.managedDomains.findMany({
      where: sql`${managedDomains.moderationStatus} IN ('pending_review', 'flagged')`,
      orderBy: [desc(managedDomains.updatedAt)],
    });
  }

  async updateHealthStatus(domainId: string, isLive: boolean, error?: string) {
    const [updated] = await db.update(managedDomains).set({
      lastHealthCheck: new Date(), isLive, healthCheckError: error || null, updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async listNeedingHealthCheck(hoursAgo: number) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursAgo);
    return db.query.managedDomains.findMany({
      where: and(eq(managedDomains.status, "active"), sql`(${managedDomains.lastHealthCheck} IS NULL OR ${managedDomains.lastHealthCheck} < ${cutoff})`),
      orderBy: [managedDomains.lastHealthCheck],
    });
  }

  async listNeedingContentScan(hoursAgo: number) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursAgo);
    return db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.status, "active"),
        eq(managedDomains.isLive, true),
        sql`(${managedDomains.lastContentScanAt} IS NULL OR ${managedDomains.lastContentScanAt} < ${cutoff})`
      ),
      orderBy: [managedDomains.lastContentScanAt],
    });
  }

  async listNeedingAiScan(daysAgo: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysAgo);
    return db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.status, "active"),
        eq(managedDomains.isLive, true),
        sql`(${managedDomains.lastAiScanAt} IS NULL OR ${managedDomains.lastAiScanAt} < ${cutoff})`
      ),
      orderBy: [managedDomains.lastAiScanAt],
    });
  }

  async updateContentScan(
    domainId: string,
    contentHash: string,
    cache: ContentScanCache,
    isAiScan: boolean
  ) {
    const now = new Date();
    const [updated] = await db.update(managedDomains).set({
      contentHash,
      lastContentScanAt: now,
      ...(isAiScan && { lastAiScanAt: now, aiScanModel: cache.model }),
      contentScanConfidence: cache.confidence,
      contentScanCache: cache,
      updatedAt: now,
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async suspendDomain(
    domainId: string,
    reason: string,
    notification: SuspensionNotification
  ) {
    const now = new Date();
    const [updated] = await db.update(managedDomains).set({
      status: "suspended",
      moderationStatus: "suspended",
      suspendedAt: now,
      suspensionReason: reason,
      suspensionNotification: notification,
      ownerNotifiedAt: now,
      updatedAt: now,
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async listSuspended() {
    return db.query.managedDomains.findMany({
      where: eq(managedDomains.status, "suspended"),
      orderBy: [desc(managedDomains.suspendedAt)],
    });
  }

  async listSuspendedNotNotified() {
    return db.query.managedDomains.findMany({
      where: and(
        eq(managedDomains.status, "suspended"),
        isNull(managedDomains.ownerNotifiedAt)
      ),
      orderBy: [desc(managedDomains.suspendedAt)],
    });
  }

  async markOwnerNotified(domainId: string) {
    const [updated] = await db.update(managedDomains).set({
      ownerNotifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async reinstateFromSuspension(domainId: string) {
    const [updated] = await db.update(managedDomains).set({
      status: "active",
      moderationStatus: "clean",
      suspendedAt: null,
      suspensionReason: null,
      suspensionNotification: null,
      moderationFlags: [],
      updatedAt: new Date(),
    }).where(eq(managedDomains.id, domainId)).returning();
    return updated;
  }

  async createEvent(data: NewDomainModerationEvent): Promise<DomainModerationEvent> {
    const [event] = await db.insert(domainModerationEvents).values(data).returning();
    return event;
  }

  async listEvents(domainId: string) {
    return db.query.domainModerationEvents.findMany({ where: eq(domainModerationEvents.domainId, domainId), orderBy: [desc(domainModerationEvents.createdAt)] });
  }

  async listUnresolvedEvents() {
    return db.query.domainModerationEvents.findMany({ where: isNull(domainModerationEvents.resolvedAt), orderBy: [desc(domainModerationEvents.createdAt)] });
  }

  async resolveEvent(eventId: string, resolvedBy: string, notes?: string) {
    const [updated] = await db.update(domainModerationEvents).set({ resolvedAt: new Date(), resolvedBy, resolutionNotes: notes })
      .where(eq(domainModerationEvents.id, eventId)).returning();
    return updated;
  }

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

