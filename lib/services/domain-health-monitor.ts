import {
  managedDomainsRepository,
  type ManagedDomain,
} from "@/db/repositories/managed-domains";
import { domainModerationService } from "./domain-moderation";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/types/domains";

const HEALTH_CHECK_INTERVAL_HOURS = 6;
const EXPIRATION_WARNING_DAYS = 30;
const BATCH_SIZE = 50;
const MAX_RUNTIME_MS = 50000; // 50 seconds (leave buffer for Vercel's 60s timeout)

export interface HealthMonitorStats {
  domainsChecked: number;
  domainsLive: number;
  domainsDown: number;
  sslIssues: number;
  contentScanned: number;
  contentFlagged: number;
  expirationWarnings: number;
  errors: number;
  timedOut?: boolean;
  totalDomains?: number;
}

export interface HealthCheckBatchResult {
  domain: string;
  isLive: boolean;
  sslValid: boolean;
  responseTimeMs?: number;
  error?: string;
}

const createStats = (): HealthMonitorStats => ({
  domainsChecked: 0,
  domainsLive: 0,
  domainsDown: 0,
  sslIssues: 0,
  contentScanned: 0,
  contentFlagged: 0,
  expirationWarnings: 0,
  errors: 0,
  timedOut: false,
});

const toHealthCheckResult = (
  domain: string,
  result: {
    isLive: boolean;
    sslValid?: boolean;
    responseTimeMs?: number;
    error?: string;
  },
): HealthCheckBatchResult => ({
  domain,
  isLive: result.isLive,
  sslValid: result.sslValid ?? true,
  responseTimeMs: result.responseTimeMs,
  error: result.error,
});

class DomainHealthMonitorService {
  async runHealthChecks(): Promise<HealthMonitorStats> {
    const startTime = Date.now();
    const stats = createStats();

    logger.info("[DomainHealthMonitor] Starting health check run");

    try {
      const domainsToCheck =
        await managedDomainsRepository.listNeedingHealthCheck(
          HEALTH_CHECK_INTERVAL_HOURS,
        );
      stats.totalDomains = domainsToCheck.length;

      logger.info("[DomainHealthMonitor] Found domains to check", {
        count: domainsToCheck.length,
      });

      // Process in batches with timeout protection
      for (let i = 0; i < domainsToCheck.length; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          stats.timedOut = true;
          logger.warn("[DomainHealthMonitor] Timeout reached, stopping early", {
            processed: stats.domainsChecked,
            remaining: domainsToCheck.length - i,
          });
          break;
        }

        const batch = domainsToCheck.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch, stats);
      }

      // Only check expirations if we have time
      if (!stats.timedOut) {
        await this.checkExpirations(stats);
      }

      logger.info("[DomainHealthMonitor] Health check run complete", stats);
    } catch (error) {
      logger.error("[DomainHealthMonitor] Health check run failed", { error });
      stats.errors++;
    }

    return stats;
  }

  private async processBatch(
    domains: ManagedDomain[],
    stats: HealthMonitorStats,
  ): Promise<void> {
    await Promise.all(
      domains.map(async (d) => {
        try {
          const result = await domainModerationService.performHealthCheck(d.id);
          stats.domainsChecked++;
          result.isLive ? stats.domainsLive++ : stats.domainsDown++;
          if (result.sslValid === false) stats.sslIssues++;
          return toHealthCheckResult(d.domain, result);
        } catch (error) {
          stats.errors++;
          return toHealthCheckResult(d.domain, {
            isLive: false,
            sslValid: false,
            error: extractErrorMessage(error),
          });
        }
      }),
    );
  }

  private async checkExpirations(stats: HealthMonitorStats): Promise<void> {
    const expiringDomains =
      await managedDomainsRepository.listExpiringWithinDays(
        EXPIRATION_WARNING_DAYS,
      );

    for (const domain of expiringDomains) {
      stats.expirationWarnings++;

      // Create expiration warning event if not already warned recently
      const events = await managedDomainsRepository.listEvents(domain.id);
      const recentWarning = events.find(
        (e) =>
          e.eventType === "expiration_warning" &&
          e.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Within last 7 days
      );

      if (!recentWarning) {
        const daysUntilExpiry = domain.expiresAt
          ? Math.ceil(
              (domain.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
            )
          : 0;

        await managedDomainsRepository.createEvent({
          domainId: domain.id,
          eventType: "expiration_warning",
          severity: daysUntilExpiry <= 7 ? "high" : "medium",
          description: `Domain expires in ${daysUntilExpiry} days`,
          detectedBy: "health_monitor",
        });

        logger.warn("[DomainHealthMonitor] Domain expiring soon", {
          domain: domain.domain,
          daysUntilExpiry,
          expiresAt: domain.expiresAt,
        });
      }
    }
  }

  async runContentScans(): Promise<HealthMonitorStats> {
    const startTime = Date.now();
    const stats = createStats();

    logger.info("[DomainHealthMonitor] Starting content scan run");

    try {
      const activeDomains =
        await managedDomainsRepository.listByStatus("active");
      const liveDomains = activeDomains.filter((d) => d.isLive);
      stats.totalDomains = liveDomains.length;

      logger.info("[DomainHealthMonitor] Found live domains to scan", {
        count: liveDomains.length,
      });

      for (const domain of liveDomains) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          stats.timedOut = true;
          logger.warn("[DomainHealthMonitor] Content scan timeout", {
            scanned: stats.contentScanned,
            remaining: liveDomains.length - stats.contentScanned,
          });
          break;
        }

        try {
          const result = await domainModerationService.scanDomainContent(
            domain.id,
          );
          stats.contentScanned++;

          if (result.status === "flagged") {
            stats.contentFlagged++;
            logger.warn("[DomainHealthMonitor] Content flagged", {
              domain: domain.domain,
              flags: result.flags.length,
            });
          } else if (result.status === "failed") {
            stats.errors++;
            logger.warn("[DomainHealthMonitor] Content scan failed", {
              domain: domain.domain,
              error: result.error,
            });
          }
        } catch (error) {
          stats.errors++;
          logger.error("[DomainHealthMonitor] Content scan failed", {
            domain: domain.domain,
            error: extractErrorMessage(error),
          });
        }
      }

      logger.info("[DomainHealthMonitor] Content scan run complete", stats);
    } catch (error) {
      logger.error("[DomainHealthMonitor] Content scan run failed", { error });
      stats.errors++;
    }

    return stats;
  }

  async checkSingleDomain(
    domainId: string,
  ): Promise<HealthCheckBatchResult | null> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return null;
    const result = await domainModerationService.performHealthCheck(domainId);
    return toHealthCheckResult(domain.domain, result);
  }

  async getHealthSummary(): Promise<{
    totalDomains: number;
    activeDomains: number;
    liveDomains: number;
    downDomains: number;
    pendingReview: number;
    suspended: number;
    expiringSoon: number;
    sslIssues: number;
  }> {
    const [active, pending, suspended, expiring] = await Promise.all([
      managedDomainsRepository.listByStatus("active"),
      managedDomainsRepository.listByModerationStatus("pending_review"),
      managedDomainsRepository.listByModerationStatus("suspended"),
      managedDomainsRepository.listExpiringWithinDays(EXPIRATION_WARNING_DAYS),
    ]);

    const liveDomains = active.filter((d) => d.isLive);
    const downDomains = active.filter((d) => !d.isLive);
    const sslIssues = active.filter(
      (d) => d.sslStatus === "error" || d.sslStatus === "pending",
    );

    return {
      totalDomains: active.length + pending.length + suspended.length,
      activeDomains: active.length,
      liveDomains: liveDomains.length,
      downDomains: downDomains.length,
      pendingReview: pending.length,
      suspended: suspended.length,
      expiringSoon: expiring.length,
      sslIssues: sslIssues.length,
    };
  }

  async getDomainsWithIssues(): Promise<{
    down: ManagedDomain[];
    sslIssues: ManagedDomain[];
    flagged: ManagedDomain[];
    expiringSoon: ManagedDomain[];
  }> {
    const [active, flagged, expiring] = await Promise.all([
      managedDomainsRepository.listByStatus("active"),
      managedDomainsRepository.listNeedingReview(),
      managedDomainsRepository.listExpiringWithinDays(EXPIRATION_WARNING_DAYS),
    ]);

    return {
      down: active.filter((d) => !d.isLive),
      sslIssues: active.filter(
        (d) => d.sslStatus === "error" || d.sslStatus === "pending",
      ),
      flagged,
      expiringSoon: expiring,
    };
  }
}

export const domainHealthMonitorService = new DomainHealthMonitorService();
