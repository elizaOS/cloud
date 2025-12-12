/**
 * Domain Health Monitor Service
 *
 * Background service that periodically checks domain health and SSL status.
 * Designed to be run as a cron job.
 *
 * Features:
 * - DNS resolution verification
 * - HTTP/HTTPS connectivity checks
 * - SSL certificate validation
 * - Content moderation scans
 * - Expiration monitoring
 */

import {
  managedDomainsRepository,
  type ManagedDomain,
} from "@/db/repositories/managed-domains";
import { domainModerationService } from "./domain-moderation";
import { logger } from "@/lib/utils/logger";

// Configuration
const HEALTH_CHECK_INTERVAL_HOURS = 6; // Check domains every 6 hours
const CONTENT_SCAN_INTERVAL_HOURS = 24; // Scan content every 24 hours
const EXPIRATION_WARNING_DAYS = 30; // Warn 30 days before expiration
const BATCH_SIZE = 50; // Process domains in batches

export interface HealthMonitorStats {
  domainsChecked: number;
  domainsLive: number;
  domainsDown: number;
  sslIssues: number;
  contentScanned: number;
  contentFlagged: number;
  expirationWarnings: number;
  errors: number;
}

export interface HealthCheckBatchResult {
  domain: string;
  isLive: boolean;
  sslValid: boolean;
  responseTimeMs?: number;
  error?: string;
}

class DomainHealthMonitorService {
  private isRunning = false;

  /**
   * Run health checks for all domains needing attention
   */
  async runHealthChecks(): Promise<HealthMonitorStats> {
    if (this.isRunning) {
      logger.warn("[DomainHealthMonitor] Already running, skipping");
      return {
        domainsChecked: 0,
        domainsLive: 0,
        domainsDown: 0,
        sslIssues: 0,
        contentScanned: 0,
        contentFlagged: 0,
        expirationWarnings: 0,
        errors: 0,
      };
    }

    this.isRunning = true;
    const stats: HealthMonitorStats = {
      domainsChecked: 0,
      domainsLive: 0,
      domainsDown: 0,
      sslIssues: 0,
      contentScanned: 0,
      contentFlagged: 0,
      expirationWarnings: 0,
      errors: 0,
    };

    logger.info("[DomainHealthMonitor] Starting health check run");

    try {
      // Get domains needing health check
      const domainsToCheck = await managedDomainsRepository.listNeedingHealthCheck(
        HEALTH_CHECK_INTERVAL_HOURS
      );

      logger.info("[DomainHealthMonitor] Found domains to check", {
        count: domainsToCheck.length,
      });

      // Process in batches
      for (let i = 0; i < domainsToCheck.length; i += BATCH_SIZE) {
        const batch = domainsToCheck.slice(i, i + BATCH_SIZE);
        await this.processBatch(batch, stats);
      }

      // Check for expiring domains
      await this.checkExpirations(stats);

      logger.info("[DomainHealthMonitor] Health check run complete", stats);
    } catch (error) {
      logger.error("[DomainHealthMonitor] Health check run failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      stats.errors++;
    } finally {
      this.isRunning = false;
    }

    return stats;
  }

  /**
   * Process a batch of domains for health checks
   */
  private async processBatch(
    domains: ManagedDomain[],
    stats: HealthMonitorStats
  ): Promise<void> {
    const checkPromises = domains.map(async (domain) => {
      try {
        const result = await domainModerationService.performHealthCheck(domain.id);
        stats.domainsChecked++;

        if (result.isLive) {
          stats.domainsLive++;
        } else {
          stats.domainsDown++;
        }

        if (result.sslValid === false) {
          stats.sslIssues++;
        }

        return {
          domain: domain.domain,
          isLive: result.isLive,
          sslValid: result.sslValid ?? true,
          responseTimeMs: result.responseTimeMs,
          error: result.error,
        };
      } catch (error) {
        stats.errors++;
        return {
          domain: domain.domain,
          isLive: false,
          sslValid: false,
          error: error instanceof Error ? error.message : "Check failed",
        };
      }
    });

    await Promise.all(checkPromises);
  }

  /**
   * Check for domains expiring soon
   */
  private async checkExpirations(stats: HealthMonitorStats): Promise<void> {
    const expiringDomains = await managedDomainsRepository.listExpiringWithinDays(
      EXPIRATION_WARNING_DAYS
    );

    for (const domain of expiringDomains) {
      stats.expirationWarnings++;

      // Create expiration warning event if not already warned recently
      const events = await managedDomainsRepository.listEvents(domain.id);
      const recentWarning = events.find(
        (e) =>
          e.eventType === "expiration_warning" &&
          e.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Within last 7 days
      );

      if (!recentWarning) {
        const daysUntilExpiry = domain.expiresAt
          ? Math.ceil(
              (domain.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
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

  /**
   * Run content scans for all active domains
   */
  async runContentScans(): Promise<HealthMonitorStats> {
    const stats: HealthMonitorStats = {
      domainsChecked: 0,
      domainsLive: 0,
      domainsDown: 0,
      sslIssues: 0,
      contentScanned: 0,
      contentFlagged: 0,
      expirationWarnings: 0,
      errors: 0,
    };

    logger.info("[DomainHealthMonitor] Starting content scan run");

    try {
      // Get all active, live domains
      const activeDomains = await managedDomainsRepository.listByStatus("active");
      const liveDomains = activeDomains.filter((d) => d.isLive);

      logger.info("[DomainHealthMonitor] Found live domains to scan", {
        count: liveDomains.length,
      });

      // Process content scans (slower, so do one at a time)
      for (const domain of liveDomains) {
        try {
          const result = await domainModerationService.scanDomainContent(domain.id);
          stats.contentScanned++;

          if (!result.clean) {
            stats.contentFlagged++;
            logger.warn("[DomainHealthMonitor] Content flagged", {
              domain: domain.domain,
              flags: result.flags.length,
            });
          }
        } catch (error) {
          stats.errors++;
          logger.error("[DomainHealthMonitor] Content scan failed", {
            domain: domain.domain,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      logger.info("[DomainHealthMonitor] Content scan run complete", stats);
    } catch (error) {
      logger.error("[DomainHealthMonitor] Content scan run failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      stats.errors++;
    }

    return stats;
  }

  /**
   * Check a single domain immediately (for API use)
   */
  async checkSingleDomain(domainId: string): Promise<HealthCheckBatchResult | null> {
    const domain = await managedDomainsRepository.findById(domainId);
    if (!domain) return null;

    const result = await domainModerationService.performHealthCheck(domainId);

    return {
      domain: domain.domain,
      isLive: result.isLive,
      sslValid: result.sslValid ?? true,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
    };
  }

  /**
   * Get summary of domain health across the platform
   */
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
      (d) => d.sslStatus === "error" || d.sslStatus === "pending"
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

  /**
   * Get domains with issues (for admin dashboard)
   */
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
        (d) => d.sslStatus === "error" || d.sslStatus === "pending"
      ),
      flagged,
      expiringSoon: expiring,
    };
  }
}

export const domainHealthMonitorService = new DomainHealthMonitorService();

