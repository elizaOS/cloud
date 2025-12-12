import { managedDomainsRepository, type ManagedDomain, type NewManagedDomain, type DnsRecord } from "@/db/repositories/managed-domains";
import { logger } from "@/lib/utils/logger";
import { domainModerationService } from "./domain-moderation";

const VERCEL_API_BASE = "https://api.vercel.com";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

export interface DomainSearchResult {
  domain: string;
  available: boolean;
  price?: DomainPricing;
  premium?: boolean;
  period?: number; // years
}

export interface DomainPricing {
  price: number; // in cents
  period: number; // years
  renewalPrice: number; // in cents per year
  currency: string;
}

export interface DomainPurchaseParams {
  domain: string;
  organizationId: string;
  registrantInfo: ManagedDomain["registrantInfo"];
  paymentMethod: "credits"; // stripe/x402 not yet implemented
  stripePaymentIntentId?: string;
  autoRenew?: boolean;
}

export interface DomainPurchaseResult {
  success: boolean;
  domain?: ManagedDomain;
  error?: string;
  verificationRequired?: boolean;
}

export interface DomainConfigResult {
  success: boolean;
  domain?: ManagedDomain;
  error?: string;
  dnsInstructions?: DnsInstruction[];
}

export interface DnsInstruction {
  type: "A" | "CNAME" | "TXT" | "NS";
  name: string;
  value: string;
  description: string;
}

export interface VercelDomainResponse {
  name: string;
  apexName: string;
  projectId?: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
  serviceType?: string;
  createdAt?: number;
  boughtAt?: number;
  expiresAt?: number;
  transferStartedAt?: number;
  transferredAt?: number;
  orderedAt?: number;
}

interface VercelDomainCheckResponse { name: string; available: boolean }
interface VercelDomainPriceResponse { price: number; period: number }

function buildVercelUrl(path: string, includeTeam = true): string {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (includeTeam && VERCEL_TEAM_ID) {
    url.searchParams.set("teamId", VERCEL_TEAM_ID);
  }
  return url.toString();
}

async function vercelFetch<T>(
  path: string,
  options: RequestInit = {},
  includeTeam = true
): Promise<T> {
  if (!VERCEL_TOKEN) {
    throw new Error("VERCEL_TOKEN is not configured");
  }

  const url = buildVercelUrl(path, includeTeam);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: { message: response.statusText },
    }));
    throw new Error(
      error.error?.message || `Vercel API error: ${response.status}`
    );
  }

  return response.json();
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

const isApexDomain = (domain: string) => domain.split(".").length === 2;

class DomainManagementService {
  async checkAvailability(domain: string): Promise<DomainSearchResult> {
    const normalized = normalizeDomain(domain);

    logger.info("[DomainManagement] Checking availability", { domain: normalized });

    // First check moderation
    const moderation = await domainModerationService.validateDomainName(normalized);
    if (!moderation.allowed) {
      return {
        domain: normalized,
        available: false,
      };
    }

    // Check if already in our system
    const existing = await managedDomainsRepository.findByDomain(normalized);
    if (existing) {
      return {
        domain: normalized,
        available: false,
      };
    }

    // Check with Vercel
    const response = await vercelFetch<VercelDomainCheckResponse>(
      `/v5/domains/status?name=${encodeURIComponent(normalized)}`,
      { method: "GET" }
    );

    const result: DomainSearchResult = {
      domain: normalized,
      available: response.available,
    };

    // Get pricing if available
    if (response.available) {
      const pricing = await this.getDomainPrice(normalized);
      if (pricing) {
        result.price = pricing;
        result.period = pricing.period;
      }
    }

    return result;
  }

  async getDomainPrice(domain: string): Promise<DomainPricing | null> {
    const normalized = normalizeDomain(domain);

    try {
      const response = await vercelFetch<VercelDomainPriceResponse>(
        `/v4/domains/price?name=${encodeURIComponent(normalized)}`,
        { method: "GET" }
      );

      return {
        price: response.price,
        period: response.period,
        renewalPrice: response.price, // Vercel uses same price for renewal
        currency: "USD",
      };
    } catch (error) {
      logger.warn("[DomainManagement] Failed to get domain price", {
        domain: normalized,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  async searchDomains(query: string, tlds?: string[]): Promise<DomainSearchResult[]> {
    const normalized = query.toLowerCase().trim();
    const targetTlds = tlds || ["com", "ai", "io", "co", "app", "dev"];
    const results: DomainSearchResult[] = [];

    // Check moderation first
    const moderation = await domainModerationService.validateDomainName(normalized);
    if (!moderation.allowed) {
      return results;
    }

    // Check each TLD
    const checkPromises = targetTlds.map(async (tld) => {
      const domain = normalized.includes(".") ? normalized : `${normalized}.${tld}`;
      try {
        return await this.checkAvailability(domain);
      } catch {
        return null;
      }
    });

    const checkResults = await Promise.all(checkPromises);
    for (const result of checkResults) {
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  async purchaseDomain(params: DomainPurchaseParams): Promise<DomainPurchaseResult> {
    const {
      domain,
      organizationId,
      registrantInfo,
      paymentMethod,
      stripePaymentIntentId,
      autoRenew = true,
    } = params;

    const normalized = normalizeDomain(domain);

    logger.info("[DomainManagement] Attempting domain purchase", {
      domain: normalized,
      organizationId,
      paymentMethod,
    });

    // Validate domain name
    const moderation = await domainModerationService.validateDomainName(normalized);
    if (!moderation.allowed) {
      return {
        success: false,
        error: `Domain name not allowed: ${moderation.flags.map((f) => f.reason).join(", ")}`,
      };
    }

    // Check availability
    const availability = await this.checkAvailability(normalized);
    if (!availability.available) {
      return {
        success: false,
        error: "Domain is not available for purchase",
      };
    }

    // Register domain with Vercel
    try {
      const vercelResponse = await vercelFetch<VercelDomainResponse>(
        "/v5/domains/buy",
        {
          method: "POST",
          body: JSON.stringify({
            name: normalized,
            expectedPrice: availability.price?.price,
          }),
        }
      );

      // Create managed domain record
      const expiresAt = vercelResponse.expiresAt
        ? new Date(vercelResponse.expiresAt)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

      const managedDomain = await managedDomainsRepository.create({
        organizationId,
        domain: normalized,
        registrar: "vercel",
        vercelDomainId: vercelResponse.name,
        registeredAt: new Date(),
        expiresAt,
        autoRenew,
        status: "active",
        registrantInfo,
        nameserverMode: "vercel",
        verified: true,
        verifiedAt: new Date(),
        moderationStatus: moderation.requiresReview ? "pending_review" : "clean",
        moderationFlags: moderation.flags,
        purchasePrice: availability.price?.price.toString(),
        renewalPrice: availability.price?.renewalPrice.toString(),
        paymentMethod,
        stripePaymentIntentId,
      });

      // Log moderation event
      await managedDomainsRepository.createEvent({
        domainId: managedDomain.id,
        eventType: "name_check",
        severity: moderation.flags.length > 0 ? "medium" : "info",
        description: `Domain purchased: ${normalized}`,
        detectedBy: "system",
        actionTaken: "approved",
      });

      logger.info("[DomainManagement] Domain purchased successfully", {
        domain: normalized,
        domainId: managedDomain.id,
      });

      return {
        success: true,
        domain: managedDomain,
      };
    } catch (error) {
      logger.error("[DomainManagement] Domain purchase failed", {
        domain: normalized,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Domain purchase failed",
      };
    }
  }

  async registerExternalDomain(
    domain: string,
    organizationId: string,
    nameserverMode: "vercel" | "external" = "external"
  ): Promise<DomainConfigResult> {
    const normalized = normalizeDomain(domain);

    logger.info("[DomainManagement] Registering external domain", {
      domain: normalized,
      organizationId,
      nameserverMode,
    });

    // Validate domain name
    const moderation = await domainModerationService.validateDomainName(normalized);
    if (!moderation.allowed) {
      return {
        success: false,
        error: `Domain name not allowed: ${moderation.flags.map((f) => f.reason).join(", ")}`,
      };
    }

    // Check if already registered
    const existing = await managedDomainsRepository.findByDomain(normalized);
    if (existing) {
      return {
        success: false,
        error: "Domain is already registered in the system",
      };
    }

    // Generate verification token
    const verificationToken = `eliza-verify-${crypto.randomUUID().slice(0, 12)}`;

    // Create managed domain record
    const managedDomain = await managedDomainsRepository.create({
      organizationId,
      domain: normalized,
      registrar: "external",
      status: "pending",
      nameserverMode,
      verified: false,
      verificationToken,
      moderationStatus: moderation.requiresReview ? "pending_review" : "clean",
      moderationFlags: moderation.flags,
    });

    // Generate DNS instructions
    const dnsInstructions = this.generateDnsInstructions(
      normalized,
      verificationToken,
      nameserverMode
    );

    return {
      success: true,
      domain: managedDomain,
      dnsInstructions,
    };
  }

  generateDnsInstructions(
    domain: string,
    verificationToken: string,
    nameserverMode: "vercel" | "external"
  ): DnsInstruction[] {
    const instructions: DnsInstruction[] = [];
    const isApex = isApexDomain(domain);

    // Verification record (always needed for external domains)
    instructions.push({
      type: "TXT",
      name: "_eliza-verification",
      value: verificationToken,
      description: "Add this TXT record to verify domain ownership",
    });

    if (nameserverMode === "vercel") {
      // Nameserver delegation
      instructions.push({
        type: "NS",
        name: "@",
        value: "ns1.vercel-dns.com",
        description: "Point nameservers to Vercel for automatic DNS management",
      });
      instructions.push({
        type: "NS",
        name: "@",
        value: "ns2.vercel-dns.com",
        description: "Secondary nameserver for redundancy",
      });
    } else {
      // Direct DNS records
      if (isApex) {
        instructions.push({
          type: "A",
          name: "@",
          value: "76.76.21.21",
          description: "Point apex domain to Vercel",
        });
      } else {
        const subdomain = domain.split(".")[0];
        instructions.push({
          type: "CNAME",
          name: subdomain,
          value: "cname.vercel-dns.com",
          description: "Point subdomain to Vercel",
        });
      }
    }

    return instructions;
  }

  async verifyDomain(domainId: string): Promise<{ verified: boolean; error?: string }> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) {
      return { verified: false, error: "Domain not found" };
    }

    if (domain.verified) {
      return { verified: true };
    }

    if (!domain.verificationToken) {
      return { verified: false, error: "No verification token set" };
    }

    logger.info("[DomainManagement] Verifying domain", { domain: domain.domain });

    try {
      // Check DNS for verification record
      const { Resolver } = await import("node:dns").then((m) => m.promises);
      const resolver = new Resolver();
      
      const txtRecords = await resolver.resolveTxt(
        `_eliza-verification.${domain.domain}`
      ).catch(() => []);

      const verified = txtRecords.some((records) =>
        records.includes(domain.verificationToken!)
      );

      if (verified) {
        await managedDomainsRepository.markVerified(domainId);
        await managedDomainsRepository.update(domainId, { status: "active" });

        await managedDomainsRepository.createEvent({
          domainId,
          eventType: "verification",
          severity: "info",
          description: "Domain ownership verified via DNS",
          detectedBy: "system",
          actionTaken: "verified",
        });

        logger.info("[DomainManagement] Domain verified", { domain: domain.domain });
        return { verified: true };
      }

      return { verified: false, error: "Verification record not found" };
    } catch (error) {
      logger.warn("[DomainManagement] Domain verification failed", {
        domain: domain.domain,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        verified: false,
        error: error instanceof Error ? error.message : "Verification failed",
      };
    }
  }

  async assignToApp(
    domainId: string,
    appId: string,
    organizationId: string
  ): Promise<ManagedDomain | null> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) return null;

    if (!domain.verified && domain.registrar === "external") {
      logger.warn("[DomainManagement] Cannot assign unverified external domain");
      return null;
    }

    const updated = await managedDomainsRepository.assignToApp(domainId, appId);

    if (updated) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "assignment_change",
        severity: "info",
        description: `Domain assigned to app: ${appId}`,
        detectedBy: "system",
        previousStatus: domain.resourceType || "unassigned",
        newStatus: "app",
      });
    }

    return updated || null;
  }

  async assignToContainer(
    domainId: string,
    containerId: string,
    organizationId: string
  ): Promise<ManagedDomain | null> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) return null;

    if (!domain.verified && domain.registrar === "external") {
      return null;
    }

    const updated = await managedDomainsRepository.assignToContainer(
      domainId,
      containerId
    );

    if (updated) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "assignment_change",
        severity: "info",
        description: `Domain assigned to container: ${containerId}`,
        detectedBy: "system",
        previousStatus: domain.resourceType || "unassigned",
        newStatus: "container",
      });
    }

    return updated || null;
  }

  async assignToAgent(
    domainId: string,
    agentId: string,
    organizationId: string
  ): Promise<ManagedDomain | null> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) return null;

    if (!domain.verified && domain.registrar === "external") {
      return null;
    }

    const updated = await managedDomainsRepository.assignToAgent(domainId, agentId);

    if (updated) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "assignment_change",
        severity: "info",
        description: `Domain assigned to agent: ${agentId}`,
        detectedBy: "system",
        previousStatus: domain.resourceType || "unassigned",
        newStatus: "agent",
      });
    }

    return updated || null;
  }

  async assignToMcp(
    domainId: string,
    mcpId: string,
    organizationId: string
  ): Promise<ManagedDomain | null> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) return null;

    if (!domain.verified && domain.registrar === "external") {
      return null;
    }

    const updated = await managedDomainsRepository.assignToMcp(domainId, mcpId);

    if (updated) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "assignment_change",
        severity: "info",
        description: `Domain assigned to MCP: ${mcpId}`,
        detectedBy: "system",
        previousStatus: domain.resourceType || "unassigned",
        newStatus: "mcp",
      });
    }

    return updated || null;
  }

  async unassignDomain(
    domainId: string,
    organizationId: string
  ): Promise<ManagedDomain | null> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) return null;

    const updated = await managedDomainsRepository.unassign(domainId);

    if (updated) {
      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "assignment_change",
        severity: "info",
        description: "Domain unassigned",
        detectedBy: "system",
        previousStatus: domain.resourceType || "unassigned",
        newStatus: "unassigned",
      });
    }

    return updated || null;
  }

  async getDnsRecords(domainId: string): Promise<DnsRecord[]> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return [];

    if (domain.registrar === "vercel" && domain.nameserverMode === "vercel") {
      // Fetch from Vercel API
      try {
        const response = await vercelFetch<{ records: DnsRecord[] }>(
          `/v4/domains/${encodeURIComponent(domain.domain)}/records`,
          { method: "GET" }
        );
        return response.records || [];
      } catch {
        return domain.dnsRecords || [];
      }
    }

    return domain.dnsRecords || [];
  }

  async addDnsRecord(
    domainId: string,
    record: Omit<DnsRecord, "id" | "createdAt">
  ): Promise<{ success: boolean; record?: DnsRecord; error?: string }> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) {
      return { success: false, error: "Domain not found" };
    }

    if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel") {
      return {
        success: false,
        error: "DNS records can only be managed for Vercel-hosted domains",
      };
    }

    try {
      const response = await vercelFetch<DnsRecord>(
        `/v4/domains/${encodeURIComponent(domain.domain)}/records`,
        {
          method: "POST",
          body: JSON.stringify(record),
        }
      );

      // Update local cache
      const currentRecords = domain.dnsRecords || [];
      await managedDomainsRepository.updateDnsRecords(domainId, [
        ...currentRecords,
        response,
      ]);

      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "dns_change",
        severity: "info",
        description: `Added ${record.type} record: ${record.name} -> ${record.value}`,
        detectedBy: "system",
      });

      return { success: true, record: response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add DNS record",
      };
    }
  }

  async deleteDnsRecord(
    domainId: string,
    recordId: string
  ): Promise<{ success: boolean; error?: string }> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) {
      return { success: false, error: "Domain not found" };
    }

    if (domain.registrar !== "vercel" || domain.nameserverMode !== "vercel") {
      return {
        success: false,
        error: "DNS records can only be managed for Vercel-hosted domains",
      };
    }

    try {
      await vercelFetch(
        `/v4/domains/${encodeURIComponent(domain.domain)}/records/${recordId}`,
        { method: "DELETE" }
      );

      // Update local cache
      const currentRecords = domain.dnsRecords || [];
      await managedDomainsRepository.updateDnsRecords(
        domainId,
        currentRecords.filter((r) => r.id !== recordId)
      );

      await managedDomainsRepository.createEvent({
        domainId,
        eventType: "dns_change",
        severity: "info",
        description: `Deleted DNS record: ${recordId}`,
        detectedBy: "system",
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete DNS record",
      };
    }
  }

  async getDomain(domainId: string, organizationId: string): Promise<ManagedDomain | null> {
    return (await managedDomainsRepository.findByIdAndOrg(domainId, organizationId)) || null;
  }

  async getDomainByName(domain: string): Promise<ManagedDomain | null> {
    return (await managedDomainsRepository.findByDomain(normalizeDomain(domain))) || null;
  }

  listDomains = (orgId: string) => managedDomainsRepository.listByOrganization(orgId);
  listUnassignedDomains = (orgId: string) => managedDomainsRepository.listUnassigned(orgId);
  getStats = (orgId: string) => managedDomainsRepository.getStats(orgId);

  async deleteDomain(
    domainId: string,
    organizationId: string
  ): Promise<{ success: boolean; error?: string }> {
    const domain = await managedDomainsRepository.findByIdAndOrg(
      domainId,
      organizationId
    );
    if (!domain) {
      return { success: false, error: "Domain not found" };
    }

    // For purchased domains, we cannot delete from Vercel
    // but we can remove from our system
    if (domain.registrar === "vercel" && domain.status === "active") {
      logger.warn("[DomainManagement] Removing purchased domain from system", {
        domain: domain.domain,
        note: "Domain still exists in Vercel account",
      });
    }

    const deleted = await managedDomainsRepository.deleteByOrg(
      domainId,
      organizationId
    );

    if (deleted) {
      logger.info("[DomainManagement] Domain removed", { domain: domain.domain });
    }

    return { success: deleted };
  }
}

export const domainManagementService = new DomainManagementService();

